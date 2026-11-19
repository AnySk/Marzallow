"""Settings that sudo admins can change from the dashboard.

Each setting defaults to its value from `.env` / environment (config.py); a
value saved from the dashboard is stored in the `settings` table and takes
precedence. Values are read on every use, so changes apply immediately.

Infrastructure settings (database, ports, TLS, paths, sudo account, Telegram
bot credentials) are deliberately not editable here.
"""
import ipaddress
import threading
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional

import config


@dataclass(frozen=True)
class SettingDef:
    key: str
    group: str
    type: str  # bool | int | str | int_list | str_list
    description: str
    secret: bool = False
    validate: Optional[Callable[[Any], None]] = None


def _range(low=None, high=None):
    def check(value):
        values = value if isinstance(value, list) else [value]
        for v in values:
            if low is not None and v < low:
                raise ValueError(f"must be at least {low}")
            if high is not None and v > high:
                raise ValueError(f"must be at most {high}")
    return check


def _urls(value):
    for url in value:
        if not url.startswith(("http://", "https://")):
            raise ValueError(f"{url!r} is not an http(s) URL")


def _optional_url(value):
    if value and not value.startswith(("http://", "https://", "tg://")):
        raise ValueError("must be an http(s) or tg:// URL")


def _ips(value):
    for ip in value:
        try:
            ipaddress.ip_address(ip)
        except ValueError:
            raise ValueError(f"{ip!r} is not an IP address")


def _hours(value):
    if not value.isdigit() or int(value) < 1:
        raise ValueError("must be a whole number of hours")


DEFINITIONS: List[SettingDef] = [
    # notifications
    SettingDef("NOTIFY_USER_CREATED", "notifications", "bool", "Notify when a user is created"),
    SettingDef("NOTIFY_USER_UPDATED", "notifications", "bool", "Notify when a user is modified"),
    SettingDef("NOTIFY_USER_DELETED", "notifications", "bool", "Notify when a user is deleted"),
    SettingDef("NOTIFY_STATUS_CHANGE", "notifications", "bool", "Notify when a user is limited, expires, is disabled or enabled"),
    SettingDef("NOTIFY_USER_DATA_USED_RESET", "notifications", "bool", "Notify when a user's usage is reset"),
    SettingDef("NOTIFY_USER_SUB_REVOKED", "notifications", "bool", "Notify when a subscription is revoked"),
    SettingDef("NOTIFY_LOGIN", "notifications", "bool", "Notify on admin logins"),
    SettingDef("NOTIFY_IF_DATA_USAGE_PERCENT_REACHED", "notifications", "bool", "Warn users' admins when usage reaches a threshold"),
    SettingDef("NOTIFY_REACHED_USAGE_PERCENT", "notifications", "int_list", "Usage thresholds (%) that trigger a warning",
               validate=_range(1, 100)),
    SettingDef("NOTIFY_IF_DAYS_LEFT_REACHED", "notifications", "bool", "Warn before a user expires"),
    SettingDef("NOTIFY_DAYS_LEFT", "notifications", "int_list", "Days before expiry that trigger a warning",
               validate=_range(1, 365)),
    # webhook
    SettingDef("WEBHOOK_ADDRESS", "webhook", "str_list", "URLs that receive notifications as JSON POST requests",
               validate=_urls),
    SettingDef("WEBHOOK_SECRET", "webhook", "str", "Sent as the x-webhook-secret header", secret=True),
    SettingDef("NUMBER_OF_RECURRENT_NOTIFICATIONS", "webhook", "int", "Retries for a failed notification",
               validate=_range(0, 20)),
    SettingDef("RECURRENT_NOTIFICATIONS_TIMEOUT", "webhook", "int", "Seconds between retries",
               validate=_range(1, 86400)),
    # subscription
    SettingDef("SUB_PROFILE_TITLE", "subscription", "str", "Profile name shown in client apps"),
    SettingDef("SUB_SUPPORT_URL", "subscription", "str", "Support link shown in client apps", validate=_optional_url),
    SettingDef("SUB_UPDATE_INTERVAL", "subscription", "str", "How often clients refresh the subscription (hours)",
               validate=_hours),
    SettingDef("USE_CUSTOM_JSON_DEFAULT", "subscription", "bool", "Serve V2Ray JSON configs to every supported client"),
    SettingDef("USE_CUSTOM_JSON_FOR_V2RAYN", "subscription", "bool", "…only to V2RayN"),
    SettingDef("USE_CUSTOM_JSON_FOR_V2RAYNG", "subscription", "bool", "…only to V2RayNG"),
    SettingDef("USE_CUSTOM_JSON_FOR_STREISAND", "subscription", "bool", "…only to Streisand"),
    SettingDef("USE_CUSTOM_JSON_FOR_HAPP", "subscription", "bool", "…only to Happ"),
    # users
    SettingDef("USERS_AUTODELETE_DAYS", "users", "int",
               "Delete expired users this many days after they expired (negative disables)"),
    SettingDef("USER_AUTODELETE_INCLUDE_LIMITED_ACCOUNTS", "users", "bool", "Also auto-delete users that ran out of data"),
    # security
    SettingDef("LOGIN_MAX_FAILED_ATTEMPTS", "security", "int",
               "Failed logins per IP and account before a lockout (0 disables)", validate=_range(0, 1000)),
    SettingDef("LOGIN_LOCKOUT_SECONDS", "security", "int", "Lockout window in seconds", validate=_range(0, 86400 * 7)),
    SettingDef("LOGIN_NOTIFY_WHITE_LIST", "security", "str_list", "IPs whose successful logins aren't notified",
               validate=_ips),
    SettingDef("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "security", "int",
               "Admin session lifetime in minutes (0 = never expires); applies to new logins",
               validate=_range(0, 525600)),
]
BY_KEY: Dict[str, SettingDef] = {d.key: d for d in DEFINITIONS}


def coerce(definition: SettingDef, value: Any) -> Any:
    """Convert an API value to the setting's type and validate it."""
    kind = definition.type
    if kind == "bool":
        if not isinstance(value, bool):
            raise ValueError("must be true or false")
    elif kind == "int":
        if isinstance(value, bool) or not isinstance(value, int):
            raise ValueError("must be a whole number")
    elif kind == "str":
        if not isinstance(value, str):
            raise ValueError("must be text")
        value = value.strip()
    elif kind in ("int_list", "str_list"):
        if isinstance(value, str):  # accept "1, 2, 3"
            value = [v for v in (p.strip() for p in value.split(",")) if v]
        if not isinstance(value, list):
            raise ValueError("must be a list")
        if kind == "int_list":
            try:
                value = sorted({int(v) for v in value})
            except (TypeError, ValueError):
                raise ValueError("must be whole numbers")
        else:
            value = [str(v).strip() for v in value if str(v).strip()]
    if definition.validate:
        definition.validate(value)
    return value


class _Settings:
    """`settings.KEY` → stored override, else the value from config.py."""

    def __init__(self):
        self._overrides: Optional[Dict[str, Any]] = None
        self._lock = threading.Lock()

    def _load(self) -> Dict[str, Any]:
        if self._overrides is None:
            with self._lock:
                if self._overrides is None:
                    from app.db import GetDB
                    from app.db.models import Setting

                    with GetDB() as db:
                        self._overrides = {
                            row.key: row.value for row in db.query(Setting).all() if row.key in BY_KEY
                        }
        return self._overrides

    def __getattr__(self, key: str) -> Any:
        if key not in BY_KEY:
            raise AttributeError(key)
        overrides = self._load()
        if key in overrides:
            return overrides[key]
        return getattr(config, key)

    def default(self, key: str) -> Any:
        return getattr(config, key)

    def is_overridden(self, key: str) -> bool:
        return key in self._load()

    def reload(self) -> None:
        self._overrides = None


settings = _Settings()
