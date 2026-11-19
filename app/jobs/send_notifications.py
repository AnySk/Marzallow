import time
from datetime import datetime as dt
from datetime import timedelta as td
from typing import Any, Dict, List

from fastapi.encoders import jsonable_encoder
from requests import Session

from app import logger, on_shutdown, scheduler
from app.db import GetDB
from app.db.models import NotificationReminder
from app.utils.notification import queue
from config import JOB_SEND_NOTIFICATIONS_INTERVAL
from app.settings import settings as runtime_settings

session = Session()



def _headers():
    # read on every send: the secret can be changed from the dashboard
    return {"x-webhook-secret": runtime_settings.WEBHOOK_SECRET} if runtime_settings.WEBHOOK_SECRET else None


def send(data: List[Dict[Any, Any]]) -> bool:
    """Send the notification to the webhook address provided by runtime_settings.WEBHOOK_ADDRESS

    Args:
        data (List[Dict[Any, Any]]): list of json encoded notifications

    Returns:
        bool: returns True if an ok response received
    """

    result_list = []
    for webhook in runtime_settings.WEBHOOK_ADDRESS:
        result = send_req(w_address=webhook, data=data)
        result_list.append(result)
    if True in result_list:
        return True
    else:
        return False


def send_req(w_address: str, data):
    try:
        logger.debug(f"Sending {len(data)} webhook updates to {w_address}")
        r = session.post(w_address, json=data, headers=_headers())
        if r.ok:
            return True
        logger.error(r)
    except Exception as err:
        logger.error(err)
    return False


def send_notifications():
    if not queue or not runtime_settings.WEBHOOK_ADDRESS:
        return

    notifications_to_send = list()
    try:
        while (notification := queue.popleft()):
            if (notification.tries > runtime_settings.NUMBER_OF_RECURRENT_NOTIFICATIONS):
                continue
            if notification.send_at > time.time():
                queue.append(notification)  # add it to the queue again for the next check
                continue
            notifications_to_send.append(notification)
    except IndexError:  # if the queue is empty
        pass

    if not notifications_to_send:
        return
    if not send([jsonable_encoder(notif) for notif in notifications_to_send]):
        for notification in notifications_to_send:
            if (notification.tries + 1) > runtime_settings.NUMBER_OF_RECURRENT_NOTIFICATIONS:
                continue
            notification.tries += 1
            notification.send_at = time.time() + runtime_settings.RECURRENT_NOTIFICATIONS_TIMEOUT  # retry later
            queue.append(notification)


def delete_expired_reminders() -> None:
    with GetDB() as db:
        db.query(NotificationReminder).filter(NotificationReminder.expires_at < dt.utcnow()).delete()
        db.commit()


# Always scheduled: the webhook address can be set from the dashboard at any
# time; send_notifications() does nothing while it's empty.
@on_shutdown
def app_shutdown():
    if queue and runtime_settings.WEBHOOK_ADDRESS:
        logger.info("Sending pending notifications before shutdown...")
        send_notifications()


scheduler.add_job(send_notifications, "interval",
                  seconds=JOB_SEND_NOTIFICATIONS_INTERVAL,
                  replace_existing=True)
scheduler.add_job(delete_expired_reminders, "interval", hours=2, start_date=dt.utcnow() + td(minutes=1))
