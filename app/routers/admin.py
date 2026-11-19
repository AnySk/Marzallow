from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.exc import IntegrityError

from app import xray
from app.db import Session, crud, get_db
from app.dependencies import get_admin_by_username, validate_admin
from app.models.admin import Admin, AdminCreate, AdminModify, Token
from app.utils import report, responses
from app.utils.jwt import create_admin_token
from app.utils.ratelimit import LoginRateLimiter
from config import (
    LOGIN_LOCKOUT_SECONDS,
    LOGIN_MAX_FAILED_ATTEMPTS,
    LOGIN_NOTIFY_WHITE_LIST,
    SUDOERS,
    UVICORN_UDS_TRUST_FORWARDED_FOR,
)

router = APIRouter(tags=["Admin"], prefix="/api", responses={401: responses._401})


# Failed logins per (client IP, account), plus a looser cap per client IP so
# spraying many usernames from one address is limited too.
login_limiter = LoginRateLimiter(LOGIN_MAX_FAILED_ATTEMPTS, LOGIN_LOCKOUT_SECONDS)
ip_login_limiter = LoginRateLimiter(LOGIN_MAX_FAILED_ATTEMPTS * 4, LOGIN_LOCKOUT_SECONDS)


UNKNOWN_IP = "Unknown"


def get_client_ip(request: Request) -> str:
    """The client's IP address, or UNKNOWN_IP.

    Over TCP, uvicorn resolves X-Forwarded-For itself, trusting only proxies in
    FORWARDED_ALLOW_IPS (default 127.0.0.1). A UNIX socket has no peer address;
    only if the operator confirms the proxy appends the client address
    (UVICORN_UDS_TRUST_FORWARDED_FOR) is the last X-Forwarded-For entry used -
    clients can only add entries before it.
    """
    if request.client and request.client.host:
        return request.client.host
    if UVICORN_UDS_TRUST_FORWARDED_FOR:
        last_hop = request.headers.get("X-Forwarded-For", "").split(",")[-1].strip()
        if last_hop:
            return last_hop
    return UNKNOWN_IP


def _account_key(db: Session, username: str) -> str:
    """The account a login attempt targets, as the database would resolve it.

    Case/whitespace variants ("Admin", "admin ") may map to the same admin
    (e.g. MySQL collations), so they must share a limiter key.
    """
    if username in SUDOERS:
        return f"sudo:{username}"
    dbadmin = crud.get_admin(db, username)
    canonical = dbadmin.username if dbadmin else username
    return "name:" + canonical.strip().lower()


@router.post("/admin/token", response_model=Token)
def admin_token(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """Authenticate an admin and issue a token."""
    client_ip = get_client_ip(request)
    # Unknown IP (proxy sends no client address): still limit per account
    # rather than not at all; see FORWARDED_ALLOW_IPS in .env.example.
    account_key = f"{client_ip}|{_account_key(db, form_data.username)}"

    # The per-IP cap needs a real IP: with an unknown one it would be a single
    # global counter that anyone could exhaust to lock everybody out.
    ip_known = client_ip != UNKNOWN_IP
    retry_after = max(login_limiter.retry_after(account_key),
                      ip_login_limiter.retry_after(client_ip) if ip_known else 0)
    if retry_after:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed login attempts, try again later",
            headers={"Retry-After": str(retry_after)},
        )

    dbadmin = validate_admin(db, form_data.username, form_data.password)
    if not dbadmin:
        failures = login_limiter.record_failure(account_key)
        if ip_known:
            ip_login_limiter.record_failure(client_ip)
        # Notify on the first failure and when the lockout starts, not on every
        # attempt (brute-force bots otherwise flood the channel). Never forward
        # the attempted password.
        if failures <= 1 or failures == LOGIN_MAX_FAILED_ATTEMPTS:
            report.login(form_data.username, "🔒", client_ip, False)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    login_limiter.reset(account_key)
    if not ip_known or client_ip not in LOGIN_NOTIFY_WHITE_LIST:
        report.login(form_data.username, "🔒", client_ip, True)

    return Token(access_token=create_admin_token(form_data.username, dbadmin.is_sudo))


@router.post(
    "/admin",
    response_model=Admin,
    responses={403: responses._403, 409: responses._409},
)
def create_admin(
    new_admin: AdminCreate,
    db: Session = Depends(get_db),
    admin: Admin = Depends(Admin.check_sudo_admin),
):
    """Create a new admin if the current admin has sudo privileges."""
    try:
        dbadmin = crud.create_admin(db, new_admin)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Admin already exists")

    return dbadmin


@router.put(
    "/admin/{username}",
    response_model=Admin,
    responses={403: responses._403},
)
def modify_admin(
    modified_admin: AdminModify,
    dbadmin: Admin = Depends(get_admin_by_username),
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(Admin.check_sudo_admin),
):
    """Modify an existing admin's details."""
    if (dbadmin.username != current_admin.username) and dbadmin.is_sudo:
        raise HTTPException(
            status_code=403,
            detail="You're not allowed to edit another sudoer's account. Use marzban-cli instead.",
        )

    updated_admin = crud.update_admin(db, dbadmin, modified_admin)

    return updated_admin


@router.delete(
    "/admin/{username}",
    responses={403: responses._403},
)
def remove_admin(
    dbadmin: Admin = Depends(get_admin_by_username),
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(Admin.check_sudo_admin),
):
    """Remove an admin from the database."""
    if dbadmin.is_sudo:
        raise HTTPException(
            status_code=403,
            detail="You're not allowed to delete sudo accounts. Use marzban-cli instead.",
        )

    crud.remove_admin(db, dbadmin)
    return {"detail": "Admin removed successfully"}


@router.get("/admin", response_model=Admin)
def get_current_admin(admin: Admin = Depends(Admin.get_current)):
    """Retrieve the current authenticated admin."""
    return admin


@router.get(
    "/admins",
    response_model=List[Admin],
    responses={403: responses._403},
)
def get_admins(
    offset: Optional[int] = None,
    limit: Optional[int] = None,
    username: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: Admin = Depends(Admin.check_sudo_admin),
):
    """Fetch a list of admins with optional filters for pagination and username."""
    return crud.get_admins(db, offset, limit, username)


@router.post("/admin/{username}/users/disable", responses={403: responses._403, 404: responses._404})
def disable_all_active_users(
    dbadmin: Admin = Depends(get_admin_by_username),
    db: Session = Depends(get_db), admin: Admin = Depends(Admin.check_sudo_admin)
):
    """Disable all active users under a specific admin"""
    crud.disable_all_active_users(db=db, admin=dbadmin)
    startup_config = xray.config.include_db_users()
    xray.core.restart(startup_config)
    for node_id, node in list(xray.nodes.items()):
        if node.connected:
            xray.operations.restart_node(node_id, startup_config)
    return {"detail": "Users successfully disabled"}


@router.post("/admin/{username}/users/activate", responses={403: responses._403, 404: responses._404})
def activate_all_disabled_users(
    dbadmin: Admin = Depends(get_admin_by_username),
    db: Session = Depends(get_db), admin: Admin = Depends(Admin.check_sudo_admin)
):
    """Activate all disabled users under a specific admin"""
    crud.activate_all_disabled_users(db=db, admin=dbadmin)
    startup_config = xray.config.include_db_users()
    xray.core.restart(startup_config)
    for node_id, node in list(xray.nodes.items()):
        if node.connected:
            xray.operations.restart_node(node_id, startup_config)
    return {"detail": "Users successfully activated"}


@router.post(
    "/admin/usage/reset/{username}",
    response_model=Admin,
    responses={403: responses._403},
)
def reset_admin_usage(
    dbadmin: Admin = Depends(get_admin_by_username),
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(Admin.check_sudo_admin)
):
    """Resets usage of admin."""
    return crud.reset_admin_usage(db, dbadmin)


@router.get(
    "/admin/usage/{username}",
    response_model=int,
    responses={403: responses._403},
)
def get_admin_usage(
    dbadmin: Admin = Depends(get_admin_by_username),
    current_admin: Admin = Depends(Admin.check_sudo_admin)
):
    """Retrieve the usage of given admin."""
    return dbadmin.users_usage
