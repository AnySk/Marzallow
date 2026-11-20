"""Subscription templates: the base config each subscription format is built on.

Each kind has a built-in template (app/templates, or the same path under
CUSTOM_TEMPLATES_DIRECTORY). Admins can add templates in the dashboard; they're
stored in the database and rendered in Jinja's sandbox. Which one is used:

- V2Ray JSON (one config per host): the host's template, else the user's,
  else the default for the kind.
- sing-box, Clash: the user's template, else the default.
- Subscription page: the default.

"The default" is the dashboard template marked as default, else the built-in one.
"""
import json
import threading
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from enum import Enum
from typing import Dict, Optional

import yaml
from jinja2 import Template, TemplateNotFound, TemplateSyntaxError
from jinja2.sandbox import SandboxedEnvironment

from app.templates import env as file_env
from config import (
    CLASH_SUBSCRIPTION_TEMPLATE,
    SINGBOX_SUBSCRIPTION_TEMPLATE,
    SUBSCRIPTION_PAGE_TEMPLATE,
    V2RAY_SUBSCRIPTION_TEMPLATE,
)


class TemplateKind(str, Enum):
    v2ray_json = "v2ray_json"
    singbox = "singbox"
    clash = "clash"
    subscription_page = "subscription_page"


@dataclass(frozen=True)
class KindInfo:
    label: str
    file: str
    syntax: str  # json | yaml | html
    user_field: Optional[str]  # users / user_templates column assigning it


KINDS: Dict[TemplateKind, KindInfo] = {
    TemplateKind.v2ray_json: KindInfo("V2Ray JSON", V2RAY_SUBSCRIPTION_TEMPLATE, "json", "v2ray_json_template_id"),
    TemplateKind.singbox: KindInfo("sing-box", SINGBOX_SUBSCRIPTION_TEMPLATE, "json", "singbox_template_id"),
    TemplateKind.clash: KindInfo("Clash", CLASH_SUBSCRIPTION_TEMPLATE, "yaml", "clash_template_id"),
    TemplateKind.subscription_page: KindInfo("Subscription page", SUBSCRIPTION_PAGE_TEMPLATE, "html", None),
}
USER_FIELDS = {info.user_field: kind for kind, info in KINDS.items() if info.user_field}

# Dashboard templates come from the browser, so they can't reach Python objects
# beyond what's passed in. Same filters and globals as the file templates.
sandbox = SandboxedEnvironment(loader=file_env.loader)
sandbox.filters.update(file_env.filters)
sandbox.globals.update(file_env.globals)
# The subscription page is HTML shown to end users and contains admin-entered
# text (notes, usernames), so it's always autoescaped, file templates included.
sandbox_html = SandboxedEnvironment(loader=file_env.loader, autoescape=True)
sandbox_html.filters.update(file_env.filters)
sandbox_html.globals.update(file_env.globals)
file_env_html = file_env.overlay(autoescape=True)


def _compile(kind: TemplateKind, content: str) -> Template:
    env = sandbox_html if KINDS[kind].syntax == "html" else sandbox
    return env.from_string(content)


class _Cache:
    def __init__(self):
        self.lock = threading.Lock()
        self.loaded = False
        self.by_id: Dict[int, tuple] = {}  # id -> (kind, Template)
        self.defaults: Dict[TemplateKind, int] = {}

    def invalidate(self):
        with self.lock:
            self.loaded = False

    def load(self):
        with self.lock:
            if self.loaded:
                return
            from app.db import GetDB
            from app.db.models import SubscriptionTemplate

            by_id, defaults = {}, {}
            with GetDB() as db:
                for row in db.query(SubscriptionTemplate).all():
                    try:
                        kind = TemplateKind(row.kind)
                        compiled = _compile(kind, row.content)
                    except (ValueError, TemplateSyntaxError):
                        continue  # saved templates are validated; skip anything broken
                    by_id[row.id] = (kind, compiled)
                    if row.is_default:
                        defaults[kind] = row.id
            self.by_id, self.defaults, self.loaded = by_id, defaults, True


_cache = _Cache()
invalidate = _cache.invalidate

# preview/validation: render a not-yet-saved template in place of the chosen one
_override: ContextVar[Optional[tuple]] = ContextVar("subscription_template_override", default=None)


@contextmanager
def override(kind: TemplateKind, content: str):
    token = _override.set((kind, _compile(kind, content)))
    try:
        yield
    finally:
        _override.reset(token)


def builtin(kind: TemplateKind) -> Template:
    env = file_env_html if KINDS[kind].syntax == "html" else file_env
    return env.get_template(KINDS[kind].file)


def builtin_source(kind: TemplateKind) -> tuple[str, str]:
    """(source text, origin) of the built-in template; origin is "file" when it
    comes from CUSTOM_TEMPLATES_DIRECTORY."""
    source, filename, _ = file_env.loader.get_source(file_env, KINDS[kind].file)
    origin = "built-in" if "app/templates" in (filename or "").replace("\\", "/") else "file"
    return source, origin


def get(kind: TemplateKind, *candidates: Optional[int]) -> Template:
    """The template for `kind`: the first candidate id that exists for this
    kind, else the default."""
    if (o := _override.get()) and o[0] == kind:
        return o[1]
    _cache.load()
    for template_id in candidates:
        if template_id and (found := _cache.by_id.get(template_id)) and found[0] == kind:
            return found[1]
    if (default_id := _cache.defaults.get(kind)) and default_id in _cache.by_id:
        return _cache.by_id[default_id][1]
    return builtin(kind)


def render(kind: TemplateKind, context: Optional[dict] = None, *candidates: Optional[int]) -> str:
    return get(kind, *candidates).render(context or {})


# --- validation ---------------------------------------------------------------

class TemplateError(ValueError):
    def __init__(self, message: str, line: Optional[int] = None):
        super().__init__(message)
        self.message = message
        self.line = line


def _sample_user():
    from datetime import datetime

    from app.models.user import UserResponse, UserStatus

    return UserResponse(
        username="sample_user", status=UserStatus.active, used_traffic=5 * 1024 ** 3,
        lifetime_used_traffic=5 * 1024 ** 3, data_limit=50 * 1024 ** 3, expire=None,
        created_at=datetime.utcnow(), proxies={"vless": {}}, inbounds={},
        links=["vless://00000000-0000-0000-0000-000000000000@example.com:443#sample"],
        subscription_url="https://example.com/sub/sample",
    )


def validate(kind: TemplateKind, content: str) -> str:
    """Check that `content` parses and renders to what the kind needs. Returns a
    short summary; raises TemplateError with a line number when it can."""
    try:
        template = _compile(kind, content)
    except TemplateSyntaxError as exc:
        raise TemplateError(f"Template syntax: {exc.message}", exc.lineno)

    syntax = KINDS[kind].syntax
    from app.subscription.share import setup_format_variables

    user = _sample_user()
    context = {"user": user, "info": dict(setup_format_variables(user.__dict__))}
    if kind == TemplateKind.clash:
        context.update(conf={"proxies": [], "proxy-groups": [], "rules": []}, proxy_remarks=[])
    try:
        output = template.render(context)
    except Exception as exc:  # undefined variables, sandbox violations, filter errors
        raise TemplateError(f"Doesn't render: {exc}")

    if syntax == "json":
        try:
            data = json.loads(output)
        except json.JSONDecodeError as exc:
            raise TemplateError(f"Renders to invalid JSON: {exc.msg} (line {exc.lineno} of the output)",
                                exc.lineno if output == content else None)
        if not isinstance(data, dict) or not isinstance(data.get("outbounds"), list):
            raise TemplateError('Must be a JSON object with an "outbounds" list; the panel adds its outbounds to it')
        return f"Valid · {len(data['outbounds'])} outbounds of its own"
    if syntax == "yaml":
        try:
            data = yaml.safe_load(output)
        except yaml.YAMLError as exc:
            line = getattr(getattr(exc, "problem_mark", None), "line", None)
            raise TemplateError(f"Renders to invalid YAML: {getattr(exc, 'problem', exc)}",
                                line + 1 if line is not None and output == content else None)
        if not isinstance(data, dict):
            raise TemplateError("Must render to a YAML mapping")
        return "Valid"
    return "Valid"


__all__ = ["TemplateKind", "KINDS", "USER_FIELDS", "TemplateNotFound", "get", "render", "validate",
           "override", "invalidate", "builtin_source", "TemplateError"]
