"""update_shadowsocks_method

Revision ID: 08b381fc1bc7
Revises: 0f720f5c54dd
Create Date: 2023-11-03 13:41:57.120379

"""

from alembic import op
import sqlalchemy as sa
import json

# revision identifiers, used by Alembic.
revision = '08b381fc1bc7'
down_revision = '0f720f5c54dd'
branch_labels = None
depends_on = None

# Define the table using SQLAlchemy Core
proxies_table = sa.Table(
    'proxies',
    sa.MetaData(),
    sa.Column('id', sa.Integer, primary_key=True),
    sa.Column('type', sa.String),
    sa.Column('settings', sa.JSON),  # matches the real column (JSON on all dialects)
)

# `type` is an enum; cast it so the comparison also works on PostgreSQL,
# which has no enum = varchar operator.
IS_SHADOWSOCKS = sa.cast(proxies_table.c.type, sa.String) == 'Shadowsocks'


def _settings(value):
    return json.loads(value) if isinstance(value, str) else dict(value)


def upgrade() -> None:
    connection = op.get_bind()

    # Select proxies where type = 'Shadowsocks'
    stmt = sa.select(proxies_table.c.id, proxies_table.c.settings).where(
        IS_SHADOWSOCKS
    )
    result = connection.execute(stmt)

    for pid, settings in result:
        settings = _settings(settings)
        if settings.get('method') == 'chacha20-poly1305':
            new_settings = settings.copy()
            new_settings['method'] = 'chacha20-ietf-poly1305'

            # Update query using SQLAlchemy's update()
            update_stmt = (
                sa.update(proxies_table)
                .where(proxies_table.c.id == pid)
                .values(settings=new_settings)
            )
            connection.execute(update_stmt)


def downgrade() -> None:
    connection = op.get_bind()

    # Select proxies where type = 'Shadowsocks'
    stmt = sa.select(proxies_table.c.id, proxies_table.c.settings).where(
        IS_SHADOWSOCKS
    )
    result = connection.execute(stmt)

    for pid, settings in result:
        settings = _settings(settings)
        if settings.get('method') == 'chacha20-ietf-poly1305':
            new_settings = settings.copy()
            new_settings['method'] = 'chacha20-poly1305'

            # Update query using SQLAlchemy's update()
            update_stmt = (
                sa.update(proxies_table)
                .where(proxies_table.c.id == pid)
                .values(settings=new_settings)
            )
            connection.execute(update_stmt)
