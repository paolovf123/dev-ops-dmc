"""performance_indexes

Agrega índices que faltan para consultas comunes:
- change_history: record_id (history por record), changed_at (orden), user_id (audit por usuario)
- records: (dataset_id, deleted_at) compuesto para list_records, created_at para orderby
- column_definitions: dataset_id (join frecuente)
- dataset_permissions: (dataset_id, user_id) único + lookup; user_id solo
- dataset_group_permissions: group_id (subquery en list_datasets)
- workspace_members: user_id (filtro user → workspaces)

Todos los CREATE/DROP usan IF NOT EXISTS / IF EXISTS para que el rollback sea
idempotente y no rompa entornos donde el índice se creó manualmente.

Revision ID: f7a8b9c0d1e2
Revises: 4d9b3e33f961
Create Date: 2026-05-18 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op


revision: str = 'f7a8b9c0d1e2'
down_revision: Union[str, Sequence[str], None] = '4d9b3e33f961'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


INDEXES: list[tuple[str, str, str]] = [
    # (index_name, table, column_expression)
    ("ix_change_history_record_id",         "change_history",            "record_id"),
    ("ix_change_history_changed_at",        "change_history",            "changed_at"),
    ("ix_change_history_user_id",           "change_history",            "user_id"),
    ("ix_records_dataset_deleted_at",       "records",                   "dataset_id, deleted_at"),
    ("ix_records_created_at",               "records",                   "created_at"),
    ("ix_column_definitions_dataset_id",    "column_definitions",        "dataset_id"),
    ("ix_dataset_permissions_user_id",      "dataset_permissions",       "user_id"),
    ("ix_dataset_permissions_dataset_user", "dataset_permissions",       "dataset_id, user_id"),
    ("ix_dataset_group_permissions_group",  "dataset_group_permissions", "group_id"),
    ("ix_workspace_members_user_id",        "workspace_members",         "user_id"),
]


def upgrade() -> None:
    for name, table, cols in INDEXES:
        op.execute(f"CREATE INDEX IF NOT EXISTS {name} ON {table} ({cols})")


def downgrade() -> None:
    for name, _, _ in INDEXES:
        op.execute(f"DROP INDEX IF EXISTS {name}")
