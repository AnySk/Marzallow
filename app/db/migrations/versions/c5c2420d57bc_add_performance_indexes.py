"""add indexes for columns filtered by the periodic jobs

users.status / users.expire / users.admin_id, node_user_usages.user_id and
notification_reminders.user_id are queried on every scheduler tick but had no
index (upstream Marzban PR #2069). MySQL/MariaDB already index foreign-key
columns implicitly, so only indexes that don't exist yet are created.

Revision ID: c5c2420d57bc
Revises: 2b231de97dc3
Create Date: 2026-06-11 17:10:00.000000

"""
import sqlalchemy as sa
from alembic import op

revision = 'c5c2420d57bc'
down_revision = '2b231de97dc3'
branch_labels = None
depends_on = None

INDEXES = [
    ('users', 'ix_users_status', 'status'),
    ('users', 'ix_users_expire', 'expire'),
    ('users', 'ix_users_admin_id', 'admin_id'),
    ('node_user_usages', 'ix_node_user_usages_user_id', 'user_id'),
    ('notification_reminders', 'ix_notification_reminders_user_id', 'user_id'),
]


def _existing(table):
    return {ix['name'] for ix in sa.inspect(op.get_bind()).get_indexes(table)}


def upgrade() -> None:
    for table, name, column in INDEXES:
        if name not in _existing(table):
            op.create_index(name, table, [column])


def downgrade() -> None:
    for table, name, _ in reversed(INDEXES):
        if name in _existing(table):
            op.drop_index(name, table_name=table)
