"""access lists: per-user domain allowlists enforced by the server's routing

Revision ID: a7d3e9c1f052
Revises: f2c8a1b7d904
Create Date: 2026-11-21 14:00:00.000000

"""
import sqlalchemy as sa
from alembic import op

revision = 'a7d3e9c1f052'
down_revision = 'f2c8a1b7d904'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'access_lists',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(length=64), nullable=False, unique=True),
        sa.Column('description', sa.String(length=256), nullable=True),
        sa.Column('domains', sa.JSON(), nullable=False),
        sa.Column('ips', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    for table in ('users', 'user_templates'):
        op.add_column(table, sa.Column('access_list_id', sa.Integer(), nullable=True))
        op.add_column(table, sa.Column('access_unrestricted', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    for table in ('users', 'user_templates'):
        with op.batch_alter_table(table) as batch:
            batch.drop_column('access_unrestricted')
            batch.drop_column('access_list_id')
    op.drop_table('access_lists')
