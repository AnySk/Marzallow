import base64
import json
import subprocess
from copy import deepcopy
from pathlib import Path

import pytest

from app.utils.crypto import get_x25519_public_key
from app.xray.config import XRayConfig
from app.xray.core import XRayCore

FIXTURES = Path(__file__).parent / "fixtures"


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


# RFC 7748 section 6.1 (Alice)
RFC_PRIVATE = _b64(bytes.fromhex("77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a"))
RFC_PUBLIC = _b64(bytes.fromhex("8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a"))


def test_x25519_public_key_derivation():
    assert get_x25519_public_key(RFC_PRIVATE) == RFC_PUBLIC


def test_x25519_rejects_bad_key():
    with pytest.raises(ValueError):
        get_x25519_public_key("too-short")


@pytest.mark.parametrize("output", [
    # xray < 25.3
    f"Private key: {RFC_PRIVATE}\nPublic key: {RFC_PUBLIC}\n",
    # xray 25.3 - 25.x
    f"PrivateKey: {RFC_PRIVATE}\nPassword: {RFC_PUBLIC}\nHash32: abc\n",
    # xray 26.x
    f"PrivateKey: {RFC_PRIVATE}\nPassword (PublicKey): {RFC_PUBLIC}\nHash32: abc\n",
])
def test_get_x25519_parses_all_xray_output_formats(monkeypatch, output):
    # Regression (upstream #1938): newer xray output broke the exact-match parser.
    monkeypatch.setattr(subprocess, "check_output", lambda *a, **k: output.encode())
    core = XRayCore.__new__(XRayCore)
    core.executable_path = "xray"
    assert core.get_x25519() == {"private_key": RFC_PRIVATE, "public_key": RFC_PUBLIC}


def _reality_config(**reality):
    config = json.loads((FIXTURES / "xray_config.json").read_text())
    inbound = config["inbounds"][0]
    inbound["streamSettings"]["realitySettings"] = {
        "serverNames": ["example.com"], "shortIds": ["", "abcd"], **reality,
    }
    return config


@pytest.mark.parametrize("reality, expected_pbk", [
    ({"privateKey": RFC_PRIVATE}, RFC_PUBLIC),                        # derived, no subprocess
    ({"privateKey": RFC_PRIVATE, "publicKey": "explicit"}, "explicit"),
    ({"privateKey": RFC_PRIVATE, "password": "xray26-name"}, "xray26-name"),
])
def test_reality_public_key_resolution(reality, expected_pbk):
    config = XRayConfig(deepcopy(_reality_config(**reality)), api_port=10085)
    assert config.inbounds_by_tag["VLESS TCP REALITY"]["pbk"] == expected_pbk


def test_reality_fingerprint_from_config():
    # upstream #2072: fp was hardcoded to chrome
    config = XRayConfig(_reality_config(privateKey=RFC_PRIVATE, fingerprint="firefox"), api_port=10085)
    assert config.inbounds_by_tag["VLESS TCP REALITY"]["fp"] == "firefox"
    default = XRayConfig(_reality_config(privateKey=RFC_PRIVATE), api_port=10085)
    assert default.inbounds_by_tag["VLESS TCP REALITY"]["fp"] == "chrome"


def test_reality_requires_a_key():
    with pytest.raises(ValueError, match="privateKey"):
        XRayConfig(_reality_config(), api_port=10085)


# --- fallbacks (upstream #1963, #1987) -----------------------------------------

OTHER_PRIVATE = _b64(bytes(range(1, 33)))


def _fallback_config():
    return {
        "inbounds": [
            {   # REALITY on 443: falls back to a ws inbound and (for non-REALITY
                # clients) hands off to an inner REALITY inbound with its own keys
                "tag": "OUTER", "port": 443, "protocol": "vless",
                "settings": {"clients": [], "decryption": "none", "fallbacks": [{"path": "/ws", "dest": "@ws"}]},
                "streamSettings": {"network": "tcp", "security": "reality", "realitySettings": {
                    "target": "@inner", "serverNames": ["a.example"], "privateKey": RFC_PRIVATE, "shortIds": ["aa"]}},
            },
            {   # plain TLS on 8443 with its own fallback
                "tag": "TLS-PARENT", "port": 8443, "protocol": "trojan",
                "settings": {"clients": [], "fallbacks": [{"dest": "@grpc"}]},
                "streamSettings": {"network": "tcp", "security": "tls", "tlsSettings": {}},
            },
            {"tag": "WS-CHILD", "listen": "@ws", "protocol": "vmess", "settings": {"clients": []},
             "streamSettings": {"network": "ws", "wsSettings": {"path": "/ws"}}},
            {"tag": "GRPC-CHILD", "listen": "@grpc", "protocol": "vless", "settings": {"clients": []},
             "streamSettings": {"network": "grpc", "grpcSettings": {"serviceName": "g"}}},
            {"tag": "INNER", "listen": "@inner", "protocol": "vless", "settings": {"clients": []},
             "streamSettings": {"network": "xhttp", "security": "reality", "realitySettings": {
                 "serverNames": ["b.example"], "privateKey": OTHER_PRIVATE, "shortIds": ["bb"]}}},
        ],
        "outbounds": [{"protocol": "freedom", "tag": "DIRECT"}],
    }


def test_fallback_children_inherit_from_their_own_parent():
    inbounds = XRayConfig(_fallback_config(), api_port=10085).inbounds_by_tag
    ws, grpc = inbounds["WS-CHILD"], inbounds["GRPC-CHILD"]
    assert (ws["port"], ws["tls"], ws["pbk"], ws["sni"]) == (443, "reality", RFC_PUBLIC, ["a.example"])
    assert (grpc["port"], grpc["tls"]) == (8443, "tls")
    assert ws["is_fallback"] and grpc["is_fallback"]


def test_reality_behind_reality_keeps_its_own_keys():
    inner = XRayConfig(_fallback_config(), api_port=10085).inbounds_by_tag["INNER"]
    assert inner["port"] == 443
    assert inner["pbk"] == get_x25519_public_key(OTHER_PRIVATE) != RFC_PUBLIC
    assert inner["sni"] == ["b.example"] and inner["sids"] == ["bb"]


def test_global_fallback_inbound_still_supported(monkeypatch):
    import sys

    # `app.xray.config` the attribute is the loaded XRayConfig; patch the module
    monkeypatch.setattr(sys.modules["app.xray.config"], "XRAY_FALLBACKS_INBOUND_TAG", "TLS-PARENT")
    config = _fallback_config()
    config["inbounds"][2]["listen"] = "127.0.0.1"  # no @socket match -> global fallback
    ws = XRayConfig(config, api_port=10085).inbounds_by_tag["WS-CHILD"]
    assert (ws["port"], ws["tls"]) == (8443, "tls")
