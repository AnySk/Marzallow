"""Test setup.

`config.py` reads the environment at import time, so everything is configured
here before the app is imported. Xray is replaced by a stub script
(tests/fixtures/xray) and the database is a throwaway SQLite file migrated
with Alembic, exactly like a real deployment.
"""
import os
import shutil
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = Path(__file__).resolve().parent / "fixtures"
_tmp = tempfile.mkdtemp(prefix="marzallow-tests-")
# the API can rewrite the xray config, so tests work on a copy
shutil.copy(FIXTURES / "xray_config.json", f"{_tmp}/xray_config.json")

os.environ.update({
    # TEST_DATABASE_URL runs the suite against MySQL/MariaDB/PostgreSQL instead
    # (it must point at an empty database).
    "SQLALCHEMY_DATABASE_URL": os.environ.get("TEST_DATABASE_URL") or f"sqlite:///{_tmp}/db.sqlite3",
    "XRAY_EXECUTABLE_PATH": str(FIXTURES / "xray"),
    "XRAY_ASSETS_PATH": str(FIXTURES),
    "XRAY_JSON": f"{_tmp}/xray_config.json",
    "XRAY_SUBSCRIPTION_URL_PREFIX": "https://sub.example.com",
    "SUDO_USERNAME": "sudo",
    "SUDO_PASSWORD": "sudopass",
    "USE_CUSTOM_JSON_DEFAULT": "True",
    "DOCS": "True",
    "TELEGRAM_API_TOKEN": "",
    "WEBHOOK_ADDRESS": "",
})
os.chdir(ROOT)  # alembic.ini and relative template paths are resolved from the repo root


def _migrate():
    from alembic import command
    from alembic.config import Config

    command.upgrade(Config(str(ROOT / "alembic.ini")), "head")


_migrate()

from fastapi.testclient import TestClient  # noqa: E402

from app import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def sudo_token(client):
    r = client.post("/api/admin/token", data={"username": "sudo", "password": "sudopass"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def auth(sudo_token):
    return {"Authorization": f"Bearer {sudo_token}"}


PROXIES = {
    "vless": {"id": "35e4e39c-7d5c-4f4b-8b71-558e4f37ff53"},
    "vmess": {"id": "45e4e39c-7d5c-4f4b-8b71-558e4f37ff53"},
    "trojan": {"password": "trojanpw"},
    "shadowsocks": {"password": "sspw", "method": "chacha20-ietf-poly1305"},
}


@pytest.fixture
def make_user(client, auth):
    created = []

    def _make(username, **overrides):
        body = {
            "username": username,
            "proxies": PROXIES,
            "data_limit": 10 * 1024 ** 3,
            "expire": 4102444800,  # 2100-01-01
            "status": "active",
            **overrides,
        }
        r = client.post("/api/user", headers=auth, json=body)
        assert r.status_code == 200, r.text
        created.append(username)
        return r.json()

    yield _make

    for username in created:
        client.delete(f"/api/user/{username}", headers=auth)
