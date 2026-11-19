from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app import logger
from app.db import Session, get_db
from app.db.models import Setting
from app.models.admin import Admin
from app.settings import BY_KEY, DEFINITIONS, coerce, settings
from app.utils import responses

router = APIRouter(tags=["Settings"], prefix="/api", responses={401: responses._401, 403: responses._403})


class SettingInfo(BaseModel):
    key: str
    group: str
    type: str
    description: str
    value: Any = None            # current effective value (null for secrets)
    default: Any = None          # value from .env (null for secrets)
    overridden: bool             # true when saved from the dashboard
    secret: bool = False
    has_value: bool = True       # for secrets: whether one is set


def _info(key: str) -> SettingInfo:
    definition = BY_KEY[key]
    value, default = getattr(settings, key), settings.default(key)
    return SettingInfo(
        key=key,
        group=definition.group,
        type=definition.type,
        description=definition.description,
        value=None if definition.secret else value,
        default=None if definition.secret else default,
        overridden=settings.is_overridden(key),
        secret=definition.secret,
        has_value=bool(value),
    )


@router.get("/settings", response_model=List[SettingInfo])
def get_settings(admin: Admin = Depends(Admin.check_sudo_admin)):
    """Settings that can be changed from the dashboard, with their current values."""
    return [_info(d.key) for d in DEFINITIONS]


@router.put("/settings", response_model=List[SettingInfo], responses={400: responses._400})
def update_settings(
    changes: Dict[str, Optional[Any]],
    db: Session = Depends(get_db),
    admin: Admin = Depends(Admin.check_sudo_admin),
):
    """Save settings. A `null` value removes the override (back to the .env value)."""
    errors, coerced = {}, {}
    for key, value in changes.items():
        definition = BY_KEY.get(key)
        if not definition:
            errors[key] = "not an editable setting"
            continue
        if value is None:
            coerced[key] = None
            continue
        try:
            coerced[key] = coerce(definition, value)
        except ValueError as err:
            errors[key] = str(err)
    if errors:
        raise HTTPException(status_code=400, detail=errors)

    for key, value in coerced.items():
        row = db.get(Setting, key)
        if value is None:
            if row:
                db.delete(row)
        elif row:
            row.value, row.updated_by, row.updated_at = value, admin.username, datetime.utcnow()
        else:
            db.add(Setting(key=key, value=value, updated_by=admin.username))
    db.commit()
    settings.reload()

    for key, value in coerced.items():
        shown = "<secret>" if BY_KEY[key].secret else value
        logger.info(f'Setting {key} {"reset to .env value" if value is None else f"set to {shown!r}"} by "{admin.username}"')
    return [_info(d.key) for d in DEFINITIONS]
