import time


def test_create_get_modify_user(client, auth, make_user):
    user = make_user("alice")
    assert user["status"] == "active"
    assert set(user["proxies"]) == {"vless", "vmess", "trojan", "shadowsocks"}
    assert user["subscription_url"].startswith("https://sub.example.com/sub/")

    r = client.put("/api/user/alice", headers=auth, json={"data_limit": 20 * 1024 ** 3, "note": "vip"})
    assert r.status_code == 200, r.text
    assert r.json()["note"] == "vip"
    assert r.json()["data_limit"] == 20 * 1024 ** 3

    assert client.get("/api/user/alice", headers=auth).json()["note"] == "vip"


def test_duplicate_username_conflicts(client, auth, make_user):
    make_user("bob")
    r = client.post("/api/user", headers=auth, json={"username": "bob", "proxies": {"vless": {}}})
    assert r.status_code == 409


def test_invalid_username_rejected(client, auth):
    r = client.post("/api/user", headers=auth, json={"username": "no spaces!", "proxies": {"vless": {}}})
    assert r.status_code == 422


def test_list_search_and_usage(client, auth, make_user):
    make_user("carol")
    make_user("carl")
    r = client.get("/api/users", headers=auth, params={"search": "car"})
    assert r.status_code == 200
    assert {u["username"] for u in r.json()["users"]} == {"carol", "carl"}
    assert client.get("/api/user/carol/usage", headers=auth).status_code == 200
    assert client.get("/api/users/usage", headers=auth).status_code == 200


def test_reset_and_revoke(client, auth, make_user):
    user = make_user("dave")
    assert client.post("/api/user/dave/reset", headers=auth).json()["used_traffic"] == 0

    old_path = "/" + user["subscription_url"].split("://", 1)[1].split("/", 1)[1]
    assert client.get(old_path).status_code == 200

    time.sleep(1.1)  # subscription tokens carry a timestamp with 1-second resolution
    r = client.post("/api/user/dave/revoke_sub", headers=auth)
    assert r.status_code == 200
    assert r.json()["subscription_url"] != user["subscription_url"]
    assert client.get(old_path).status_code != 200


def test_on_hold_user(client, auth, make_user):
    user = make_user("erin", status="on_hold", expire=None, on_hold_expire_duration=86400 * 30)
    assert user["status"] == "on_hold"
    assert user["on_hold_expire_duration"] == 86400 * 30


def test_delete_user_owned_by_env_sudo_admin(client, auth):
    # Regression: users created by the .env sudo admin have no DB admin, and
    # deleting them used to fail with a 500 after the row was already gone.
    r = client.post("/api/user", headers=auth, json={"username": "frank", "proxies": {"vless": {}}})
    assert r.status_code == 200, r.text
    assert client.delete("/api/user/frank", headers=auth).status_code == 200
    assert client.get("/api/user/frank", headers=auth).status_code == 404


def test_user_templates(client, auth):
    r = client.post("/api/user_template", headers=auth,
                    json={"name": "monthly", "data_limit": 50 * 1024 ** 3, "expire_duration": 30 * 86400})
    assert r.status_code == 200, r.text
    template_id = r.json()["id"]
    assert any(t["name"] == "monthly" for t in client.get("/api/user_template", headers=auth).json())
    assert client.delete(f"/api/user_template/{template_id}", headers=auth).status_code == 200


def test_omitted_inbounds_enable_all_protocol_inbounds(make_user):
    # Regression: Pydantic v2 skipped validate_inbounds for the default value,
    # so API users created without "inbounds" had every inbound excluded.
    user = make_user("gina", proxies={"vless": {}, "vmess": {}})
    assert user["inbounds"] == {"vless": ["VLESS TCP REALITY"], "vmess": ["VMESS WS"]}
    assert user["excluded_inbounds"] == {"vless": [], "vmess": []}
    assert len(user["links"]) == 2
