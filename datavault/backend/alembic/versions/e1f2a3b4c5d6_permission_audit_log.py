"""permission_audit_log

Crea la tabla permission_audit_logs para auditar cambios de permisos
de usuario y de grupo sobre datasets.

Revision ID: e1f2a3b4c5d6
Revises: f7a8b9c0d1e2
Create Date: 2026-05-20 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = 'e1f2a3b4c5d6'
down_revision: Union[str, Sequence[str], None] = 'f7a8b9c0d1e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'permission_audit_logs',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('dataset_id', UUID(as_uuid=True),
                  sa.ForeignKey('datasets.id', ondelete='CASCADE'), nullable=False),
        sa.Column('target_user_id', UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('target_group_id', UUID(as_uuid=True),
                  sa.ForeignKey('user_groups.id', ondelete='SET NULL'), nullable=True),
        sa.Column('old_role', sa.String(20), nullable=True),
        sa.Column('new_role', sa.String(20), nullable=False),
        sa.Column('changed_by', UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('changed_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_perm_audit_dataset_id', 'permission_audit_logs', ['dataset_id'])
    op.create_index('ix_perm_audit_changed_at', 'permission_audit_logs', ['changed_at'])


def downgrade() -> None:
    op.drop_index('ix_perm_audit_changed_at', table_name='permission_audit_logs')
    op.drop_index('ix_perm_audit_dataset_id', table_name='permission_audit_logs')
    op.drop_table('permission_audit_logs')
