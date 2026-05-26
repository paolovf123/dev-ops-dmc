from __future__ import annotations
import re
import uuid
from datetime import datetime
from pydantic import BaseModel, Field, field_validator, EmailStr


# ── Auth ──────────────────────────────────────────────────────────────────────

class UserRegister(BaseModel):
    email: EmailStr
    username: str
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    username: str
    role: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdateRole(BaseModel):
    role: str  # admin | editor | viewer


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ── Dataset ───────────────────────────────────────────────────────────────────

class DatasetCreate(BaseModel):
    name: str
    description: str | None = None
    workspace_id: uuid.UUID | None = None
    is_computed: bool = False
    source_code: str | None = None
    source_dataset_ids: list[str] = []
    is_bridge: bool = False


class DatasetUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    source_code: str | None = None
    source_dataset_ids: list[str] | None = None
    is_bridge: bool | None = None


class DatasetOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    workspace_id: uuid.UUID | None
    created_at: datetime
    is_computed: bool
    source_code: str | None
    source_dataset_ids: list
    last_computed_at: datetime | None
    is_bridge: bool = False

    model_config = {"from_attributes": True}


# ── Column ────────────────────────────────────────────────────────────────────

_FIELD_KEY_RE = re.compile(r'^[a-z0-9_]{1,64}$')


class ColumnCreate(BaseModel):
    name: str
    field_key: str
    data_type: str  # text | number | date | enum | boolean
    rules: dict = {}
    position: int = 0

    @field_validator("field_key")
    @classmethod
    def validate_field_key(cls, v: str) -> str:
        if not _FIELD_KEY_RE.match(v):
            raise ValueError("field_key debe contener solo letras minúsculas, números y guiones bajos (máx 64 chars)")
        return v


class ColumnUpdate(BaseModel):
    name: str | None = None
    data_type: str | None = None
    rules: dict | None = None
    position: int | None = None


class ColumnOut(BaseModel):
    id: uuid.UUID
    dataset_id: uuid.UUID
    name: str
    field_key: str
    data_type: str
    rules: dict
    position: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Record ────────────────────────────────────────────────────────────────────

class RecordCreate(BaseModel):
    data: dict


class RecordUpdate(BaseModel):
    data: dict


class BulkDeleteBody(BaseModel):
    ids: list[str] = Field(..., min_length=1, max_length=1000)


class RecordOut(BaseModel):
    id: uuid.UUID
    dataset_id: uuid.UUID
    data: dict
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None

    model_config = {"from_attributes": True}


# ── Change history ────────────────────────────────────────────────────────────

class ChangeHistoryOut(BaseModel):
    id: uuid.UUID
    record_id: uuid.UUID
    field_key: str | None
    old_value: str | None
    new_value: str | None
    action: str
    changed_at: datetime
    user_name: str | None

    model_config = {"from_attributes": True}


# ── Groups ────────────────────────────────────────────────────────────────────

class GroupCreate(BaseModel):
    name: str
    description: str | None = None
    workspace_id: uuid.UUID | None = None


class GroupUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class GroupOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    workspace_id: uuid.UUID | None = None
    created_at: datetime
    member_count: int = 0

    model_config = {"from_attributes": True}


class GroupMemberOut(BaseModel):
    user_id: uuid.UUID
    email: str
    username: str
    role: str


class AddMemberBody(BaseModel):
    user_id: uuid.UUID


# ── Dataset group permissions ─────────────────────────────────────────────────

class GroupPermissionBody(BaseModel):
    group_id: uuid.UUID
    role: str


class GroupPermissionOut(BaseModel):
    id: uuid.UUID
    dataset_id: uuid.UUID
    group_id: uuid.UUID
    role: str
    group_name: str | None = None

    model_config = {"from_attributes": True}


# ── Compute ───────────────────────────────────────────────────────────────────

class ComputeResult(BaseModel):
    records_created: int
    columns_created: int
    last_computed_at: datetime
