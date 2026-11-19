from xray_api import types as xray_types
from xray_api.proto.app.stats.command import command_pb2


def test_system_endpoints(client, auth):
    for path in ("/api/system", "/api/inbounds", "/api/hosts", "/api/core", "/api/core/config", "/api/nodes"):
        assert client.get(path, headers=auth).status_code == 200, path


def test_inbounds_from_config(client, auth):
    inbounds = client.get("/api/inbounds", headers=auth).json()
    assert set(inbounds) == {"vless", "vmess", "trojan", "shadowsocks"}


def test_core_logs_websocket(client, sudo_token):
    with client.websocket_connect(f"/api/core/logs?token={sudo_token}&interval=0.2") as ws:
        assert "stub xray running" in ws.receive_text()


def test_core_logs_websocket_requires_token(client):
    from starlette.websockets import WebSocketDisconnect
    import pytest

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/api/core/logs") as ws:
            ws.receive_text()


def test_openapi_operation_ids_use_route_names(client):
    # Regression: newer FastAPI hides included routes from app.routes, which
    # silently broke the old "route name as operation id" loop.
    ops = {
        op["operationId"]
        for path in client.get("/openapi.json").json()["paths"].values()
        for op in path.values()
    }
    assert {"get_user", "add_user", "admin_token", "get_system_stats"} <= ops


def test_cors_is_same_origin_by_default(client):
    r = client.options("/api/admin/token", headers={
        "Origin": "https://evil.example.com",
        "Access-Control-Request-Method": "POST",
    })
    assert "access-control-allow-origin" not in r.headers


def test_protobuf_gencode_works_with_runtime():
    req = command_pb2.QueryStatsRequest(pattern="user>>>", reset=True)
    assert command_pb2.QueryStatsRequest.FromString(req.SerializeToString()).pattern == "user>>>"
    account = xray_types.account.VLESSAccount(email="a@b", id="35e4e39c-7d5c-4f4b-8b71-558e4f37ff53")
    assert account.message is not None
