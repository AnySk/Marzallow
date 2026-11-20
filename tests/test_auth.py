from app.utils.password import hash_password, verify_password

# Produced by passlib 1.7.4 + bcrypt 4.0.1 (the stack before the passlib removal).
LEGACY_HASH = "$2b$12$svmBYzk2iWSlrxoAc00vjuiPU72u1h7eAyWYNm8UEuE4sIHyhcg7K"  # "secret-pass"
LEGACY_LONG_HASH = "$2b$12$dyYLwuLDClXNBhExTPNgseyw0ZO4HXFwPvh5F/2LTEMIj.vLRVKZi"  # "x" * 100


def test_legacy_passlib_hashes_still_verify():
    assert verify_password("secret-pass", LEGACY_HASH)
    assert not verify_password("wrong", LEGACY_HASH)
    # passlib silently truncated to bcrypt's 72-byte limit; we must too
    assert verify_password("x" * 100, LEGACY_LONG_HASH)


def test_hash_roundtrip_and_long_passwords():
    hashed = hash_password("p" * 90)  # bcrypt>=5 raises on >72 bytes unless truncated
    assert hashed.startswith("$2b$")
    assert verify_password("p" * 90, hashed)


def test_verify_handles_garbage_hash():
    assert not verify_password("x", "")
    assert not verify_password("x", "not-a-bcrypt-hash")


def test_sudo_login(client, auth):
    r = client.get("/api/admin", headers=auth)
    assert r.status_code == 200
    assert r.json()["username"] == "sudo"
    assert r.json()["is_sudo"] is True


def test_bad_credentials_rejected(client):
    r = client.post("/api/admin/token", data={"username": "sudo", "password": "nope"})
    assert r.status_code == 401


def test_requests_without_token_rejected(client):
    assert client.get("/api/users").status_code == 401


def test_db_admin_lifecycle(client, auth):
    r = client.post("/api/admin", headers=auth,
                    json={"username": "ops", "password": "ops-pass", "is_sudo": False})
    assert r.status_code == 200, r.text

    r = client.post("/api/admin/token", data={"username": "ops", "password": "ops-pass"})
    assert r.status_code == 200
    ops = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert client.get("/api/admin", headers=ops).json()["is_sudo"] is False
    # non-sudo admins cannot manage other admins
    assert client.get("/api/admins", headers=ops).status_code == 403

    r = client.put("/api/admin/ops", headers=auth, json={"password": "new-pass", "is_sudo": False})
    assert r.status_code == 200, r.text
    assert client.post("/api/admin/token", data={"username": "ops", "password": "new-pass"}).status_code == 200
    # tokens issued before a password change are invalidated
    assert client.get("/api/admin", headers=ops).status_code == 401

    assert client.delete("/api/admin/ops", headers=auth).status_code == 200


def test_admins_overview(client, auth, make_user):
    r = client.post("/api/admin", headers=auth, json={"username": "overview_admin", "password": "overviewpass1", "is_sudo": False})
    assert r.status_code == 200, r.text
    try:
        token = client.post("/api/admin/token", data={"username": "overview_admin", "password": "overviewpass1"}).json()["access_token"]
        client.post("/api/user", headers={"Authorization": f"Bearer {token}"},
                    json={"username": "overview_user", "proxies": {"vless": {}}})
        rows = {r["username"]: r for r in client.get("/api/admins/overview", headers=auth).json()}
        assert rows["overview_admin"]["users"] == 1 and rows["overview_admin"]["active_users"] == 1
        assert rows["overview_admin"]["last_login_at"] is not None
        assert client.get("/api/admins/overview", headers={"Authorization": f"Bearer {token}"}).status_code == 403
    finally:
        client.delete("/api/user/overview_user", headers=auth)
        client.delete("/api/admin/overview_admin", headers=auth)
