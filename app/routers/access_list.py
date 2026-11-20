"""Access lists (see app/xray/access.py): which sites users may reach."""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func

from app import logger, xray
from app.db import Session, get_db
from app.db.models import AccessList, Admin as DBAdmin, User, UserTemplate
from app.models.admin import Admin
from app.settings import settings
from app.utils import responses
from app.xray import access

router = APIRouter(tags=["Access lists"], prefix="/api", responses={401: responses._401, 403: responses._403})


class AccessListBase(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=64)
    description: Optional[str] = Field(None, max_length=256)
    domains: Optional[List[str]] = Field(None, max_length=5000)
    ips: Optional[List[str]] = Field(None, max_length=5000)

    @field_validator("name")
    @classmethod
    def strip(cls, v):
        return v.strip() if v else v

    @field_validator("domains")
    @classmethod
    def check_domains(cls, v):
        return None if v is None else list(dict.fromkeys(access.normalize_domain(d) for d in v if d.strip()))

    @field_validator("ips")
    @classmethod
    def check_ips(cls, v):
        return None if v is None else list(dict.fromkeys(access.normalize_ip(i) for i in v if i.strip()))


class AccessListCreate(AccessListBase):
    name: str = Field(min_length=1, max_length=64)


class AccessListInfo(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    domains: List[str]
    ips: List[str]
    users: int = 0
    user_templates: int = 0
    updated_at: Optional[datetime] = None


class AdminAccess(BaseModel):
    username: str
    is_sudo: bool
    access_list_id: Optional[int] = None


class AccessOverview(BaseModel):
    policy: str
    unrestricted_users: int
    lists: List[AccessListInfo]
    admins: List[AdminAccess]
    warnings: List[str]
    pending: bool = False   # a change is waiting to be applied
    apply_error: Optional[str] = None


def _counts(db: Session, model):
    return dict(db.query(model.access_list_id, func.count()).filter(model.access_list_id.isnot(None))
                .group_by(model.access_list_id).all())


def _info(row: AccessList, users: dict, templates: dict) -> AccessListInfo:
    return AccessListInfo(id=row.id, name=row.name, description=row.description, domains=row.domains or [],
                          ips=row.ips or [], users=users.get(row.id, 0), user_templates=templates.get(row.id, 0),
                          updated_at=row.updated_at)


def _apply() -> None:
    """Apply list changes right away (they're rare); on failure keep retrying in
    the background and tell the caller."""
    try:
        access.apply_now()
    except Exception as exc:
        access.schedule_restart(access.RETRY_DELAYS[0])
        raise HTTPException(status_code=502, detail=f"Saved, but the server couldn't apply it yet ({exc}); retrying")


def _get(db: Session, list_id: int) -> AccessList:
    row = db.get(AccessList, list_id)
    if not row:
        raise HTTPException(status_code=404, detail="Access list not found")
    return row


def check_access_fields(db: Session, obj, admin: Admin, before=None) -> bool:
    """Validate the access fields of a user / user template body. Only sudo admins
    may set them. Returns True when they change what the server enforces."""
    list_id, free = getattr(obj, "access_list_id", None), getattr(obj, "access_unrestricted", None)
    if list_id is None and free is None:
        return False
    old = (getattr(before, "access_list_id", None), bool(getattr(before, "access_unrestricted", False)))
    new = (old[0] if list_id is None else (list_id or None), old[1] if free is None else bool(free))
    if new == old:
        return False
    if not admin.is_sudo:
        raise HTTPException(status_code=403, detail="Only sudo admins can change a user's access")
    if new[0] and not db.get(AccessList, new[0]):
        raise HTTPException(status_code=400, detail=f"access_list_id: there's no access list with id {new[0]}")
    return True


@router.get("/access-lists", response_model=AccessOverview)
def get_access_lists(db: Session = Depends(get_db), admin: Admin = Depends(Admin.check_sudo_admin)):
    users, templates = _counts(db, User), _counts(db, UserTemplate)
    unrestricted = db.query(func.count(User.id)).filter(User.access_unrestricted.is_(True)).scalar() or 0
    return AccessOverview(
        policy=settings.ACCESS_DEFAULT_POLICY,
        unrestricted_users=unrestricted,
        lists=[_info(r, users, templates) for r in db.query(AccessList).order_by(AccessList.name).all()],
        admins=[AdminAccess(username=a.username, is_sudo=a.is_sudo, access_list_id=a.access_list_id)
                for a in db.query(DBAdmin).order_by(DBAdmin.username).all()],
        warnings=access.warnings(xray.config),
        pending=access.status["pending"],
        apply_error=access.status["error"],
    )


class AdminAccessModify(BaseModel):
    access_list_id: int = Field(ge=0)  # 0 = none


@router.put("/access-lists/admins/{username}", response_model=AdminAccess)
def set_admin_access(username: str, body: AdminAccessModify, db: Session = Depends(get_db),
                     admin: Admin = Depends(Admin.check_sudo_admin)):
    """Hold every user an admin owns (now and later) to an access list."""
    target = db.query(DBAdmin).filter_by(username=username).first()
    if not target:
        raise HTTPException(status_code=404, detail="Admin not found")
    if body.access_list_id:
        _get(db, body.access_list_id)
    target.access_list_id = body.access_list_id or None
    db.commit()
    logger.info(f'Access list of admin "{username}" set to {target.access_list_id} by {admin.username}')
    _apply()
    return AdminAccess(username=target.username, is_sudo=target.is_sudo, access_list_id=target.access_list_id)


@router.get("/access-lists/rules")
def get_access_rules(admin: Admin = Depends(Admin.check_sudo_admin)):
    """The routing rules the server currently gets for access lists (read-only)."""
    config = xray.config.include_db_users()
    own = len((xray.config.get("routing") or {}).get("rules", []))
    return {"rules": (config.get("routing") or {}).get("rules", [])[own:]}


@router.post("/access-lists", response_model=AccessListInfo)
def add_access_list(body: AccessListCreate, db: Session = Depends(get_db),
                    admin: Admin = Depends(Admin.check_sudo_admin)):
    if db.query(AccessList).filter_by(name=body.name).first():
        raise HTTPException(status_code=409, detail="An access list with this name already exists")
    row = AccessList(name=body.name, description=body.description or None, domains=body.domains or [], ips=body.ips or [])
    db.add(row)
    db.commit()
    db.refresh(row)
    logger.info(f'Access list "{row.name}" added by {admin.username}')
    _apply()
    return _info(row, {}, {})


@router.put("/access-lists/{list_id}", response_model=AccessListInfo)
def modify_access_list(list_id: int, body: AccessListBase, db: Session = Depends(get_db),
                       admin: Admin = Depends(Admin.check_sudo_admin)):
    row = _get(db, list_id)
    if body.name is not None and body.name != row.name:
        if db.query(AccessList).filter_by(name=body.name).first():
            raise HTTPException(status_code=409, detail="An access list with this name already exists")
        row.name = body.name
    if body.description is not None:
        row.description = body.description or None
    if body.domains is not None:
        row.domains = body.domains
    if body.ips is not None:
        row.ips = body.ips
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    logger.info(f'Access list "{row.name}" modified by {admin.username}')
    _apply()
    return _info(row, _counts(db, User), _counts(db, UserTemplate))


@router.delete("/access-lists/{list_id}")
def remove_access_list(
    list_id: int,
    move_to: Optional[int] = Query(None, description="list for its users; empty puts them on the default policy"),
    db: Session = Depends(get_db),
    admin: Admin = Depends(Admin.check_sudo_admin),
):
    row = _get(db, list_id)
    target = _get(db, move_to) if move_to else None
    if target and target.id == row.id:
        raise HTTPException(status_code=400, detail="move_to must be another list")
    for model in (User, UserTemplate, DBAdmin):
        db.query(model).filter(model.access_list_id == row.id).update({model.access_list_id: target.id if target else None})
    db.delete(row)
    db.commit()
    logger.info(f'Access list "{row.name}" deleted by {admin.username}')
    _apply()
    return {}


@router.post("/access-lists/enable-sniffing")
def enable_sniffing(admin: Admin = Depends(Admin.check_sudo_admin)):
    """Turn on sniffing (http, tls, quic) on every inbound that has it off, so
    domain rules can match. Saves the core config like the Core config page."""
    from app.routers.core import modify_core_config
    from app.utils import jsonc
    from config import XRAY_JSON

    with open(XRAY_JSON) as f:
        payload = jsonc.loads(f.read())
    changed = []
    for inbound in payload.get("inbounds", []):
        if inbound.get("tag") == "API_INBOUND" or inbound.get("protocol") == "dokodemo-door":
            continue
        sniffing = inbound.get("sniffing") or {}
        if not sniffing.get("enabled") or not sniffing.get("destOverride"):
            inbound["sniffing"] = {**sniffing, "enabled": True,
                                   "destOverride": sniffing.get("destOverride") or ["http", "tls", "quic"]}
            changed.append(inbound.get("tag"))
    if changed:
        modify_core_config(payload, admin)
        logger.info(f"Sniffing turned on for {', '.join(map(str, changed))} by {admin.username}")
    return {"changed": changed}
