"""workspace_roles_v2

Revision ID: 4d9b3e33f961
Revises: d4e8f1a2b3c5
Create Date: 2026-05-07 21:46:08.550321

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '4d9b3e33f961'
down_revision: Union[str, Sequence[str], None] = 'd4e8f1a2b3c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Migrate old roles to new schema:
    # admin  → manager  (workspace admin becomes manager)
    # member → viewer   (plain member becomes viewer)
    # owner stays owner
    op.execute("UPDATE workspace_members SET role = 'manager' WHERE role = 'admin'")
    op.execute("UPDATE workspace_members SET role = 'viewer'  WHERE role = 'member'")


def downgrade() -> None:
    op.execute("UPDATE workspace_members SET role = 'admin'  WHERE role = 'manager'")
    op.execute("UPDATE workspace_members SET role = 'member' WHERE role = 'viewer'")
