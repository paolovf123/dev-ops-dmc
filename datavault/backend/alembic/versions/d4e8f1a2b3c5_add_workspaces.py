"""add_workspaces

Revision ID: d4e8f1a2b3c5
Revises: c3f7a2b8d91e
Create Date: 2026-05-07

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = 'd4e8f1a2b3c5'
down_revision = 'c3f7a2b8d91e'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'workspaces',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        'workspace_members',
        sa.Column('workspace_id', UUID(as_uuid=True), sa.ForeignKey('workspaces.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('role', sa.String(20), nullable=False, server_default='member'),
        sa.Column('joined_at', sa.DateTime(timezone=True), nullable=False),
    )

    op.add_column('datasets', sa.Column('workspace_id', UUID(as_uuid=True), sa.ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=True))
    op.create_index('ix_datasets_workspace_id', 'datasets', ['workspace_id'])

    op.add_column('user_groups', sa.Column('workspace_id', UUID(as_uuid=True), sa.ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=True))
    op.create_index('ix_user_groups_workspace_id', 'user_groups', ['workspace_id'])

    # El unique constraint global en user_groups.name ya no aplica (nombre único por workspace)
    op.drop_constraint('user_groups_name_key', 'user_groups', type_='unique')
    op.create_unique_constraint('uq_user_group_name_workspace', 'user_groups', ['workspace_id', 'name'])


def downgrade() -> None:
    from sqlalchemy import text
    conn = op.get_bind()
    dupes = conn.execute(text(
        "SELECT name, COUNT(DISTINCT workspace_id) AS ws_count "
        "FROM user_groups GROUP BY name HAVING COUNT(DISTINCT workspace_id) > 1"
    )).fetchall()
    if dupes:
        names = [row[0] for row in dupes]
        raise RuntimeError(
            f"No se puede hacer downgrade: existen grupos con nombre duplicado "
            f"entre workspaces: {names}. Renómbralos antes de revertir."
        )

    op.drop_constraint('uq_user_group_name_workspace', 'user_groups', type_='unique')
    op.create_unique_constraint('user_groups_name_key', 'user_groups', ['name'])

    op.drop_index('ix_user_groups_workspace_id', table_name='user_groups')
    op.drop_column('user_groups', 'workspace_id')

    op.drop_index('ix_datasets_workspace_id', table_name='datasets')
    op.drop_column('datasets', 'workspace_id')

    op.drop_table('workspace_members')
    op.drop_table('workspaces')
