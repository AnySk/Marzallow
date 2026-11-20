"""Access lists: per-user domain allowlists enforced by the server's routing rules."""
import pytest

from app.xray import access
from app.xray.access import build_rules, normalize_domain, normalize_ip

LISTS = {10: {"domains": ["domain:qwer.qwer"], "ips": []}, 11: {"domains": ["domain:qwer1.qwer"], "ips": ["10.0.0.0/8"]}}
USERS = [("1.user1", None, True), ("2.user2", 10, False), ("3.user3", 11, False)]


def _route(rules, email, domain=None, ip=None):
    """Which outbound Xray picks: the first rule whose conditions all match."""
    for rule in rules:
        if "user" in rule and email not in rule["user"]:
            continue
        if "domain" in rule and (domain is None or not any(
                d == f"domain:{domain}" or domain.endswith("." + d.split(":", 1)[1]) for d in rule["domain"])):
            continue
        if "ip" in rule and (ip is None or ip not in ("10.1.2.3",)):
            continue
        return rule["outboundTag"]
    return "default"


@pytest.mark.parametrize("policy, expect", [
    # the scenario: user 1 everything, user 2 only qwer.qwer, user 3 only qwer1.qwer,
    # everyone else everything except the listed domains
    ("except_listed", {
        ("1.user1", "qwer.qwer"): "direct", ("1.user1", "example.com"): "direct",
        ("2.user2", "qwer.qwer"): "direct", ("2.user2", "www.qwer.qwer"): "direct",
        ("2.user2", "qwer1.qwer"): "blocked", ("2.user2", "example.com"): "blocked",
        ("3.user3", "qwer1.qwer"): "direct", ("3.user3", "qwer.qwer"): "blocked",
        ("9.other", "example.com"): "default", ("9.other", "qwer.qwer"): "blocked", ("9.other", "qwer1.qwer"): "blocked",
    }),
    ("all", {
        ("1.user1", "qwer.qwer"): "default", ("2.user2", "example.com"): "blocked",
        ("9.other", "qwer.qwer"): "default",
    }),
    ("none", {
        ("1.user1", "example.com"): "direct", ("3.user3", "qwer1.qwer"): "direct",
        ("9.other", "example.com"): "blocked",
    }),
])
def test_policies(policy, expect):
    rules = build_rules(USERS, LISTS, policy, "direct", "blocked")
    for (email, domain), outbound in expect.items():
        assert _route(rules, email, domain) == outbound, (policy, email, domain)


def test_ip_ranges_are_separate_rules():
    # domain and ip in one Xray rule must BOTH match, so they need separate rules
    rules = build_rules(USERS, LISTS, "all", "direct", "blocked")
    assert not any("domain" in r and "ip" in r for r in rules)
    assert _route(rules, "3.user3", ip="10.1.2.3") == "direct"


@pytest.mark.parametrize("entry, expected", [
    ("qwer.qwer", "domain:qwer.qwer"), ("*.Qwer.QWER", "domain:qwer.qwer"), ("full:a.b", "full:a.b"),
    ("geosite:google", "geosite:google"), ("regexp:.*\\.ru$", "regexp:.*\\.ru$"),
])
def test_normalize_domain(entry, expected):
    assert normalize_domain(entry) == expected


@pytest.mark.parametrize("bad", ["https://qwer.qwer/path", "a b", ""])
def test_bad_domains(bad):
    with pytest.raises(ValueError):
        normalize_domain(bad)


def test_normalize_ip():
    assert normalize_ip("10.1.2.3/8") == "10.0.0.0/8" and normalize_ip("geoip:ru") == "geoip:ru"
    with pytest.raises(ValueError):
        normalize_ip("10.0.0.300")


@pytest.fixture
def restarts(monkeypatch):
    calls = []
    monkeypatch.setattr(access, "schedule_restart", lambda *a, **k: calls.append(1))
    return calls


@pytest.fixture
def lists(client, auth):
    created = []

    def _make(name, domains, ips=()):
        r = client.post("/api/access-lists", headers=auth, json={"name": name, "domains": list(domains), "ips": list(ips)})
        assert r.status_code == 200, r.text
        created.append(r.json()["id"])
        return r.json()

    yield _make
    for list_id in created:
        client.delete(f"/api/access-lists/{list_id}", headers=auth)
    client.put("/api/settings", headers=auth, json={"ACCESS_DEFAULT_POLICY": None})


def test_end_to_end_rules(client, auth, make_user, lists, restarts):
    a = lists("only qwer", ["qwer.qwer"])
    b = lists("only qwer1", ["qwer1.qwer"])
    assert a["domains"] == ["domain:qwer.qwer"]
    u1 = make_user("acc_user1", access_unrestricted=True)
    make_user("acc_user2", access_list_id=a["id"])
    u3 = make_user("acc_user3")
    assert client.put(f"/api/user/{u3['username']}", headers=auth, json={"access_list_id": b["id"]}).status_code == 200
    assert client.put("/api/settings", headers=auth, json={"ACCESS_DEFAULT_POLICY": "except_listed"}).status_code == 200
    assert len(restarts) >= 2  # user changes restart the core shortly after (lists/policy apply at once)

    rules = client.get("/api/access-lists/rules", headers=auth).json()["rules"]
    emails = {r: next(x for x in sum((rr.get("user", []) for rr in rules), []) if x.endswith("." + r))
              for r in ("acc_user1", "acc_user2", "acc_user3")}
    assert _route(rules, emails["acc_user1"], "qwer.qwer") == "DIRECT"
    assert _route(rules, emails["acc_user2"], "qwer.qwer") == "DIRECT"
    assert _route(rules, emails["acc_user2"], "example.com") == "BLOCK"
    assert _route(rules, emails["acc_user3"], "qwer.qwer") == "BLOCK"
    assert _route(rules, "99.someone", "qwer1.qwer") == "BLOCK"
    assert _route(rules, "99.someone", "example.com") == "default"

    overview = client.get("/api/access-lists", headers=auth).json()
    assert overview["policy"] == "except_listed" and overview["unrestricted_users"] >= 1
    assert {l["name"]: l["users"] for l in overview["lists"]}["only qwer"] == 1
    assert any("sniffing" in w for w in overview["warnings"])  # the test inbounds don't sniff

    # deleting a list puts its users on the default policy
    assert client.delete(f"/api/access-lists/{a['id']}", headers=auth).status_code == 200
    assert client.get("/api/user/acc_user2", headers=auth).json()["access_list_id"] is None
    assert u1["access_unrestricted"] is True


def test_validation_and_permissions(client, auth, make_user, lists, restarts):
    assert client.post("/api/access-lists", headers=auth, json={"name": "bad", "domains": ["https://x.y/z"]}).status_code == 422
    assert client.post("/api/access-lists", headers=auth, json={"name": "bad", "ips": ["1.2.3.999"]}).status_code == 422
    assert client.put("/api/settings", headers=auth, json={"ACCESS_DEFAULT_POLICY": "maybe"}).status_code == 400
    assert client.post("/api/user", headers=auth, json={"username": "acc_bad", "proxies": {"vless": {}}, "access_list_id": 9999}).status_code == 400

    lst = lists("perm", ["qwer.qwer"])
    r = client.post("/api/admin", headers=auth, json={"username": "acc_reseller", "password": "resellerpass1", "is_sudo": False})
    assert r.status_code == 200
    try:
        token = client.post("/api/admin/token", data={"username": "acc_reseller", "password": "resellerpass1"}).json()["access_token"]
        h = {"Authorization": f"Bearer {token}"}
        r = client.post("/api/user", headers=h, json={"username": "acc_resold", "proxies": {"vless": {}}, "access_unrestricted": True})
        assert r.status_code == 403
        r = client.post("/api/user", headers=h, json={"username": "acc_resold", "proxies": {"vless": {}}})
        assert r.status_code == 200
        assert client.put("/api/user/acc_resold", headers=h, json={"access_list_id": lst["id"]}).status_code == 403
        assert client.put("/api/user/acc_resold", headers=h, json={"note": "fine"}).status_code == 200
        assert client.get("/api/access-lists", headers=h).status_code == 403
    finally:
        client.delete("/api/user/acc_resold", headers=auth)
        client.delete("/api/admin/acc_reseller", headers=auth)


def test_no_rules_when_nothing_is_restricted(client, auth):
    from app import xray

    config = xray.config.include_db_users()
    own = len((xray.config.get("routing") or {}).get("rules", []))
    assert (config.get("routing") or {}).get("rules", [])[own:] == []


def test_enable_sniffing(client, auth):
    assert any("sniffing" in w for w in client.get("/api/access-lists", headers=auth).json()["warnings"])
    r = client.post("/api/access-lists/enable-sniffing", headers=auth)
    assert r.status_code == 200 and len(r.json()["changed"]) == 4
    assert not any("sniffing" in w for w in client.get("/api/access-lists", headers=auth).json()["warnings"])
    config = client.get("/api/core/config", headers=auth).json()
    assert all(i["sniffing"]["destOverride"] == ["http", "tls", "quic"] for i in config["inbounds"])
    assert client.post("/api/access-lists/enable-sniffing", headers=auth).json()["changed"] == []


def test_admin_list_binds_every_user_they_own(client, auth, lists, restarts, monkeypatch):
    """A non-sudo admin can't get round a list by recreating users."""
    from app.xray import operations

    added = []
    monkeypatch.setattr(operations, "add_user", lambda dbuser: added.append(dbuser.username))
    lst = lists("reseller list", ["qwer.qwer"])
    assert client.post("/api/admin", headers=auth, json={"username": "acc_res2", "password": "resellerpass2", "is_sudo": False}).status_code == 200
    try:
        assert client.put("/api/access-lists/admins/acc_res2", headers=auth, json={"access_list_id": lst["id"]}).status_code == 200
        token = client.post("/api/admin/token", data={"username": "acc_res2", "password": "resellerpass2"}).json()["access_token"]
        h = {"Authorization": f"Bearer {token}"}
        for attempt in range(2):  # create, delete, create again: still on the list
            r = client.post("/api/user", headers=h, json={"username": "acc_res_user", "proxies": {"vless": {}}})
            assert r.status_code == 200, r.text
            assert "acc_res_user" not in added  # kept out of Xray until the rules name it
            rules = client.get("/api/access-lists/rules", headers=auth).json()["rules"]
            email = next(u for rule in rules for u in rule.get("user", []) if u.endswith(".acc_res_user"))
            assert _route(rules, email, "example.com") == "BLOCK"
            assert _route(rules, email, "qwer.qwer") == "DIRECT"
            if attempt == 0:
                assert client.delete("/api/user/acc_res_user", headers=h).status_code == 200
        overview = client.get("/api/access-lists", headers=auth).json()
        assert {a["username"]: a["access_list_id"] for a in overview["admins"]}["acc_res2"] == lst["id"]
    finally:
        client.delete("/api/user/acc_res_user", headers=auth)
        client.delete("/api/admin/acc_res2", headers=auth)


def test_access_change_takes_user_out_until_restart(client, auth, make_user, lists, restarts, monkeypatch):
    from app.xray import operations

    removed, updated = [], []
    monkeypatch.setattr(operations, "remove_user", lambda dbuser: removed.append(dbuser.username))
    monkeypatch.setattr(operations, "update_user", lambda dbuser: updated.append(dbuser.username))
    lst = lists("narrow", ["qwer.qwer"])
    make_user("acc_move", access_unrestricted=True)
    before = len(restarts)
    assert client.put("/api/user/acc_move", headers=auth, json={"access_unrestricted": False, "access_list_id": lst["id"]}).status_code == 200
    assert removed == ["acc_move"] and updated == [] and len(restarts) == before + 1
    # an unrelated edit doesn't touch access
    assert client.put("/api/user/acc_move", headers=auth, json={"note": "x", "access_list_id": lst["id"]}).status_code == 200
    assert updated == ["acc_move"] and len(restarts) == before + 1


def test_apply_failure_is_reported_and_retried(client, auth, lists, restarts, monkeypatch):
    def broken():
        raise RuntimeError("xray didn't start")
    monkeypatch.setattr(access, "apply_now", broken)
    r = client.post("/api/access-lists", headers=auth, json={"name": "will fail", "domains": ["a.b"]})
    assert r.status_code == 502 and "retrying" in r.text
    assert restarts  # retried in the background
    client.delete("/api/access-lists/" + str(next(l["id"] for l in client.get("/api/access-lists", headers=auth).json()["lists"] if l["name"] == "will fail")), headers=auth)


def test_retries_then_reports(monkeypatch):
    calls, delays = [], []
    monkeypatch.setattr(access, "apply_now", lambda: (calls.append(1), (_ for _ in ()).throw(RuntimeError("down")))[1])
    monkeypatch.setattr(access, "_start", lambda delay, attempt=0: delays.append(delay) or access._run(attempt))
    access.status.update(pending=True, error=None)
    access._run(0)
    assert len(calls) == 1 + len(access.RETRY_DELAYS) and delays == list(access.RETRY_DELAYS)
    assert access.status == {"pending": False, "error": "down"}
    access.status.update(pending=False, error=None)


def test_no_path_adds_a_listed_user_before_its_rules(client, auth, make_user, lists, monkeypatch):
    """Whatever adds the user to Xray (create, enable, reset, jobs) waits for rules naming them."""
    from app import xray
    from app.db import GetDB, crud
    from app.xray import operations

    scheduled = []
    monkeypatch.setattr(access, "schedule_restart", lambda *a, **k: scheduled.append(1))
    access.status.update(pending=False, error=None)
    lst = lists("gate", ["qwer.qwer"])
    make_user("acc_gate", access_list_id=lst["id"])
    with GetDB() as db:
        dbuser = crud.get_user(db, "acc_gate")
        # the running config predates this user: they must stay out of Xray
        assert access.allowed_in_core(dbuser) is False and scheduled
        calls = []
        monkeypatch.setattr(operations, "_add_user_to_inbound", lambda *a: calls.append(a))
        operations.add_user(dbuser)
        assert calls == []
        # once Xray runs a config whose rules name them, they're let in
        access.apply_now()
        assert access.allowed_in_core(dbuser) is True
        operations.add_user(dbuser)
        assert calls
    # an unlisted user is never held back
    make_user("acc_free")
    with GetDB() as db:
        assert access.allowed_in_core(crud.get_user(db, "acc_free")) is True
