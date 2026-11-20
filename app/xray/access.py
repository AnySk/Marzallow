"""Access lists: which sites each user may reach, enforced by the server.

Every user is either
- unrestricted (may reach anything),
- on an access list (may reach only that list's domains and IP ranges), or
- on the default policy (ACCESS_DEFAULT_POLICY):
    all            anything (no rules are added)
    except_listed  anything except the domains/IPs that appear in any list
    none           nothing

The rules are Xray routing rules matched on the user's identity in the
server config ("<id>.<username>", the client email the panel sets). They are
added after the config's own rules, so its safety rules (private IPs,
BitTorrent …) still apply to everyone, and they are regenerated every time
the config is built (core start/restart, nodes), so they follow users being
created, changed and deleted.

Domain rules need sniffing on the inbounds, or Xray only sees IP addresses.
"""
import ipaddress
import threading
from collections import defaultdict
from typing import Dict, List, Optional

DOMAIN_PREFIXES = ("domain:", "full:", "regexp:", "keyword:", "geosite:", "ext:")
IP_PREFIXES = ("geoip:", "ext:")
BLOCK_TAG = "access-blocked"
CATCH_ALL = {"network": "tcp,udp"}
# rule fields that narrow what a rule matches; a rule with none of these matches everything
_CONDITIONS = ("domain", "ip", "port", "sourcePort", "source", "sourceIP", "user", "inboundTag",
               "protocol", "attrs", "localIP", "localPort", "vlessRoute", "process")


def normalize_domain(entry: str) -> str:
    entry = entry.strip().lower()
    if not entry:
        raise ValueError("empty domain")
    if entry.startswith(DOMAIN_PREFIXES):
        return entry
    if entry.startswith(("http://", "https://")) or "/" in entry or " " in entry:
        raise ValueError(f"{entry!r} isn't a domain (write it without http:// and paths)")
    return "domain:" + entry.lstrip("*.").lstrip(".")


def normalize_ip(entry: str) -> str:
    entry = entry.strip()
    if not entry:
        raise ValueError("empty IP range")
    if entry.startswith(IP_PREFIXES):
        return entry
    try:
        return str(ipaddress.ip_network(entry, strict=False))
    except ValueError:
        raise ValueError(f"{entry!r} isn't an IP address or range")


def _outbound_tags(config: dict) -> tuple[str, str]:
    """(allow tag, block tag): the default outbound and a blackhole, tagging or
    adding them as needed (on this copy of the config only)."""
    outbounds = config.setdefault("outbounds", [])
    if not outbounds:
        outbounds.append({"protocol": "freedom", "tag": "direct"})
    first = outbounds[0]
    if not first.get("tag"):
        first["tag"] = "direct"
    block = next((o for o in outbounds if o.get("protocol") == "blackhole" and o.get("tag")), None)
    if not block:
        block = {"protocol": "blackhole", "tag": BLOCK_TAG}
        outbounds.append(block)
    return first["tag"], block["tag"]


def build_rules(users: List[tuple], lists: Dict[int, dict], policy: str, allow: str, block: str) -> List[dict]:
    """users: (email, access_list_id, unrestricted); lists: id -> {domains, ips}."""
    unrestricted = [email for email, _, free in users if free]
    by_list: Dict[int, List[str]] = defaultdict(list)
    for email, list_id, free in users:
        if not free and list_id in lists:
            by_list[list_id].append(email)

    rules: List[dict] = []
    if policy != "all" and unrestricted:
        rules.append({"type": "field", "user": unrestricted, "outboundTag": allow})
    for list_id, emails in by_list.items():
        lst = lists[list_id]
        if lst["domains"]:
            rules.append({"type": "field", "user": emails, "domain": lst["domains"], "outboundTag": allow})
        if lst["ips"]:
            rules.append({"type": "field", "user": emails, "ip": lst["ips"], "outboundTag": allow})
        rules.append({"type": "field", "user": emails, **CATCH_ALL, "outboundTag": block})
    if policy == "except_listed":
        domains = sorted({d for lst in lists.values() for d in lst["domains"]})
        ips = sorted({i for lst in lists.values() for i in lst["ips"]})
        if domains:
            rules.append({"type": "field", "domain": domains, "outboundTag": block})
        if ips:
            rules.append({"type": "field", "ip": ips, "outboundTag": block})
    elif policy == "none":
        rules.append({"type": "field", **CATCH_ALL, "outboundTag": block})
    return rules


def apply(config: dict, db) -> None:
    """Add the access rules for the users in `config` (called by include_db_users)."""
    from app.db.models import AccessList, User
    from app.settings import settings

    policy = settings.ACCESS_DEFAULT_POLICY
    lists = {row.id: {"domains": list(row.domains or []), "ips": list(row.ips or [])}
             for row in db.query(AccessList).all()}
    # every user with an access setting, whatever their status: a disabled user
    # who is enabled again is added to Xray without a restart and must already
    # be covered by the rules
    users = [
        (f"{uid}.{username}", list_id, bool(free))
        for uid, username, list_id, free in db.query(
            User.id, User.username, User.access_list_id, User.access_unrestricted
        ).filter((User.access_list_id.isnot(None)) | (User.access_unrestricted.is_(True))).all()
    ]
    if policy == "all" and not any(list_id in lists for _, list_id, free in users if not free):
        return  # nothing to enforce
    allow, block = _outbound_tags(config)
    rules = build_rules(users, lists, policy, allow, block)
    if rules:
        config.setdefault("routing", {}).setdefault("rules", []).extend(rules)


def warnings(config: dict) -> List[str]:
    """Things in the core config that stop access rules from working."""
    found = []
    for inbound in config.get("inbounds", []):
        if inbound.get("tag") == "API_INBOUND" or inbound.get("protocol") == "dokodemo-door":
            continue
        sniffing = inbound.get("sniffing") or {}
        if not sniffing.get("enabled"):
            found.append(f'Inbound "{inbound.get("tag")}" has sniffing off, so domain rules can\'t match its traffic.')
        elif sniffing.get("routeOnly") is False and not sniffing.get("destOverride"):
            found.append(f'Inbound "{inbound.get("tag")}" sniffs without destOverride; add "http", "tls", "quic".')
    for index, rule in enumerate((config.get("routing") or {}).get("rules", [])):
        if rule.get("outboundTag") == "API" or rule.get("inboundTag") == ["API_INBOUND"]:
            continue
        if not any(rule.get(key) for key in _CONDITIONS) and rule.get("network") in (None, "tcp,udp", "udp,tcp"):
            found.append(f"Routing rule {index + 1} matches all traffic, so access rules after it never apply.")
            break
    return found


# --- applying changes -------------------------------------------------------------

_timer: Optional[threading.Timer] = None
_timer_lock = threading.Lock()


def _restart():
    from app import logger, xray

    try:
        config = xray.config.include_db_users()
        xray.core.restart(config)
        for node_id, node in list(xray.nodes.items()):
            if node.connected:
                xray.operations.restart_node(node_id, config)
        logger.info("Xray restarted to apply access list changes")
    except Exception as exc:  # pragma: no cover - logged, retried on the next change
        logger.error(f"Applying access list changes failed: {exc}")


def schedule_restart(delay: float = 2.0) -> None:
    """Restart the core (and nodes) shortly, once for a burst of changes."""
    global _timer
    with _timer_lock:
        if _timer:
            _timer.cancel()
        _timer = threading.Timer(delay, _restart)
        _timer.daemon = True
        _timer.start()
