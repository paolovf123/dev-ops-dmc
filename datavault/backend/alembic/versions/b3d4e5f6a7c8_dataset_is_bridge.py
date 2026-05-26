"""dataset is_bridge

Agrega la columna `is_bridge` a `datasets` para distinguir tablas puente (N:N
junction tables) y poder ocultarlas de la lista principal por defecto.

Revision ID: b3d4e5f6a7c8
Revises: a1b2c3d4e5f6
Create Date: 2026-05-27 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "b3d4e5f6a7c8"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "datasets",
        sa.Column("is_bridge", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("datasets", "is_bridge")
