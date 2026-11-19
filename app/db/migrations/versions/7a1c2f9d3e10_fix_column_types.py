"""fix column types: user agent length, 64-bit timestamps and template limits

- Migration 025d427831dd only passed `existing_type`, which doesn't change the
  column, so MySQL/MariaDB kept sub_last_user_agent as VARCHAR(64) and long
  User-Agents (any browser) failed with "Data too long" in strict mode.
- users.expire / next_plans.expire are UNIX timestamps stored as 32-bit
  INTEGERs, so expiry dates after 2038-01-19 could not be saved, and
  user_templates.data_limit was too, so templates over ~2 GB failed
  (MySQL/MariaDB strict mode, PostgreSQL).

SQLite ignores VARCHAR lengths and its INTEGER is already 64-bit.

Revision ID: 7a1c2f9d3e10
Revises: c5c2420d57bc
Create Date: 2026-11-19 12:00:00.000000

"""
import sqlalchemy as sa
from alembic import op

revision = '7a1c2f9d3e10'
down_revision = 'c5c2420d57bc'
branch_labels = None
depends_on = None


# 32-bit INTEGER columns the models declare as BigInteger
BIGINT_COLUMNS = [
    ('users', 'expire'),
    ('next_plans', 'expire'),
    ('user_templates', 'data_limit'),
    ('user_templates', 'expire_duration'),
]


def _skip():
    return op.get_bind().dialect.name == 'sqlite'


def upgrade() -> None:
    if _skip():
        return
    op.alter_column('users', 'sub_last_user_agent',
                    existing_type=sa.String(length=64), type_=sa.String(length=512),
                    existing_nullable=True)
    for table, column in BIGINT_COLUMNS:
        op.alter_column(table, column,
                        existing_type=sa.Integer(), type_=sa.BigInteger(),
                        existing_nullable=True)


def downgrade() -> None:
    if _skip():
        return
    for table, column in reversed(BIGINT_COLUMNS):
        op.alter_column(table, column,
                        existing_type=sa.BigInteger(), type_=sa.Integer(),
                        existing_nullable=True)
    op.alter_column('users', 'sub_last_user_agent',
                    existing_type=sa.String(length=512), type_=sa.String(length=64),
                    existing_nullable=True)
