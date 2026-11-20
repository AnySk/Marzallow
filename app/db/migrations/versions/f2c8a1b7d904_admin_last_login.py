"""admins.last_login_at for the admins page

Revision ID: f2c8a1b7d904
Revises: e4a7c2d9b310
Create Date: 2026-11-21 10:00:00.000000

"""
import sqlalchemy as sa
from alembic import op

revision = 'f2c8a1b7d904'
down_revision = 'e4a7c2d9b310'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('admins', sa.Column('last_login_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('admins') as batch:
        batch.drop_column('last_login_at')
