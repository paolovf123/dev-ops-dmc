from __future__ import annotations
import uuid
from datetime import datetime
from pydantic import BaseModel, EmailStr


# ── Auth ──────────────────────────────────────────────────────────────────────

class UserRegister(BaseModel):
    email: str
    username: str
    password: str


class UserLogin(BaseModel):
    email: str
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


class DatasetOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Column ────────────────────────────────────────────────────────────────────

class ColumnCreate(BaseModel):
    name: str
    field_key: str
    data_type: str  # text | number | date | enum
    rules: dict = {}
    position: int = 0


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
