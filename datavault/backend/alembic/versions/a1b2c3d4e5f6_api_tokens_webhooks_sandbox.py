"""api_tokens, webhooks, workspaces.is_sandbox

Revision ID: a1b2c3d4e5f6
Revises: e1f2a3b4c5d6
Create Date: 2026-05-25
"""
from __future__ import annotations
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

revision = "a1b2c3d4e5f6"
down_revision = "e1f2a3b4c5d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # workspaces.is_sandbox
    op.add_column(
        "workspaces",
        sa.Column("is_sandbox", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    # api_tokens
    op.create_table(
        "api_tokens",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", pg.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("prefix", sa.String(12), nullable=False),
        sa.Column("token_hash", sa.Text(), nullable=False),
        sa.Column("scope", sa.String(10), nullable=False, server_default="read"),
        sa.Column("workspace_id", pg.UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_index("ix_api_tokens_prefix", "api_tokens", ["prefix"])
    op.create_index("ix_api_tokens_user_id", "api_tokens", ["user_id"])

    # webhooks
    op.create_table(
        "webhooks",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("workspace_id", pg.UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True),
        sa.Column("dataset_id", pg.UUID(as_uuid=True), sa.ForeignKey("datasets.id", ondelete="CASCADE"), nullable=True),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("events", pg.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("secret", sa.Text(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_by", pg.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("last_fired_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_status", sa.Integer(), nullable=True),
        sa.Column("fail_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.create_index("ix_webhooks_workspace_id", "webhooks", ["workspace_id"])
    op.create_index("ix_webhooks_dataset_id", "webhooks", ["dataset_id"])


def downgrade() -> None:
    op.drop_index("ix_webhooks_dataset_id", table_name="webhooks")
    op.drop_index("ix_webhooks_workspace_id", table_name="webhooks")
    op.drop_table("webhooks")
    op.drop_index("ix_api_tokens_user_id", table_name="api_tokens")
    op.drop_index("ix_api_tokens_prefix", table_name="api_tokens")
    op.drop_table("api_tokens")
    op.drop_column("workspaces", "is_sandbox")
