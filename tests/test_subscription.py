import base64
import json

import pytest
import yaml

from app.routers.subscription import _version


@pytest.fixture
def sub_path(make_user):
    user = make_user("subuser")
    return "/" + user["subscription_url"].split("://", 1)[1].split("/", 1)[1]


def _decode_links(text):
    return base64.b64decode(text).decode().splitlines()


@pytest.mark.parametrize("user_agent, kind", [
    ("", "links"),
    ("v2rayNG/1.8.5", "links"),
    ("v2rayNG/1.8.20", "json"),
    ("v2rayNG/1.10.2", "json"),
    ("v2rayN/6.5", "links"),   # 6.5 < 6.40: numeric, not lexicographic, comparison
    ("v2rayN/7.1", "json"),
    ("Happ/1.70.0", "json"),
    ("Streisand/1.6", "json"),
    ("clash.meta", "yaml"),
    ("SFA/1.9", "json"),
])
def test_subscription_by_user_agent(client, sub_path, user_agent, kind):
    r = client.get(sub_path, headers={"User-Agent": user_agent})
    assert r.status_code == 200, r.text
    if kind == "links":
        links = _decode_links(r.text)
        assert {link.split("://")[0] for link in links} == {"vless", "vmess", "trojan", "ss"}
    elif kind == "json":
        json.loads(r.text)
    else:
        assert yaml.safe_load(r.text)["proxies"]


def test_subscription_headers(client, sub_path):
    r = client.get(sub_path)
    assert "subscription-userinfo" in r.headers
    assert "profile-update-interval" in r.headers


def test_browser_gets_html_page(client, sub_path):
    r = client.get(sub_path, headers={"User-Agent": "Mozilla/5.0", "Accept": "text/html"})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/html")


@pytest.mark.parametrize("client_type", ["clash", "clash-meta", "sing-box", "outline", "v2ray", "v2ray-json"])
def test_subscription_by_client_type(client, sub_path, client_type):
    r = client.get(f"{sub_path}/{client_type}")
    assert r.status_code == 200, r.text


def test_subscription_info_and_usage(client, sub_path):
    info = client.get(f"{sub_path}/info")
    assert info.status_code == 200
    assert info.json()["username"] == "subuser"
    assert client.get(f"{sub_path}/usage").status_code == 200


def test_invalid_token_rejected(client):
    assert client.get("/sub/not-a-real-token").status_code in (400, 401, 404)


@pytest.mark.parametrize("a, b, expected", [
    ("6.5", "6.40", False),
    ("6.40", "6.40", True),
    ("1.8.29", "1.8.18", True),
    ("1.10.0", "1.8.29", True),
])
def test_version_compare(a, b, expected):
    assert (_version(a) >= _version(b)) is expected
