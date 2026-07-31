from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from sqlalchemy import Column, Text, UniqueConstraint
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ImageKind(str, Enum):
    reference = "reference"
    generated = "generated"


class PromptSource(str, Enum):
    manual = "manual"
    assistant = "assistant"


class PromptMode(str, Enum):
    t2i = "t2i"
    i2i = "i2i"


class GenerationMode(str, Enum):
    generate = "generate"
    edit = "edit"


class GenerationStatus(str, Enum):
    pending = "pending"
    running = "running"
    done = "done"
    error = "error"


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True, max_length=64)
    password_hash: str
    is_admin: bool = False
    created_at: datetime = Field(default_factory=utcnow)


class Invite(SQLModel, table=True):
    __tablename__ = "invites"

    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(index=True, unique=True, max_length=64)
    created_by: Optional[int] = Field(default=None, foreign_key="users.id")
    used_by: Optional[int] = Field(default=None, foreign_key="users.id")
    is_blocked: bool = False
    created_at: datetime = Field(default_factory=utcnow)


class Category(SQLModel, table=True):
    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_category_user_name"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    name: str = Field(max_length=128)
    created_at: datetime = Field(default_factory=utcnow)


class Prompt(SQLModel, table=True):
    __tablename__ = "prompts"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    category_id: int = Field(foreign_key="categories.id", index=True)
    title: str = Field(max_length=256)
    mode: PromptMode = PromptMode.t2i
    created_at: datetime = Field(default_factory=utcnow)


class PromptVersion(SQLModel, table=True):
    __tablename__ = "prompt_versions"
    __table_args__ = (UniqueConstraint("prompt_id", "version", name="uq_prompt_version"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    prompt_id: int = Field(foreign_key="prompts.id", index=True)
    version: int
    text: str = Field(sa_column=Column(Text, nullable=False))
    source: PromptSource = PromptSource.manual
    created_at: datetime = Field(default_factory=utcnow)


class Image(SQLModel, table=True):
    __tablename__ = "images"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    kind: ImageKind = ImageKind.reference
    path: str
    thumb_path: str
    width: int = 0
    height: int = 0
    rating: int = Field(default=0, ge=0, le=5)
    prompt_version_id: Optional[int] = Field(default=None, foreign_key="prompt_versions.id")
    parent_image_id: Optional[int] = Field(default=None, foreign_key="images.id")
    category_id: Optional[int] = Field(default=None, foreign_key="categories.id")
    size: Optional[str] = Field(default=None, max_length=16)
    ratio: Optional[str] = Field(default=None, max_length=16)
    created_at: datetime = Field(default_factory=utcnow)


class Generation(SQLModel, table=True):
    __tablename__ = "generations"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    prompt_version_id: Optional[int] = Field(default=None, foreign_key="prompt_versions.id")
    mode: GenerationMode = GenerationMode.generate
    status: GenerationStatus = GenerationStatus.pending
    error: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    params: str = Field(default="{}", sa_column=Column(Text, nullable=False))
    result_image_id: Optional[int] = Field(default=None, foreign_key="images.id")
    created_at: datetime = Field(default_factory=utcnow)
    finished_at: Optional[datetime] = None
