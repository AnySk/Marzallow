"""Subscription templates edited in the dashboard and assigned to users and hosts."""
import json

import pytest
import yaml

V2RAY = "/api/subscription-templates"


def _sub_path(user):
    return "/" + user["subscription_url"].split("://", 1)[1].split("/", 1)[1]


def _v2ray_template(marker, extra=""):
    return json.dumps({
        "remarks": "x",
        "log": {"loglevel": "warning"},
        "dns": {"servers": [marker]},
        "outbounds": [{"tag": "direct", "protocol": "freedom"}],
        "routing": {"rules": []},
    }, indent=2).replace('"x"', '"x"' + extra, 1)


@pytest.fixture
def make_template(client, auth):
    created = []

    def _make(kind, name, content, **extra):
        r = client.post(V2RAY, headers=auth, json={"kind": kind, "name": name, "content": content, **extra})
        assert r.status_code == 200, r.text
        created.append(r.json()["id"])
        return r.json()

    yield _make
    for template_id in reversed(created):
        client.delete(f"{V2RAY}/{template_id}", headers=auth)


def _v2ray_json(client, user):
    r = client.get(_sub_path(user) + "/v2ray-json")
    assert r.status_code == 200, r.text
    return r.json()


def test_list_has_every_kind_with_its_builtin(client, auth):
    r = client.get(V2RAY, headers=auth)
    assert r.status_code == 200, r.text
    kinds = {k["kind"]: k for k in r.json()}
    assert set(kinds) == {"v2ray_json", "singbox", "clash", "subscription_page"}
    assert kinds["v2ray_json"]["builtin"] == {"source": "built-in", "path": "v2ray/default.json", "is_default": True}
    builtin = client.get(f"{V2RAY}/builtin/v2ray_json", headers=auth).json()
    assert json.loads(builtin["content"])["outbounds"] == []


def test_requires_sudo(client):
    assert client.get(V2RAY).status_code == 401


@pytest.mark.parametrize("kind, content, message, line", [
    ("v2ray_json", '{"outbounds": [}', "invalid JSON", 1),
    ("v2ray_json", '{"dns": {}}', '"outbounds" list', None),
    ("v2ray_json", '{% if %}', "Template syntax", 1),
    ("singbox", '{"outbounds": []}\n{{ user.__class__.__mro__ }}', "", None),
    ("clash", "proxies: [", "invalid YAML", None),
])
def test_validation(client, auth, kind, content, message, line):
    r = client.post(f"{V2RAY}/validate", headers=auth, json={"kind": kind, "content": content})
    result = r.json()
    assert result["ok"] is False, result
    assert message in result["message"]
    if line:
        assert result["line"] == line
    # saving is refused the same way
    r = client.post(V2RAY, headers=auth, json={"kind": kind, "name": "bad", "content": content})
    assert r.status_code == 422


def test_sandbox_blocks_python_internals(client, auth):
    # dashboard templates come from the browser; they must not reach Python objects
    content = '{"outbounds": [], "x": "{{ user.__class__.__init__.__globals__ }}"}'
    result = client.post(f"{V2RAY}/validate", headers=auth, json={"kind": "v2ray_json", "content": content}).json()
    assert result["ok"] is False


def test_default_template_used_for_everyone(client, auth, make_user, make_template):
    user = make_user("tpl_default")
    assert all(c["dns"]["servers"] == ["1.1.1.1", "8.8.8.8"] for c in _v2ray_json(client, user))
    make_template("v2ray_json", "everyone", _v2ray_template("9.9.9.9"), is_default=True)
    configs = _v2ray_json(client, user)
    assert configs and all(c["dns"]["servers"] == ["9.9.9.9"] for c in configs)
    # the panel's outbounds come first, the template's own after them
    assert configs[0]["outbounds"][-1]["tag"] == "direct" and len(configs[0]["outbounds"]) > 1


def test_user_template_then_host_template(client, auth, make_user, make_template):
    user_tpl = make_template("v2ray_json", "for-user", _v2ray_template("2.2.2.2"))
    host_tpl = make_template("v2ray_json", "for-host", _v2ray_template("3.3.3.3"))
    user = make_user("tpl_user", v2ray_json_template_id=user_tpl["id"])
    assert all(c["dns"]["servers"] == ["2.2.2.2"] for c in _v2ray_json(client, user))

    hosts = client.get("/api/hosts", headers=auth).json()
    tag = next(iter(hosts))
    original = hosts[tag]
    modified = [dict(h, v2ray_json_template_id=host_tpl["id"]) for h in original]
    assert client.put("/api/hosts", headers=auth, json={tag: modified}).status_code == 200
    try:
        configs = _v2ray_json(client, user)
        remarks = {h["remark"].split(" ")[0] for h in original}
        servers = [c["dns"]["servers"][0] for c in configs]
        assert "3.3.3.3" in servers and "2.2.2.2" in servers  # that host's entry uses the host template
        assert servers.count("3.3.3.3") == len(original) and remarks
    finally:
        client.put("/api/hosts", headers=auth, json={tag: original})

    # usage is reported
    kinds = {k["kind"]: k for k in client.get(V2RAY, headers=auth).json()}
    used = {t["name"]: t["usage"] for t in kinds["v2ray_json"]["templates"]}
    assert used["for-user"]["users"] == 1


def test_singbox_and_clash_templates_per_user(client, auth, make_user, make_template):
    singbox = make_template("singbox", "sb", json.dumps({
        "log": {"level": "warn"}, "dns": {"servers": [{"address": "{{ user.username }}.example"}]},
        "outbounds": [{"type": "direct", "tag": "direct"}], "route": {"rules": []}}))
    clash_builtin = client.get(f"{V2RAY}/builtin/clash", headers=auth).json()["content"]
    clash = make_template("clash", "cl", "# custom clash\n" + clash_builtin.replace("mode: Global", "mode: rule"))
    user = make_user("tpl_formats", singbox_template_id=singbox["id"], clash_template_id=clash["id"])
    sb = client.get(_sub_path(user) + "/sing-box").json()
    assert sb["dns"]["servers"] == [{"address": "tpl_formats.example"}]
    assert any(o.get("type") == "vless" for o in sb["outbounds"])
    cl = yaml.safe_load(client.get(_sub_path(user) + "/clash").text)
    assert cl["mode"] == "rule" and cl["proxies"]

    # 0 resets to the default
    r = client.put(f"/api/user/{user['username']}", headers=auth, json={"singbox_template_id": 0})
    assert r.status_code == 200 and r.json()["singbox_template_id"] is None


def test_wrong_kind_or_missing_template_is_rejected(client, auth, make_user, make_template):
    sb = make_template("singbox", "only-sb", '{"outbounds": []}')
    r = client.post("/api/user", headers=auth, json={
        "username": "tpl_bad", "proxies": {"vless": {}}, "v2ray_json_template_id": sb["id"]})
    assert r.status_code == 400 and "V2Ray JSON" in r.text
    r = client.post("/api/user", headers=auth, json={
        "username": "tpl_bad", "proxies": {"vless": {}}, "clash_template_id": 99999})
    assert r.status_code == 400


def test_delete_moves_users_and_hosts(client, auth, make_user, make_template):
    a = make_template("v2ray_json", "move-a", _v2ray_template("4.4.4.4"))
    b = make_template("v2ray_json", "move-b", _v2ray_template("5.5.5.5"))
    user = make_user("tpl_move", v2ray_json_template_id=a["id"])
    # moving to a template of another kind is refused
    sb = make_template("singbox", "move-sb", '{"outbounds": []}')
    assert client.delete(f"{V2RAY}/{a['id']}?move_to={sb['id']}", headers=auth).status_code == 400

    assert client.delete(f"{V2RAY}/{a['id']}?move_to={b['id']}", headers=auth).status_code == 200
    assert client.get(f"/api/user/{user['username']}", headers=auth).json()["v2ray_json_template_id"] == b["id"]
    assert all(c["dns"]["servers"] == ["5.5.5.5"] for c in _v2ray_json(client, user))
    assert client.delete(f"{V2RAY}/{b['id']}", headers=auth).status_code == 200  # back to the default
    assert client.get(f"/api/user/{user['username']}", headers=auth).json()["v2ray_json_template_id"] is None


def test_edit_conflict_and_default_switch(client, auth, make_template):
    t1 = make_template("singbox", "d1", '{"outbounds": []}', is_default=True)
    t2 = make_template("singbox", "d2", '{"outbounds": []}')
    r = client.put(f"{V2RAY}/{t2['id']}", headers=auth, json={"is_default": True})
    assert r.status_code == 200 and r.json()["is_default"]
    assert client.get(f"{V2RAY}/{t1['id']}", headers=auth).json()["is_default"] is False

    stale = t2["updated_at"]
    r = client.put(f"{V2RAY}/{t2['id']}", headers=auth, json={"content": '{"outbounds": [] }', "expected_updated_at": r.json()["updated_at"]})
    assert r.status_code == 200
    r = client.put(f"{V2RAY}/{t2['id']}", headers=auth, json={"content": '{"outbounds": []}', "expected_updated_at": stale})
    assert r.status_code in (200, 409)  # same second is tolerated; an older copy is refused
    old = "2000-01-01T00:00:00"
    r = client.put(f"{V2RAY}/{t2['id']}", headers=auth, json={"content": '{"outbounds": []}', "expected_updated_at": old})
    assert r.status_code == 409

    assert client.post(V2RAY, headers=auth, json={"kind": "singbox", "name": "d1", "content": '{"outbounds": []}'}).status_code == 409


def test_preview_and_subscription_page(client, auth, make_user):
    user = make_user("tpl_preview")
    r = client.post(f"{V2RAY}/preview", headers=auth, json={
        "kind": "v2ray_json", "content": _v2ray_template("6.6.6.6"), "username": user["username"]})
    assert r.status_code == 200, r.text
    assert all(c["dns"]["servers"] == ["6.6.6.6"] for c in json.loads(r.json()["output"]))
    # preview doesn't change what clients get
    assert all(c["dns"]["servers"] != ["6.6.6.6"] for c in _v2ray_json(client, user))

    r = client.post(f"{V2RAY}/preview", headers=auth, json={
        "kind": "subscription_page", "content": "<h1>{{ user.username }}</h1>", "username": user["username"]})
    assert r.json()["output"] == "<h1>tpl_preview</h1>"
    assert client.post(f"{V2RAY}/preview", headers=auth, json={
        "kind": "singbox", "content": '{"outbounds": []}', "username": "nobody"}).status_code == 404


def test_user_template_carries_template_choice(client, auth, make_template):
    sb = make_template("singbox", "ut-sb", '{"outbounds": []}')
    r = client.post("/api/user_template", headers=auth, json={"name": "with-sb", "singbox_template_id": sb["id"]})
    assert r.status_code == 200, r.text
    try:
        assert r.json()["singbox_template_id"] == sb["id"]
    finally:
        client.delete(f"/api/user_template/{r.json()['id']}", headers=auth)
