"""groups_and_computed_datasets

Revision ID: c3f7a2b8d91e
Revises: 29e5809b0914
Create Date: 2026-05-06 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "c3f7a2b8d91e"
down_revision: Union[str, Sequence[str], None] = "29e5809b0914"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── User groups ──────────────────────────────────────────────────────────
    op.create_table(
        "user_groups",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    op.create_table(
        "user_group_members",
        sa.Column("group_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["group_id"], ["user_groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("group_id", "user_id"),
    )

    # ── Dataset group permissions ─────────────────────────────────────────────
    op.create_table(
        "dataset_group_permissions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("dataset_id", sa.UUID(), nullable=False),
        sa.Column("group_id", sa.UUID(), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["group_id"], ["user_groups.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dataset_id", "group_id", name="uq_dataset_group_perm"),
    )

    # ── Computed dataset fields ───────────────────────────────────────────────
    op.add_column("datasets", sa.Column("is_computed", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("datasets", sa.Column("source_code", sa.Text(), nullable=True))
    op.add_column("datasets", sa.Column("source_dataset_ids", sa.JSON(), nullable=False, server_default="[]"))
    op.add_column("datasets", sa.Column("last_computed_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("datasets", "last_computed_at")
    op.drop_column("datasets", "source_dataset_ids")
    op.drop_column("datasets", "source_code")
    op.drop_column("datasets", "is_computed")
    op.drop_table("dataset_group_permissions")
    op.drop_table("user_group_members")
    op.drop_table("user_groups")
