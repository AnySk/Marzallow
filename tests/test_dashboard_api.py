"""Endpoints backing the dashboard's bulk actions, filters, history and charts."""
import time
from datetime import datetime, timedelta

import os

import pytest

from app.db import GetDB, crud
from app.db.models import NodeUserUsage
from app.models.user import UserStatus

GB = 1024 ** 3


def _set(username, **fields):
    with GetDB() as db:
        dbuser = crud.get_user(db, username)
        for key, value in fields.items():
            setattr(dbuser, key, value)
        db.commit()


def _get(client, auth, username):
    return client.get(f"/api/user/{username}", headers=auth).json()


def _bulk(client, auth, **body):
    r = client.post("/api/users/bulk", headers=auth, json=body)
    assert r.status_code == 200, r.text
    return r.json()


# --- bulk actions --------------------------------------------------------------

def test_bulk_disable_enable(client, auth, make_user):
    make_user("bulk_a")
    make_user("bulk_b")
    r = _bulk(client, auth, usernames=["bulk_a", "bulk_b", "bulk_a", "missing"], action="disable")
    assert r["done"] == ["bulk_a", "bulk_b"]
    assert r["skipped"] == {"missing": "not found"}
    assert _get(client, auth, "bulk_a")["status"] == "disabled"

    r = _bulk(client, auth, usernames=["bulk_a", "bulk_b"], action="disable")
    assert r["skipped"] == {"bulk_a": "already disabled", "bulk_b": "already disabled"}

    r = _bulk(client, auth, usernames=["bulk_a"], action="enable")
    assert r["done"] == ["bulk_a"] and _get(client, auth, "bulk_a")["status"] == "active"


def test_bulk_extend_reactivates_expired(client, auth, make_user):
    past = int(time.time()) - 86400
    make_user("bulk_exp", expire=past + 10)
    make_user("bulk_unlimited", expire=None)
    _set("bulk_exp", status=UserStatus.expired, expire=past)

    r = _bulk(client, auth, usernames=["bulk_exp", "bulk_unlimited"], action="extend", days=30)
    assert r["done"] == ["bulk_exp"]
    assert r["skipped"] == {"bulk_unlimited": "no expiry date"}
    user = _get(client, auth, "bulk_exp")
    assert user["status"] == "active"
    # counted from now, not from the past expiry date
    assert abs(user["expire"] - (time.time() + 30 * 86400)) < 60


def test_bulk_set_expire_and_skip_expired(client, auth, make_user):
    past = int(time.time()) - 86400
    target = int(time.time()) + 10 * 86400
    make_user("bulk_set_a", expire=target - 999)
    make_user("bulk_set_b", expire=past + 10)
    _set("bulk_set_b", status=UserStatus.expired, expire=past)

    r = _bulk(client, auth, usernames=["bulk_set_a", "bulk_set_b"], action="set_expire", expire=target,
              reactivate_expired=False)
    assert r["done"] == ["bulk_set_a"] and r["skipped"] == {"bulk_set_b": "expired"}
    assert _get(client, auth, "bulk_set_a")["expire"] == target
    r = _bulk(client, auth, usernames=["bulk_set_b"], action="set_expire", expire=target)
    assert r["done"] == ["bulk_set_b"] and _get(client, auth, "bulk_set_b")["status"] == "active"
    assert client.post("/api/users/bulk", headers=auth, json={"usernames": ["x"], "action": "set_expire"}).status_code == 400


def test_bulk_add_data_reactivates_limited(client, auth, make_user):
    make_user("bulk_lim", data_limit=1 * GB)
    _set("bulk_lim", status=UserStatus.limited, used_traffic=1 * GB)
    make_user("bulk_nolimit", data_limit=0)

    r = _bulk(client, auth, usernames=["bulk_lim", "bulk_nolimit"], action="add_data", data_limit=5 * GB)
    assert r["skipped"] == {"bulk_nolimit": "unlimited data"}
    user = _get(client, auth, "bulk_lim")
    assert user["data_limit"] == 6 * GB and user["status"] == "active"


def test_bulk_reset_revoke_delete(client, auth, make_user):
    make_user("bulk_r")
    _set("bulk_r", used_traffic=123)
    old_url = _get(client, auth, "bulk_r")["subscription_url"]

    _bulk(client, auth, usernames=["bulk_r"], action="reset_usage")
    assert _get(client, auth, "bulk_r")["used_traffic"] == 0
    time.sleep(1.1)  # subscription tokens have 1-second resolution
    _bulk(client, auth, usernames=["bulk_r"], action="revoke_sub")
    assert _get(client, auth, "bulk_r")["subscription_url"] != old_url
    _bulk(client, auth, usernames=["bulk_r"], action="delete")
    assert client.get("/api/user/bulk_r", headers=auth).status_code == 404


def test_bulk_requires_parameters(client, auth):
    assert client.post("/api/users/bulk", headers=auth,
                       json={"usernames": ["x"], "action": "extend"}).status_code == 400
    assert client.post("/api/users/bulk", headers=auth,
                       json={"usernames": [], "action": "delete"}).status_code == 422


def test_bulk_respects_ownership(client, auth, make_user):
    make_user("bulk_owned_by_sudo")
    client.post("/api/admin", headers=auth, json={"username": "reseller", "password": "pw-reseller", "is_sudo": False})
    try:
        token = client.post("/api/admin/token", data={"username": "reseller", "password": "pw-reseller"}).json()["access_token"]
        r = client.post("/api/users/bulk", headers={"Authorization": f"Bearer {token}"},
                        json={"usernames": ["bulk_owned_by_sudo"], "action": "delete"})
        assert r.json() == {"done": [], "skipped": {"bulk_owned_by_sudo": "not allowed"}}
        assert _get(client, auth, "bulk_owned_by_sudo")["username"] == "bulk_owned_by_sudo"
    finally:
        client.delete("/api/admin/reseller", headers=auth)


# --- list filters ----------------------------------------------------------------

def _usernames(client, auth, **params):
    r = client.get("/api/users", headers=auth, params=params)
    assert r.status_code == 200, r.text
    return [u["username"] for u in r.json()["users"]]


def test_users_filters_and_online_sort(client, auth, make_user):
    now = int(time.time())
    make_user("flt_soon", expire=now + 2 * 86400, data_limit=10 * GB)
    make_user("flt_later", expire=now + 60 * 86400, data_limit=10 * GB)
    _set("flt_soon", used_traffic=9 * GB, online_at=datetime.utcnow() - timedelta(minutes=2))
    _set("flt_later", online_at=datetime.utcnow() - timedelta(days=2))

    names = _usernames(client, auth, search="flt_", expire_before=now + 3 * 86400)
    assert names == ["flt_soon"]
    assert _usernames(client, auth, search="flt_", usage_percent_above=80) == ["flt_soon"]
    assert _usernames(client, auth, search="flt_", online_within=600) == ["flt_soon"]
    assert _usernames(client, auth, search="flt_", sort="-online_at") == ["flt_soon", "flt_later"]
    assert _usernames(client, auth, search="flt_", sort="online_at") == ["flt_later", "flt_soon"]


# --- history, daily usage, alerts ---------------------------------------------

def test_reset_logs(client, auth, make_user):
    make_user("logs_user")
    for used in (100, 200):
        _set("logs_user", used_traffic=used)
        client.post("/api/user/logs_user/reset", headers=auth)
    logs = client.get("/api/user/logs_user/reset-logs", headers=auth).json()
    assert [entry["used_traffic_at_reset"] for entry in logs] == [200, 100]


def test_daily_usage(client, auth, make_user):
    make_user("daily_user")
    with GetDB() as db:
        uid = crud.get_user(db, "daily_user").id
        base = datetime.utcnow().replace(minute=0, second=0, microsecond=0) - timedelta(days=1)
        for hours, amount in ((0, 100), (1, 50), (23, 7)):  # all within the last 24h
            db.add(NodeUserUsage(user_id=uid, node_id=None, created_at=base + timedelta(hours=hours),
                                 used_traffic=amount))
        db.commit()
    days = client.get("/api/users/usage/daily", headers=auth, params={"username": "daily_user"}).json()
    totals = {d["date"]: d["used_traffic"] for d in days}
    assert sum(totals.values()) == 157

    summary = client.get("/api/users/usage/summary", headers=auth).json()
    assert summary["total"] >= 157
    top = {u["username"]: u["used_traffic"] for u in summary["top_users"]}
    assert top["daily_user"] == 157
    assert summary["users_with_traffic"] >= 1 and summary["median_per_user"] > 0
    assert summary["busiest_day"]["used_traffic"] > 0 and summary["new_users"] >= 1


def test_system_alerts(client, auth, make_user):
    before = client.get("/api/system/alerts", headers=auth).json()
    now = int(time.time())
    make_user("alert_soon", expire=now + 86400)
    make_user("alert_full", data_limit=1 * GB)
    _set("alert_full", used_traffic=int(0.9 * GB))
    after = client.get("/api/system/alerts", headers=auth, params={"days": 3, "percent": 80}).json()
    assert after["expiring_soon"] == before["expiring_soon"] + 1
    assert after["near_limit"] == before["near_limit"] + 1
    assert after["disconnected_nodes"] == []


# --- timestamps must not depend on the server's local timezone -----------------

@pytest.fixture
def tokyo_time():
    """Run with a non-UTC local timezone (CI machines are usually UTC)."""
    old = os.environ.get("TZ")
    os.environ["TZ"] = "Asia/Tokyo"
    time.tzset()
    yield
    if old is None:
        os.environ.pop("TZ", None)
    else:
        os.environ["TZ"] = old
    time.tzset()


def test_extend_and_expiry_status_in_non_utc_timezone(client, auth, make_user, tokyo_time):
    make_user("tz_user", expire=int(time.time()) + 3600)
    _bulk(client, auth, usernames=["tz_user"], action="extend", days=1)
    assert abs(_get(client, auth, "tz_user")["expire"] - (time.time() + 3600 + 86400)) < 60

    # 2 hours ago is in the past; with "now" taken as local time (UTC+9) it looked
    # like the future and the user stayed active
    r = client.put("/api/user/tz_user", headers=auth, json={"expire": int(time.time()) - 7200})
    assert r.json()["status"] == "expired"


def test_notification_timestamps_are_per_instance():
    from app.utils.notification import Notification

    first = Notification(username="a", action=Notification.Type.user_created)
    time.sleep(0.01)
    second = Notification(username="b", action=Notification.Type.user_created)
    assert second.enqueued_at > first.enqueued_at
    assert abs(second.enqueued_at - time.time()) < 5


def test_save_only_next_plan(client, auth, make_user):
    # the dashboard's "Save next plan" sends nothing else
    make_user("plan_only", data_limit=5 * GB)
    r = client.put("/api/user/plan_only", headers=auth, json={
        "next_plan": {"data_limit": 20 * GB, "expire": 0, "add_remaining_traffic": True, "fire_on_either": True}})
    assert r.status_code == 200, r.text
    user = r.json()
    assert user["next_plan"]["data_limit"] == 20 * GB
    assert user["data_limit"] == 5 * GB and user["status"] == "active"  # nothing else changed


def test_set_owner(client, auth, make_user):
    make_user("owned_user")
    client.post("/api/admin", headers=auth, json={"username": "owner2", "password": "pw-owner2", "is_sudo": False})
    try:
        r = client.put("/api/user/owned_user/set-owner", headers=auth, params={"admin_username": "owner2"})
        assert r.status_code == 200, r.text
        assert r.json()["admin"]["username"] == "owner2"
        assert _usernames(client, auth, admin="owner2") == ["owned_user"]
    finally:
        client.delete("/api/admin/owner2", headers=auth)
