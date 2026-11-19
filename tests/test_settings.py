"""Dashboard-editable settings: stored overrides that apply immediately."""
import base64

import pytest

from app.settings import DEFINITIONS, settings


@pytest.fixture(autouse=True)
def reset_overrides(client, auth):
    yield
    client.put("/api/settings", headers=auth, json={d.key: None for d in DEFINITIONS})


def _by_key(response):
    return {s["key"]: s for s in response.json()}


def _put(client, auth, **changes):
    return client.put("/api/settings", headers=auth, json=changes)


def test_list_settings_with_env_defaults(client, auth):
    r = client.get("/api/settings", headers=auth)
    assert r.status_code == 200
    items = _by_key(r)
    assert set(items) == {d.key for d in DEFINITIONS}
    title = items["SUB_PROFILE_TITLE"]
    assert title["value"] == title["default"] == "Subscription"
    assert title["overridden"] is False and title["group"] == "subscription"


def test_requires_sudo(client, auth):
    client.post("/api/admin", headers=auth, json={"username": "plain", "password": "pw-plain", "is_sudo": False})
    try:
        token = client.post("/api/admin/token", data={"username": "plain", "password": "pw-plain"}).json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        assert client.get("/api/settings", headers=headers).status_code == 403
        assert client.put("/api/settings", headers=headers, json={"SUB_PROFILE_TITLE": "x"}).status_code == 403
    finally:
        client.delete("/api/admin/plain", headers=auth)


def test_subscription_settings_apply_immediately(client, auth, make_user):
    user = make_user("settings_sub")
    path = "/" + user["subscription_url"].split("://", 1)[1].split("/", 1)[1]
    r = _put(client, auth, SUB_PROFILE_TITLE="My VPN", SUB_UPDATE_INTERVAL="6",
             SUB_SUPPORT_URL="https://t.me/my_support")
    assert r.status_code == 200, r.text
    assert _by_key(r)["SUB_PROFILE_TITLE"]["overridden"] is True

    headers = client.get(path).headers
    assert base64.b64decode(headers["profile-title"].split(":", 1)[1]).decode() == "My VPN"
    assert headers["profile-update-interval"] == "6"
    assert headers["support-url"] == "https://t.me/my_support"


def test_reset_to_env_value(client, auth):
    _put(client, auth, SUB_PROFILE_TITLE="Temporary")
    r = _put(client, auth, SUB_PROFILE_TITLE=None)
    title = _by_key(r)["SUB_PROFILE_TITLE"]
    assert title["value"] == "Subscription" and title["overridden"] is False


def test_validation_errors_per_field(client, auth):
    r = _put(client, auth,
             WEBHOOK_ADDRESS=["ftp://nope"],
             NOTIFY_REACHED_USAGE_PERCENT=[50, 150],
             SUB_UPDATE_INTERVAL="soon",
             NOTIFY_LOGIN="yes",
             SUDO_PASSWORD="hijack",
             SUB_PROFILE_TITLE="valid but not saved")
    assert r.status_code == 400
    errors = r.json()["detail"]
    assert set(errors) == {"WEBHOOK_ADDRESS", "NOTIFY_REACHED_USAGE_PERCENT", "SUB_UPDATE_INTERVAL",
                           "NOTIFY_LOGIN", "SUDO_PASSWORD"}
    assert errors["SUDO_PASSWORD"] == "not an editable setting"
    # nothing is saved when any value is invalid
    assert settings.SUB_PROFILE_TITLE == "Subscription"


def test_lists_accept_comma_separated_text(client, auth):
    r = _put(client, auth, NOTIFY_DAYS_LEFT="7, 1, 3", LOGIN_NOTIFY_WHITE_LIST="10.0.0.1 , 10.0.0.2")
    assert r.status_code == 200, r.text
    items = _by_key(r)
    assert items["NOTIFY_DAYS_LEFT"]["value"] == [1, 3, 7]
    assert items["LOGIN_NOTIFY_WHITE_LIST"]["value"] == ["10.0.0.1", "10.0.0.2"]


def test_secret_is_never_returned(client, auth):
    r = _put(client, auth, WEBHOOK_SECRET="s3cr3t", WEBHOOK_ADDRESS=["https://hooks.example.com/x"])
    secret = _by_key(r)["WEBHOOK_SECRET"]
    assert secret["value"] is None and secret["has_value"] is True and secret["secret"] is True
    assert "s3cr3t" not in r.text
    assert settings.WEBHOOK_SECRET == "s3cr3t"

    from importlib.util import module_from_spec, spec_from_file_location
    from pathlib import Path
    path = Path(__file__).resolve().parent.parent / "app/jobs/send_notifications.py"
    spec = spec_from_file_location("send_notifications_under_test", path)
    job = module_from_spec(spec)
    spec.loader.exec_module(job)
    assert job._headers() == {"x-webhook-secret": "s3cr3t"}  # read live by the sender


def test_overrides_persist_across_reload(client, auth):
    _put(client, auth, USERS_AUTODELETE_DAYS=30)
    settings.reload()  # e.g. after a restart
    assert settings.USERS_AUTODELETE_DAYS == 30
    assert settings.is_overridden("USERS_AUTODELETE_DAYS")


def test_login_lockout_threshold_applies_immediately(client, auth):
    from app.routers import admin as admin_router

    _put(client, auth, LOGIN_MAX_FAILED_ATTEMPTS=2, LOGIN_LOCKOUT_SECONDS=60)
    try:
        for _ in range(2):
            client.post("/api/admin/token", data={"username": "lockme", "password": "x"})
        assert client.post("/api/admin/token", data={"username": "lockme", "password": "x"}).status_code == 429
    finally:
        admin_router.login_limiter.reset("testclient|name:lockme")
        admin_router.ip_login_limiter.reset("testclient")
