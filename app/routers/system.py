import time
from datetime import datetime
from typing import Dict, List, Optional, Union

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app import __version__, xray
from app.db import Session, crud, get_db
from app.models.admin import Admin
from app.models.node import NodeStatus
from app.models.proxy import ProxyHost, ProxyInbound, ProxyTypes
from app.models.system import SystemStats
from app.models.user import UserStatus
from app.utils import responses

from app.utils.system import cpu_usage, memory_usage, realtime_bandwidth
from app.settings import settings as runtime_settings

router = APIRouter(tags=["System"], prefix="/api", responses={401: responses._401})


@router.get("/system", response_model=SystemStats)
def get_system_stats(
    db: Session = Depends(get_db), admin: Admin = Depends(Admin.get_current)
):
    """Fetch system stats including memory, CPU, and user metrics."""
    mem = memory_usage()
    cpu = cpu_usage()
    system = crud.get_system_usage(db)
    dbadmin: Union[Admin, None] = crud.get_admin(db, admin.username)

    total_user = crud.get_users_count(db, admin=dbadmin if not admin.is_sudo else None)
    users_active = crud.get_users_count(
        db, status=UserStatus.active, admin=dbadmin if not admin.is_sudo else None
    )
    users_disabled = crud.get_users_count(
        db, status=UserStatus.disabled, admin=dbadmin if not admin.is_sudo else None
    )
    users_on_hold = crud.get_users_count(
        db, status=UserStatus.on_hold, admin=dbadmin if not admin.is_sudo else None
    )
    users_expired = crud.get_users_count(
        db, status=UserStatus.expired, admin=dbadmin if not admin.is_sudo else None
    )
    users_limited = crud.get_users_count(
        db, status=UserStatus.limited, admin=dbadmin if not admin.is_sudo else None
    )
    online_users = crud.count_online_users(db, 24)
    realtime_bandwidth_stats = realtime_bandwidth()

    return SystemStats(
        version=__version__,
        mem_total=mem.total,
        mem_used=mem.used,
        cpu_cores=cpu.cores,
        cpu_usage=cpu.percent,
        total_user=total_user,
        online_users=online_users,
        users_active=users_active,
        users_disabled=users_disabled,
        users_expired=users_expired,
        users_limited=users_limited,
        users_on_hold=users_on_hold,
        incoming_bandwidth=system.uplink,
        outgoing_bandwidth=system.downlink,
        incoming_bandwidth_speed=realtime_bandwidth_stats.incoming_bytes,
        outgoing_bandwidth_speed=realtime_bandwidth_stats.outgoing_bytes,
    )


@router.get("/inbounds", response_model=Dict[ProxyTypes, List[ProxyInbound]])
def get_inbounds(admin: Admin = Depends(Admin.get_current)):
    """Retrieve inbound configurations grouped by protocol."""
    return xray.config.inbounds_by_protocol


@router.get(
    "/hosts", response_model=Dict[str, List[ProxyHost]], responses={403: responses._403}
)
def get_hosts(
    db: Session = Depends(get_db), admin: Admin = Depends(Admin.check_sudo_admin)
):
    """Get a list of proxy hosts grouped by inbound tag."""
    hosts = {tag: crud.get_hosts(db, tag) for tag in xray.config.inbounds_by_tag}
    return hosts


@router.put(
    "/hosts", response_model=Dict[str, List[ProxyHost]], responses={403: responses._403}
)
def modify_hosts(
    modified_hosts: Dict[str, List[ProxyHost]],
    db: Session = Depends(get_db),
    admin: Admin = Depends(Admin.check_sudo_admin),
):
    """Modify proxy hosts and update the configuration."""
    for inbound_tag in modified_hosts:
        if inbound_tag not in xray.config.inbounds_by_tag:
            raise HTTPException(
                status_code=400, detail=f"Inbound {inbound_tag} doesn't exist"
            )

    for inbound_tag, hosts in modified_hosts.items():
        crud.update_hosts(db, inbound_tag, hosts)

    xray.hosts.update()

    return {tag: crud.get_hosts(db, tag) for tag in xray.config.inbounds_by_tag}


class SystemAlerts(BaseModel):
    expiring_soon: int        # active users expiring within `days`
    near_limit: int           # active users that used >= `percent` of their data limit
    limited: int
    expired: int
    disconnected_nodes: List[str] = []  # sudo admins only
    days: int
    percent: int


@router.get("/system/alerts", response_model=SystemAlerts)
def get_system_alerts(
    days: Optional[int] = Query(None, gt=0, le=365),
    percent: Optional[int] = Query(None, gt=0, le=100),
    db: Session = Depends(get_db),
    admin: Admin = Depends(Admin.get_current),
):
    """Things that need attention: users about to expire or run out of data,
    limited/expired users, and nodes that aren't connected."""
    days = days or max(runtime_settings.NOTIFY_DAYS_LEFT or [3])
    percent = percent or min(runtime_settings.NOTIFY_REACHED_USAGE_PERCENT or [80])
    owners = None if admin.is_sudo else [admin.username]

    def count(**filters) -> int:
        _, total = crud.get_users(db, limit=1, admins=owners, return_with_count=True, **filters)
        return total

    now = int(time.time())
    disconnected = []
    if admin.is_sudo:
        disconnected = [node.name for node in crud.get_nodes(db)
                        if node.status in (NodeStatus.error, NodeStatus.connecting)]
    return SystemAlerts(
        expiring_soon=count(status=UserStatus.active, expire_before=now + days * 86400),
        near_limit=count(status=UserStatus.active, usage_ratio_above=percent / 100),
        limited=count(status=UserStatus.limited),
        expired=count(status=UserStatus.expired),
        disconnected_nodes=disconnected,
        days=days,
        percent=percent,
    )
