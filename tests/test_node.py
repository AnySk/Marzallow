"""The node service (node/), driven by the panel's own client (app/xray/node.py).

A real node runs in-process with mutual TLS and the stub xray; a bare gRPC
server stands in for xray's API port, so the panel's API connection (which pins
the node's certificate and checks its name) is exercised too.
"""
import json
import os
import socket
import ssl
import subprocess
import sys
import threading
import time
from concurrent import futures
from copy import deepcopy
from pathlib import Path

import grpc
import pytest
import requests
import uvicorn

from node.certificate import ensure_certificate
from node.config import NodeXRayConfig
from node.core import XRayCore
from node.service import NodeService, create_app

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = Path(__file__).resolve().parent / "fixtures"


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _panel_config():
    from app import xray
    return deepcopy(xray.config)


def test_node_config_replaces_the_api_inbound():
    panel = _panel_config()
    assert any(i["tag"] == "API_INBOUND" for i in panel["inbounds"])  # the panel's own one

    config = NodeXRayConfig(panel.to_json(), peer_ip="203.0.113.7", api_host="0.0.0.0", api_port=62051,
                            ssl_cert_file="/n/cert.pem", ssl_key_file="/n/key.pem")
    api = [i for i in config["inbounds"] if i["tag"] == "API_INBOUND"]
    assert len(api) == 1 and api[0] is config["inbounds"][0]
    assert api[0]["port"] == 62051
    assert api[0]["streamSettings"]["tlsSettings"]["certificates"] == [
        {"certificateFile": "/n/cert.pem", "keyFile": "/n/key.pem"}]
    rules = config["routing"]["rules"]
    assert rules[0]["source"] == ["127.0.0.1", "203.0.113.7"] and rules[0]["outboundTag"] == "API"
    assert sum(r.get("outboundTag") == "API" for r in rules) == 1
    # the user inbounds are passed through
    assert {i["tag"] for i in config["inbounds"][1:]} == {i["tag"] for i in panel["inbounds"]} - {"API_INBOUND"}


def test_node_config_inbounds_filter():
    panel = _panel_config()
    keep = panel["inbounds"][1]["tag"] if panel["inbounds"][0]["tag"] == "API_INBOUND" else panel["inbounds"][0]["tag"]
    config = NodeXRayConfig(panel.to_json(), peer_ip="1.2.3.4", api_host="0.0.0.0", api_port=1,
                            ssl_cert_file="c", ssl_key_file="k", inbounds=[keep])
    assert [i["tag"] for i in config["inbounds"]] == ["API_INBOUND", keep]


def test_node_config_rejects_garbage():
    for bad in ("not json", '{"inbounds": 5}'):
        with pytest.raises(ValueError):
            NodeXRayConfig(bad, peer_ip="1.2.3.4", api_host="0.0.0.0", api_port=1,
                           ssl_cert_file="c", ssl_key_file="k")


def test_node_certificate_is_created_once(tmp_path):
    cert_file, key_file = str(tmp_path / "ssl_cert.pem"), str(tmp_path / "ssl_key.pem")
    assert ensure_certificate(cert_file, key_file)
    assert not ensure_certificate(cert_file, key_file)  # kept on the next start
    assert os.stat(key_file).st_mode & 0o077 == 0


# "marzban": the X.509 v1 certificates Marzban and Marzban-node generate (tests/fixtures/marzban_*.pem),
# which strict TLS verification rejects; existing installs keep using them after switching.
@pytest.fixture(scope="module", params=["marzallow", "marzban"])
def node_server(request, tmp_path_factory):
    from app.utils.crypto import generate_certificate

    tmp = tmp_path_factory.mktemp("node")
    cert_file, key_file = str(tmp / "ssl_cert.pem"), str(tmp / "ssl_key.pem")
    if request.param == "marzallow":
        ensure_certificate(cert_file, key_file)
        panel = generate_certificate()
    else:
        Path(cert_file).write_text((FIXTURES / "marzban_node_cert.pem").read_text())
        Path(key_file).write_text((FIXTURES / "marzban_node_key.pem").read_text())
        panel = {"cert": (FIXTURES / "marzban_panel_cert.pem").read_text(),
                 "key": (FIXTURES / "marzban_panel_key.pem").read_text()}
    (tmp / "panel.pem").write_text(panel["cert"])

    port, api_port = _free_port(), _free_port()
    core = XRayCore(str(FIXTURES / "xray"), str(FIXTURES))
    service = NodeService(core, api_host="127.0.0.1", api_port=api_port,
                          ssl_cert_file=cert_file, ssl_key_file=key_file)
    server = uvicorn.Server(uvicorn.Config(
        create_app(service), host="127.0.0.1", port=port, log_level="warning",
        ssl_certfile=cert_file, ssl_keyfile=key_file,
        ssl_ca_certs=str(tmp / "panel.pem"), ssl_cert_reqs=ssl.CERT_REQUIRED,
    ))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    # stands in for xray's API inbound, which the stub doesn't open
    grpc_server = grpc.server(futures.ThreadPoolExecutor(max_workers=2))
    grpc_server.add_secure_port(f"127.0.0.1:{api_port}", grpc.ssl_server_credentials(
        [(Path(key_file).read_bytes(), Path(cert_file).read_bytes())]))
    grpc_server.start()

    for _ in range(100):
        if server.started:
            break
        time.sleep(0.05)
    assert server.started

    yield {"port": port, "api_port": api_port, "panel": panel, "service": service, "tmp": tmp,
           "cert_file": cert_file}

    core.stop()
    grpc_server.stop(0)
    server.should_exit = True
    thread.join(timeout=5)


def _client(node_server, cert=None):
    from app.xray.node import ReSTXRayNode

    cert = cert or node_server["panel"]
    return ReSTXRayNode("127.0.0.1", node_server["port"], node_server["api_port"], cert["key"], cert["cert"])


def test_panel_controls_the_node(node_server):
    from app.xray.node import NodeAPIError

    node = _client(node_server)
    node.connect()
    assert node.connected
    assert node.get_version() == "25.10.15"
    assert node.started is False

    node.start(_panel_config())  # also opens the API channel: pinned cert + "Gozargah" name check
    assert node.started is True
    assert node.api is not None

    with node.get_logs() as logs:
        for _ in range(50):
            if any("stub xray running" in chunk for chunk in logs):
                break
            time.sleep(0.1)
        assert any("stub xray running" in chunk for chunk in logs)

    node.start(_panel_config())  # already started: the client falls back to a restart
    node.restart(_panel_config())
    assert node.started is True

    bad = _panel_config()
    bad["log"] = {"loglevel": "warning", "note": "FAIL_TO_START"}
    with pytest.raises(NodeAPIError) as exc:
        node.restart(bad)
    assert exc.value.status_code == 503
    assert "stub rejected the config" in exc.value.detail
    assert node.started is False

    node.restart(_panel_config())
    node.stop()
    assert node.started is False
    node.disconnect()
    assert not node.connected


def test_a_new_panel_takes_over(node_server):
    from app.xray.node import NodeAPIError

    first, second = _client(node_server), _client(node_server)
    first.connect()
    first.start(_panel_config())
    second.connect()
    assert node_server["service"].core.started is False  # the previous panel's xray is stopped
    assert not first.connected
    with pytest.raises(NodeAPIError) as exc:
        first.make_request("/stop", timeout=3)
    assert exc.value.status_code == 403
    second.disconnect()


def test_node_rejects_other_clients(node_server):
    from app.utils.crypto import generate_certificate
    from app.xray.node import NodeAPIError

    url = f"https://127.0.0.1:{node_server['port']}/"
    with pytest.raises(requests.exceptions.RequestException):
        requests.post(url, verify=False, timeout=3)  # no client certificate

    stranger = _client(node_server, cert=generate_certificate())
    with pytest.raises(NodeAPIError):
        stranger.connect()


def test_node_rejects_a_bad_config(node_server):
    node = _client(node_server)
    node.connect()
    res = node.session.post(f"https://127.0.0.1:{node_server['port']}/start", timeout=5,
                            json={"session_id": node._session_id, "config": "{nope"})
    assert res.status_code == 422
    node.disconnect()


def _run_node(*args, env=None):
    clean = {k: v for k, v in os.environ.items()
             if k not in ("SSL_CERT_FILE", "SSL_KEY_FILE", "SSL_CLIENT_CERT_FILE", "XRAY_EXECUTABLE_PATH")}
    return subprocess.run([sys.executable, *args], cwd=ROOT, env={**clean, **(env or {})},
                          capture_output=True, text=True, timeout=60)


def test_node_entry_point_does_not_load_the_panel():
    code = "import sys, node.__main__; sys.exit('app' in sys.modules or 'config' in sys.modules)"
    assert _run_node("-c", code).returncode == 0


def test_node_refuses_to_start_without_the_panel_certificate(tmp_path):
    env = {"SSL_CERT_FILE": str(tmp_path / "cert.pem"), "SSL_KEY_FILE": str(tmp_path / "key.pem"),
           "SSL_CLIENT_CERT_FILE": str(tmp_path / "missing.pem"),
           "XRAY_EXECUTABLE_PATH": str(FIXTURES / "xray")}
    for args in (("-m", "node"), ("main.py", "node")):
        result = _run_node(*args, env=env)
        assert result.returncode == 1, result.stderr
        assert "panel's certificate" in result.stderr
    assert (tmp_path / "cert.pem").is_file()  # its own certificate was created


@pytest.mark.parametrize("fix", [False, True])
def test_rpyc_node_with_marzban_certificates(fix, monkeypatch):
    # Older Marzban-node installs use the RPyC protocol; their v1 certificates must verify too.
    import rpyc
    from rpyc.utils.authenticators import SSLAuthenticator
    from rpyc.utils.server import ThreadedServer

    from app.xray.node import RPyCXRayNode

    port = _free_port()
    server = ThreadedServer(rpyc.Service, hostname="127.0.0.1", port=port, authenticator=SSLAuthenticator(
        keyfile=str(FIXTURES / "marzban_node_key.pem"), certfile=str(FIXTURES / "marzban_node_cert.pem"),
        ca_certs=str(FIXTURES / "marzban_panel_cert.pem"),
        ssl_version=ssl.PROTOCOL_TLS_SERVER))  # like Marzban-node's (older Python, not strict)
    threading.Thread(target=server.start, daemon=True).start()
    try:
        if not fix:  # what rpyc does by default: a strict context
            real = rpyc.ssl_connect
            monkeypatch.setattr(rpyc, "ssl_connect", lambda *a, ssl_version=None, **k: real(*a, **k))
        node = RPyCXRayNode("127.0.0.1", port, 1, (FIXTURES / "marzban_panel_key.pem").read_text(),
                            (FIXTURES / "marzban_panel_cert.pem").read_text())
        if fix:
            node.connect()
            assert node.connected
        else:
            with pytest.raises(ssl.SSLError, match="invalid CA certificate"):
                node.connect()
    finally:
        server.close()
