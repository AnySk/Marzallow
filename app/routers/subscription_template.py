"""Subscription templates edited in the dashboard (see app/subscription/templates.py)."""
from datetime import datetime
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func

from app import logger, xray
from app.db import Session, crud, get_db
from app.db.models import ProxyHost, SubscriptionTemplate, User, UserTemplate
from app.models.admin import Admin
from app.models.user import UserResponse
from app.subscription import templates
from app.subscription.templates import KINDS, TemplateError, TemplateKind
from app.utils import responses

router = APIRouter(tags=["Subscription templates"], prefix="/api",
                   responses={401: responses._401, 403: responses._403})


# --- models ---------------------------------------------------------------------

class TemplateUsage(BaseModel):
    users: int = 0
    hosts: int = 0
    user_templates: int = 0


class SubscriptionTemplateInfo(BaseModel):
    id: int
    kind: TemplateKind
    name: str
    description: Optional[str] = None
    is_default: bool
    updated_at: Optional[datetime] = None
    updated_by: Optional[str] = None
    usage: TemplateUsage = TemplateUsage()


class SubscriptionTemplateDetail(SubscriptionTemplateInfo):
    content: str


class BuiltinInfo(BaseModel):
    source: Literal["built-in", "file"]  # "file" when CUSTOM_TEMPLATES_DIRECTORY overrides it
    path: str
    is_default: bool  # no dashboard template is marked as default


class KindInfo(BaseModel):
    kind: TemplateKind
    label: str
    syntax: str
    builtin: BuiltinInfo
    templates: List[SubscriptionTemplateInfo]


class TemplateBase(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=64)
    description: Optional[str] = Field(None, max_length=256)
    content: Optional[str] = Field(None, max_length=1_000_000)
    is_default: Optional[bool] = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, v):
        return v.strip() if v else v


class TemplateCreate(TemplateBase):
    kind: TemplateKind
    name: str = Field(min_length=1, max_length=64)
    content: str = Field(max_length=1_000_000)


class TemplateModify(TemplateBase):
    # optimistic locking: the updated_at the editor loaded; 409 if it changed since
    expected_updated_at: Optional[datetime] = None


class ValidateRequest(BaseModel):
    kind: TemplateKind
    content: str = Field(max_length=1_000_000)


class ValidateResult(BaseModel):
    ok: bool
    message: str
    line: Optional[int] = None


class PreviewRequest(ValidateRequest):
    username: str
    # for sing-box/Clash/V2Ray JSON the format is the kind; Clash can render as clash-meta
    meta: bool = False


class PreviewResult(BaseModel):
    output: str


# --- helpers --------------------------------------------------------------------

def _usage(db: Session) -> Dict[int, TemplateUsage]:
    usage: Dict[int, TemplateUsage] = {}

    def count(column, attr):
        rows = db.query(column, func.count()).filter(column.isnot(None)).group_by(column).all()
        for template_id, n in rows:
            entry = usage.setdefault(template_id, TemplateUsage())
            setattr(entry, attr, getattr(entry, attr) + n)

    for field in templates.USER_FIELDS:
        count(getattr(User, field), "users")
        count(getattr(UserTemplate, field), "user_templates")
    count(ProxyHost.v2ray_json_template_id, "hosts")
    return usage


def _info(row: SubscriptionTemplate, usage: Dict[int, TemplateUsage], detail=False):
    data = dict(id=row.id, kind=row.kind, name=row.name, description=row.description,
                is_default=row.is_default, updated_at=row.updated_at, updated_by=row.updated_by,
                usage=usage.get(row.id, TemplateUsage()))
    if detail:
        return SubscriptionTemplateDetail(**data, content=row.content)
    return SubscriptionTemplateInfo(**data)


def _get(db: Session, template_id: int) -> SubscriptionTemplate:
    row = db.get(SubscriptionTemplate, template_id)
    if not row:
        raise HTTPException(status_code=404, detail="Template not found")
    return row


def _validate(kind: TemplateKind, content: str):
    try:
        templates.validate(kind, content)
    except TemplateError as exc:
        raise HTTPException(status_code=422, detail={"message": exc.message, "line": exc.line})


def _set_default(db: Session, row: SubscriptionTemplate):
    db.query(SubscriptionTemplate).filter(
        SubscriptionTemplate.kind == row.kind, SubscriptionTemplate.id != row.id
    ).update({SubscriptionTemplate.is_default: False})
    row.is_default = True


def check_refs(db: Session, obj, fields=None) -> None:
    """400 unless every template id set on `obj` (a user, user template or host
    model) names a template of the right kind."""
    for field in fields or templates.USER_FIELDS:
        template_id = getattr(obj, field, None)
        if not template_id:
            continue
        kind = templates.USER_FIELDS[field]  # the host field has the same name as the user's
        row = db.get(SubscriptionTemplate, template_id)
        if not row or row.kind != kind.value:
            raise HTTPException(status_code=400,
                                detail=f"{field}: there's no {KINDS[kind].label} template with id {template_id}")


# --- routes ---------------------------------------------------------------------

@router.get("/subscription-templates", response_model=List[KindInfo])
def list_subscription_templates(db: Session = Depends(get_db), admin: Admin = Depends(Admin.check_sudo_admin)):
    """All templates by kind, with the built-in one and where each is used."""
    usage = _usage(db)
    rows = db.query(SubscriptionTemplate).order_by(SubscriptionTemplate.name).all()
    result = []
    for kind, info in KINDS.items():
        _, origin = templates.builtin_source(kind)
        own = [_info(r, usage) for r in rows if r.kind == kind.value]
        result.append(KindInfo(
            kind=kind, label=info.label, syntax=info.syntax,
            builtin=BuiltinInfo(source=origin, path=info.file, is_default=not any(t.is_default for t in own)),
            templates=own,
        ))
    return result


@router.get("/subscription-templates/builtin/{kind}")
def get_builtin_template(kind: TemplateKind, admin: Admin = Depends(Admin.check_sudo_admin)):
    """The built-in (or CUSTOM_TEMPLATES_DIRECTORY) template, e.g. to duplicate it."""
    content, origin = templates.builtin_source(kind)
    return {"kind": kind, "source": origin, "path": KINDS[kind].file, "content": content}


@router.get("/subscription-templates/{template_id}", response_model=SubscriptionTemplateDetail)
def get_subscription_template(template_id: int, db: Session = Depends(get_db),
                              admin: Admin = Depends(Admin.check_sudo_admin)):
    return _info(_get(db, template_id), _usage(db), detail=True)


@router.post("/subscription-templates", response_model=SubscriptionTemplateDetail)
def add_subscription_template(new: TemplateCreate, db: Session = Depends(get_db),
                              admin: Admin = Depends(Admin.check_sudo_admin)):
    _validate(new.kind, new.content)
    if db.query(SubscriptionTemplate).filter_by(kind=new.kind.value, name=new.name).first():
        raise HTTPException(status_code=409, detail="A template with this name already exists")
    row = SubscriptionTemplate(kind=new.kind.value, name=new.name, description=new.description or None,
                               content=new.content, updated_by=admin.username)
    db.add(row)
    db.flush()
    if new.is_default:
        _set_default(db, row)
    db.commit()
    db.refresh(row)
    templates.invalidate()
    logger.info(f'Subscription template "{row.name}" ({row.kind}) added by {admin.username}')
    return _info(row, _usage(db), detail=True)


@router.put("/subscription-templates/{template_id}", response_model=SubscriptionTemplateDetail)
def modify_subscription_template(template_id: int, modified: TemplateModify, db: Session = Depends(get_db),
                                 admin: Admin = Depends(Admin.check_sudo_admin)):
    row = _get(db, template_id)
    if modified.expected_updated_at and row.updated_at and \
            abs((row.updated_at - modified.expected_updated_at.replace(tzinfo=None)).total_seconds()) > 1:
        raise HTTPException(status_code=409,
                            detail=f"Changed by {row.updated_by or 'another admin'} since you opened it; reload")
    if modified.content is not None:
        _validate(TemplateKind(row.kind), modified.content)
        row.content = modified.content
    if modified.name is not None and modified.name != row.name:
        if db.query(SubscriptionTemplate).filter_by(kind=row.kind, name=modified.name).first():
            raise HTTPException(status_code=409, detail="A template with this name already exists")
        row.name = modified.name
    if modified.description is not None:
        row.description = modified.description or None
    if modified.is_default is True:
        _set_default(db, row)
    elif modified.is_default is False:
        row.is_default = False
    row.updated_by = admin.username
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    templates.invalidate()
    logger.info(f'Subscription template "{row.name}" ({row.kind}) modified by {admin.username}')
    return _info(row, _usage(db), detail=True)


@router.delete("/subscription-templates/{template_id}")
def remove_subscription_template(
    template_id: int,
    move_to: Optional[int] = Query(None, description="template for the users and hosts using this one; "
                                                     "empty moves them to the default"),
    db: Session = Depends(get_db),
    admin: Admin = Depends(Admin.check_sudo_admin),
):
    row = _get(db, template_id)
    target = None
    if move_to:
        target = _get(db, move_to)
        if target.kind != row.kind or target.id == row.id:
            raise HTTPException(status_code=400, detail="move_to must be another template of the same kind")

    new_value = target.id if target else None
    kind = TemplateKind(row.kind)
    if field := KINDS[kind].user_field:
        for model in (User, UserTemplate):
            db.query(model).filter(getattr(model, field) == row.id).update({getattr(model, field): new_value})
    if kind == TemplateKind.v2ray_json:
        db.query(ProxyHost).filter(ProxyHost.v2ray_json_template_id == row.id) \
            .update({ProxyHost.v2ray_json_template_id: new_value})
    if row.is_default and target:
        target.is_default = True
    db.delete(row)
    db.commit()
    templates.invalidate()
    xray.hosts.update()
    logger.info(f'Subscription template "{row.name}" ({row.kind}) deleted by {admin.username}')
    return {}


@router.post("/subscription-templates/validate", response_model=ValidateResult)
def validate_subscription_template(body: ValidateRequest, admin: Admin = Depends(Admin.check_sudo_admin)):
    """Check a template without saving it."""
    try:
        return ValidateResult(ok=True, message=templates.validate(body.kind, body.content))
    except TemplateError as exc:
        return ValidateResult(ok=False, message=exc.message, line=exc.line)


@router.post("/subscription-templates/preview", response_model=PreviewResult)
def preview_subscription_template(body: PreviewRequest, db: Session = Depends(get_db),
                                  admin: Admin = Depends(Admin.check_sudo_admin)):
    """Render a user's subscription with this (unsaved) template in place of theirs."""
    from app.subscription.share import generate_subscription

    dbuser = crud.get_user(db, body.username)
    if not dbuser:
        raise HTTPException(status_code=404, detail="User not found")
    user = UserResponse.model_validate(dbuser)
    try:
        templates.validate(body.kind, body.content)
        with templates.override(body.kind, body.content):
            if body.kind == TemplateKind.subscription_page:
                output = templates.render(body.kind, {"user": user})
            else:
                fmt = {TemplateKind.v2ray_json: "v2ray-json", TemplateKind.singbox: "sing-box",
                       TemplateKind.clash: "clash-meta" if body.meta else "clash"}[body.kind]
                output = generate_subscription(user=user, config_format=fmt, as_base64=False, reverse=False)
    except TemplateError as exc:
        raise HTTPException(status_code=422, detail={"message": exc.message, "line": exc.line})
    except Exception as exc:
        raise HTTPException(status_code=422, detail={"message": f"Doesn't render: {exc}", "line": None})
    return PreviewResult(output=output)
