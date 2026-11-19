"""Regression tests for bugs reported against upstream Marzban (issue/PR numbers
refer to github.com/Gozargah/Marzban)."""
import base64
import json
import time
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest

import config
from app.db import GetDB, crud
from app.models.user import UserResponse, UserStatus


def _sub_path(url):
    return "/" + url.split("://", 1)[1].split("/", 1)[1]


def _links(client, url, user_agent=""):
    r = client.get(_sub_path(url), headers={"User-Agent": user_agent})
    assert r.status_code == 200, r.text
    return base64.b64decode(r.text).decode().splitlines()


# --- #2074: authorization ---------------------------------------------------

@pytest.mark.parametrize("method, path", [
    ("get", "/api/user/someone"),
    ("post", "/api/user/someone/active-next"),
    ("post", "/api/user/someone/reset"),
    ("get", "/api/user/someone/usage"),
])
def test_user_endpoints_require_auth(client, method, path):
    assert getattr(client, method)(path).status_code == 401


def test_env_sudo_token_revoked_when_password_changes(client, monkeypatch):
    token = client.post("/api/admin/token", data={"username": "sudo", "password": "sudopass"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/admin", headers=headers).status_code == 200

    monkeypatch.setitem(config.SUDOERS, "sudo", "rotated-password")
    assert client.get("/api/admin", headers=headers).status_code == 401


def test_sudo_token_without_fingerprint_rejected(client):
    from app.utils.jwt import create_admin_token, get_secret_key
    import jwt as pyjwt

    forged = pyjwt.encode({"sub": "sudo", "access": "sudo", "iat": datetime.utcnow()},
                          get_secret_key(), algorithm="HS256")
    assert client.get("/api/admin", headers={"Authorization": f"Bearer {forged}"}).status_code == 401
    assert "spf" in pyjwt.decode(create_admin_token("sudo", True), get_secret_key(), algorithms=["HS256"])


def test_resetting_usage_does_not_reactivate_disabled_user(client, auth, make_user):
    make_user("disabled-user")
    assert client.put("/api/user/disabled-user", headers=auth, json={"status": "disabled"}).status_code == 200
    r = client.post("/api/user/disabled-user/reset", headers=auth)
    assert r.status_code == 200
    assert r.json()["status"] == "disabled"


# --- #2012: login brute force ----------------------------------------------

def test_login_rate_limit_and_no_password_in_notifications(client, monkeypatch):
    from app.routers import admin as admin_router
    from app.utils.ratelimit import LoginRateLimiter

    monkeypatch.setattr(admin_router, "login_limiter", LoginRateLimiter(3, 60))
    monkeypatch.setattr(admin_router, "LOGIN_MAX_FAILED_ATTEMPTS", 3)
    reported = []
    monkeypatch.setattr(admin_router.report, "login", lambda *args: reported.append(args))

    for _ in range(3):
        assert client.post("/api/admin/token", data={"username": "sudo", "password": "wrong-secret"}).status_code == 401
    r = client.post("/api/admin/token", data={"username": "sudo", "password": "sudopass"})
    assert r.status_code == 429
    assert int(r.headers["retry-after"]) > 0

    # notified on the first failure and on lockout only, never with the password
    assert len(reported) == 2
    assert all("wrong-secret" not in map(str, args) for args in reported)


def test_spoofed_forwarded_for_is_ignored(client, monkeypatch):
    from app.routers import admin as admin_router
    from app.utils.ratelimit import LoginRateLimiter

    limiter = LoginRateLimiter(2, 60)
    monkeypatch.setattr(admin_router, "login_limiter", limiter)
    for i in range(2):  # rotating X-Forwarded-For must not evade the limit
        client.post("/api/admin/token", data={"username": "x", "password": "y"},
                    headers={"X-Forwarded-For": f"10.0.0.{i}"})
    assert limiter.retry_after("testclient|x") > 0


def test_lockout_is_per_username(client, monkeypatch):
    from app.routers import admin as admin_router
    from app.utils.ratelimit import LoginRateLimiter

    monkeypatch.setattr(admin_router, "login_limiter", LoginRateLimiter(2, 60))
    for _ in range(2):
        client.post("/api/admin/token", data={"username": "attacker-target", "password": "nope"})
    assert client.post("/api/admin/token", data={"username": "attacker-target", "password": "x"}).status_code == 429
    # other accounts from the same client are unaffected
    assert client.post("/api/admin/token", data={"username": "sudo", "password": "sudopass"}).status_code == 200


# --- #2083 / #2066: subscription link changes on every refresh -------------

def test_subscription_url_is_stable(client, auth, make_user):
    first = make_user("stable-link")["subscription_url"]
    time.sleep(1.1)
    assert client.get("/api/user/stable-link", headers=auth).json()["subscription_url"] == first
    assert client.get(_sub_path(first)).status_code == 200

    time.sleep(1.1)
    revoked = client.post("/api/user/stable-link/revoke_sub", headers=auth).json()["subscription_url"]
    assert revoked != first
    assert client.get(_sub_path(first)).status_code == 404
    assert client.get(_sub_path(revoked)).status_code == 200
    assert client.get("/api/user/stable-link", headers=auth).json()["subscription_url"] == revoked


# --- #1986 / #2036: REALITY short id missing on the first request ----------

def test_reality_sid_present_on_first_link(client, make_user, monkeypatch):
    from app import xray

    inbound = xray.config.inbounds_by_tag["VLESS TCP REALITY"]
    monkeypatch.setitem(inbound, "sids", ["abcd"])
    inbound.pop("sid", None)  # state right after startup
    user = make_user("sid_user", proxies={"vless": {}})
    link = next(l for l in _links(client, user["subscription_url"]) if l.startswith("vless://"))
    assert parse_qs(urlparse(link).query)["sid"] == ["abcd"]
    assert "sid" not in inbound  # the shared config is no longer mutated


# --- #2064: IPv6 addresses ---------------------------------------------------

def test_ipv6_addresses_per_format(client, auth, make_user):
    from app import xray

    hosts = client.get("/api/hosts", headers=auth).json()
    hosts["VMESS WS"] = [{**hosts["VMESS WS"][0], "address": "2001:db8::1"}]
    assert client.put("/api/hosts", headers=auth, json=hosts).status_code == 200
    try:
        user = make_user("ipv6_user", proxies={"vmess": {}})
        path = _sub_path(user["subscription_url"])
        clash = client.get(f"{path}/clash-meta").text
        assert 'server: 2001:db8::1' in clash or "server: '2001:db8::1'" in clash
        singbox = json.loads(client.get(f"{path}/sing-box").text)
        assert any(o.get("server") == "2001:db8::1" for o in singbox["outbounds"])
        vmess = json.loads(base64.b64decode(_links(client, user["subscription_url"])[0][8:]))
        assert vmess["add"] == "[2001:db8::1]"
    finally:
        xray.hosts.update()


# --- #2108: Mihomet client ---------------------------------------------------

def test_mihomet_gets_clash_meta(client, make_user):
    user = make_user("mihomet-user")
    r = client.get(_sub_path(user["subscription_url"]), headers={"User-Agent": "Mihomet/1.2.0"})
    assert r.headers["content-type"].startswith("text/yaml")
    assert "proxy-groups" in r.text


# --- #2068: next plan carry-over, demoting admins, core config, log interval -

def test_next_plan_adds_remaining_traffic_only_when_asked(client, auth, make_user):
    gb = 1024 ** 3
    for add_remaining, expected in ((True, 10 * gb + 4 * gb), (False, 10 * gb)):
        name = f"plan-{add_remaining}".lower()
        make_user(name, data_limit=5 * gb,
                  next_plan={"data_limit": 10 * gb, "expire": 0, "add_remaining_traffic": add_remaining})
        with GetDB() as db:
            dbuser = crud.get_user(db, name)
            dbuser.used_traffic = 1 * gb
            db.commit()
        r = client.post(f"/api/user/{name}/active-next", headers=auth)
        assert r.status_code == 200, r.text  # used to always 404 after applying the plan
        assert r.json()["data_limit"] == expected
        assert r.json()["used_traffic"] == 0
    assert client.post("/api/user/plan-true/active-next", headers=auth).status_code == 404  # plan consumed


def test_sudo_admin_can_be_demoted():
    # The API forbids editing other sudo admins; the CLI uses crud.update_admin.
    from app.models.admin import AdminCreate, AdminModify

    with GetDB() as db:
        crud.create_admin(db, AdminCreate(username="boss", password="pw-boss", is_sudo=True))
        admin = crud.update_admin(db, crud.get_admin(db, "boss"), AdminModify(is_sudo=False))
        assert admin.is_sudo is False
        crud.remove_admin(db, admin)


def test_core_config_rolled_back_when_xray_fails(client, auth):
    original = client.get("/api/core/config", headers=auth).json()
    bad = json.loads(json.dumps(original))
    bad["inbounds"][-1]["tag"] = "FAIL_TO_START"
    r = client.put("/api/core/config", headers=auth, json=bad)
    assert r.status_code == 400
    assert "stub rejected the config" in r.json()["detail"]  # stderr is captured
    assert client.get("/api/core/config", headers=auth).json() == original
    assert client.get("/api/core", headers=auth).json()["started"] is True

    assert client.put("/api/core/config", headers=auth, json=original).status_code == 200


@pytest.mark.parametrize("interval", ["0", "-1", "11"])
def test_core_logs_rejects_bad_interval(client, sudo_token, interval):
    from starlette.websockets import WebSocketDisconnect

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/api/core/logs?token={sudo_token}&interval={interval}") as ws:
            ws.receive_text()


# --- #2110: periodic reset of limited users ---------------------------------

def test_periodic_reset_readds_limited_user_to_xray(client, make_user, monkeypatch):
    import importlib.util

    make_user("periodic", data_limit=1024, data_limit_reset_strategy="day")
    with GetDB() as db:
        dbuser = crud.get_user(db, "periodic")
        dbuser.status = UserStatus.limited
        dbuser.used_traffic = 2048
        dbuser.created_at = datetime.utcnow() - timedelta(days=2)
        db.commit()

    path = Path(__file__).resolve().parent.parent / "app/jobs/reset_user_data_usage.py"
    spec = importlib.util.spec_from_file_location("reset_job_under_test", path)
    job = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(job)
    added = []
    monkeypatch.setattr(job.xray.operations, "add_user", lambda user: added.append(user.username))
    job.reset_user_data_usage()

    assert "periodic" in added
    with GetDB() as db:
        assert crud.get_user(db, "periodic").status == UserStatus.active


# --- traffic must not be lost when the database write fails ------------------

def test_user_usage_kept_when_db_write_fails(make_user, monkeypatch):
    import importlib.util
    from sqlalchemy.exc import OperationalError

    user = make_user("traffic-user")
    path = Path(__file__).resolve().parent.parent / "app/jobs/record_usages.py"
    spec = importlib.util.spec_from_file_location("record_usages_under_test", path)
    job = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(job)

    uid = str(user["id"]) if "id" in user else None
    with GetDB() as db:
        uid = str(crud.get_user(db, "traffic-user").id)
    monkeypatch.setattr(job, "get_users_stats", lambda api: [{"uid": uid, "value": 1000}])

    real = job.safe_execute
    calls = {"n": 0}

    def flaky(db, stmt, params=None, retries=3):
        calls["n"] += 1
        if calls["n"] == 1:
            raise OperationalError("UPDATE users", {}, Exception("server has gone away"))
        return real(db, stmt, params, retries)

    monkeypatch.setattr(job, "safe_execute", flaky)
    job.record_user_usages()  # write fails -> kept for next run
    job.record_user_usages()  # 1000 carried over + 1000 new
    with GetDB() as db:
        assert crud.get_user(db, "traffic-user").used_traffic == 2000


def test_retryable_db_errors():
    from importlib.util import module_from_spec, spec_from_file_location
    from sqlalchemy.exc import OperationalError

    path = Path(__file__).resolve().parent.parent / "app/jobs/record_usages.py"
    spec = spec_from_file_location("record_usages_retry", path)
    job = module_from_spec(spec)
    spec.loader.exec_module(job)

    class MySQLErr(Exception):
        pass

    assert job._is_retryable(OperationalError("x", {}, MySQLErr(1213, "Deadlock found")))
    assert job._is_retryable(OperationalError("x", {}, Exception("database is locked")))
    assert not job._is_retryable(OperationalError("x", {}, MySQLErr(1045, "Access denied")))
