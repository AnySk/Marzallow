"""hosts: pinned certificate hash and verification name

xray-core removed allowInsecure in favour of pinnedPeerCertSha256 and
verifyPeerCertByName (share-link params pcs / vcn) - upstream Marzban #2060.

Revision ID: b8e4d1f0c2a7
Revises: 7a1c2f9d3e10
Create Date: 2026-11-19 13:00:00.000000

"""
import sqlalchemy as sa
from alembic import op

revision = 'b8e4d1f0c2a7'
down_revision = '7a1c2f9d3e10'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('hosts') as batch_op:
        batch_op.add_column(sa.Column('pinned_peer_cert_sha256', sa.String(length=1024), nullable=True))
        batch_op.add_column(sa.Column('verify_peer_cert_by_name', sa.String(length=512), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('hosts') as batch_op:
        batch_op.drop_column('verify_peer_cert_by_name')
        batch_op.drop_column('pinned_peer_cert_sha256')
