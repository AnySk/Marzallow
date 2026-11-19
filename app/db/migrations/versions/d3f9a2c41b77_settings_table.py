"""settings table for dashboard-editable settings

Revision ID: d3f9a2c41b77
Revises: b8e4d1f0c2a7
Create Date: 2026-11-19 20:00:00.000000

"""
import sqlalchemy as sa
from alembic import op

revision = 'd3f9a2c41b77'
down_revision = 'b8e4d1f0c2a7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'settings',
        sa.Column('key', sa.String(length=64), primary_key=True),
        sa.Column('value', sa.JSON(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('updated_by', sa.String(length=34), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('settings')
