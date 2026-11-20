"""subscription templates edited in the dashboard, assignable per user and host

Revision ID: e4a7c2d9b310
Revises: d3f9a2c41b77
Create Date: 2026-11-20 12:00:00.000000

"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

revision = 'e4a7c2d9b310'
down_revision = 'd3f9a2c41b77'
branch_labels = None
depends_on = None

USER_COLUMNS = ('v2ray_json_template_id', 'singbox_template_id', 'clash_template_id')


def upgrade() -> None:
    op.create_table(
        'subscription_templates',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('kind', sa.String(length=32), nullable=False, index=True),
        sa.Column('name', sa.String(length=64), nullable=False),
        sa.Column('description', sa.String(length=256), nullable=True),
        sa.Column('content', sa.Text().with_variant(mysql.MEDIUMTEXT(), 'mysql', 'mariadb'), nullable=False),
        sa.Column('is_default', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('updated_by', sa.String(length=34), nullable=True),
        sa.UniqueConstraint('kind', 'name'),
    )
    # plain integers (no foreign keys): deleting a template moves its users and
    # hosts in the application, and SQLite can't add constraints to old tables
    for table in ('users', 'user_templates'):
        for column in USER_COLUMNS:
            op.add_column(table, sa.Column(column, sa.Integer(), nullable=True))
    op.add_column('hosts', sa.Column('v2ray_json_template_id', sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('hosts') as batch:
        batch.drop_column('v2ray_json_template_id')
    for table in ('users', 'user_templates'):
        with op.batch_alter_table(table) as batch:
            for column in USER_COLUMNS:
                batch.drop_column(column)
    op.drop_table('subscription_templates')
