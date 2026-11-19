"""Upstream #1965: actions done through the Telegram bot must send the same
webhook / Discord notifications as the REST API."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pytest
import telebot

import app.utils.report as report
import config
from app.db import GetDB, crud
from app.models.user import UserStatus

HANDLERS = Path(__file__).resolve().parent.parent / "app/telegram/handlers/admin.py"


class FakeBot:
    """Accepts any bot API call without touching the network."""

    def __getattr__(self, name):
        def call(*args, **kwargs):
            return SimpleNamespace(id=1, message_id=1, chat=SimpleNamespace(id=1))
        return call


@pytest.fixture
def handlers(monkeypatch):
    import app.telegram

    # handlers are registered on import, so a (network-free) bot must exist
    monkeypatch.setattr(app.telegram, "bot", telebot.TeleBot("123:abc", threaded=False))
    spec = importlib.util.spec_from_file_location("telegram_admin_handlers_under_test", HANDLERS)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    module.bot = FakeBot()
    sent = SimpleNamespace(webhook=[], discord=[], telegram=[])
    names = ("report_new_user", "report_user_modification", "report_user_deletion",
             "report_user_usage_reset", "report_user_subscription_revoked", "report_status_change")

    def recorder(target):
        return SimpleNamespace(**{name: (lambda name: lambda *a, **k: target.append(name))(name) for name in names})

    # the bot reports through app.utils.report, like the REST API
    monkeypatch.setattr(report, "notify", lambda event: sent.webhook.append(event))
    monkeypatch.setattr(report, "discord", recorder(sent.discord))
    monkeypatch.setattr(report, "telegram", recorder(sent.telegram))
    module.sent = sent
    return module


def _call(data):
    return SimpleNamespace(
        id="cb", data=data,
        from_user=SimpleNamespace(id=42, full_name="Bot Admin"),
        message=SimpleNamespace(chat=SimpleNamespace(id=42), message_id=7, html_text=""),
    )


def _reset(handlers):
    """Forget notifications from test setup (make_user goes through the REST API)."""
    for events in vars(handlers.sent).values():
        events.clear()


def _actions(sent):
    return [event.action.value for event in sent.webhook]


def test_edit_note_reports_update(handlers, make_user):
    make_user("tg_note")
    _reset(handlers)
    handlers.mem_store.set("42:username", "tg_note")
    message = SimpleNamespace(text="vip", id=3, chat=SimpleNamespace(id=42),
                              from_user=SimpleNamespace(full_name="Bot Admin"))
    handlers.edit_note_step(message)

    assert _actions(handlers.sent) == ["user_updated"]
    assert handlers.sent.webhook[0].by.username == "telegram-bot"
    assert handlers.sent.discord == ["report_user_modification"]
    # the bot already posts its own log-channel message; don't duplicate it
    assert handlers.sent.telegram == []


def test_suspend_reports_update_and_status_change(handlers, make_user):
    make_user("tg_suspend")
    _reset(handlers)
    handlers.confirm_user_command(_call("confirm:suspend:tg_suspend"))

    with GetDB() as db:
        assert crud.get_user(db, "tg_suspend").status == UserStatus.disabled
    assert _actions(handlers.sent) == ["user_updated", "user_disabled"]
    assert handlers.sent.discord == ["report_user_modification", "report_status_change"]


def test_delete_reports_deletion(handlers, make_user):
    make_user("tg_delete")
    _reset(handlers)
    handlers.confirm_user_command(_call("confirm:delete:tg_delete"))

    with GetDB() as db:
        assert crud.get_user(db, "tg_delete") is None
    assert _actions(handlers.sent) == ["user_deleted"]
    assert handlers.sent.webhook[0].username == "tg_delete"


def test_revoke_subscription_reported(handlers, make_user):
    make_user("tg_revoke")
    _reset(handlers)
    handlers.confirm_user_command(_call("confirm:revoke_sub:tg_revoke"))
    assert _actions(handlers.sent) == ["subscription_revoked"]


def test_notification_flags_respected(handlers, make_user, monkeypatch):
    make_user("tg_quiet")
    _reset(handlers)
    monkeypatch.setattr(config, "NOTIFY_USER_SUB_REVOKED", False)  # settings fall back to config
    handlers.confirm_user_command(_call("confirm:revoke_sub:tg_quiet"))
    assert handlers.sent.webhook == [] and handlers.sent.discord == []


def test_notification_failure_does_not_break_action(handlers, make_user, monkeypatch):
    make_user("tg_robust")
    _reset(handlers)

    def boom(event):
        raise RuntimeError("webhook down")

    with monkeypatch.context() as patch:  # scoped: fixture teardown uses the REST API
        patch.setattr(report, "notify", boom)
        handlers.confirm_user_command(_call("confirm:reset_usage:tg_robust"))  # must not raise
    with GetDB() as db:
        assert crud.get_user(db, "tg_robust").used_traffic == 0
