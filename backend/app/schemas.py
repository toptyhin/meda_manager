from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models import GenerationMode, GenerationStatus, ImageKind, PromptMode, PromptSource, VideoMode


# --- Auth ---
class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=6, max_length=128)
    invite_code: str = Field(min_length=1, max_length=64)


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    is_admin: bool
    created_at: datetime


class InviteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    is_blocked: bool
    created_by: Optional[int]
    used_by: Optional[int]
    created_at: datetime
    created_by_username: Optional[str] = None
    used_by_username: Optional[str] = None


class InviteUpdate(BaseModel):
    is_blocked: bool


# --- Categories ---
class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)


class CategoryUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=128)


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    created_at: datetime


# --- Prompts ---
class PromptCreate(BaseModel):
    title: str = Field(min_length=1, max_length=256)
    category_id: int
    text: str = Field(min_length=1)
    mode: PromptMode = PromptMode.t2i


class PromptUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=256)
    category_id: Optional[int] = None


class PromptVersionCreate(BaseModel):
    text: str = Field(min_length=1)
    source: PromptSource = PromptSource.manual


class PromptVersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    prompt_id: int
    version: int
    text: str
    source: PromptSource
    created_at: datetime


class PromptOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    category_id: int
    mode: PromptMode
    created_at: datetime
    current_version: Optional[PromptVersionOut] = None


# --- Images ---
class ImageOut(BaseModel):
    id: int
    kind: ImageKind
    width: int
    height: int
    rating: int
    prompt_version_id: Optional[int]
    parent_image_id: Optional[int]
    category_id: Optional[int]
    size: Optional[str]
    ratio: Optional[str]
    created_at: datetime
    thumb_url: str
    file_url: str


class ImageUpdate(BaseModel):
    rating: Optional[int] = Field(default=None, ge=0, le=5)
    category_id: Optional[int] = None


class ImageListResponse(BaseModel):
    items: list[ImageOut]
    total: int
    page: int
    page_size: int


# --- Generations ---
class GenerationCreate(BaseModel):
    mode: GenerationMode = GenerationMode.generate
    prompt_version_id: Optional[int] = None
    text: Optional[str] = None
    reference_image_ids: list[int] = Field(default_factory=list)
    parent_image_id: Optional[int] = None
    size: str = "1K"
    ratio: str = "1:1"
    category_id: Optional[int] = None
    auto_review: bool = False


class GenerationStepOut(BaseModel):
    id: int
    attempt: int
    action: str
    prompt_used: str
    image_id: Optional[int]
    thumb_url: Optional[str] = None
    file_url: Optional[str] = None
    review_score: Optional[int]
    review_passed: Optional[bool]
    review_issues: list[dict] = Field(default_factory=list)
    review_fix_mode: Optional[str]
    error: Optional[str]
    created_at: datetime
    finished_at: Optional[datetime]


class GenerationOut(BaseModel):
    id: int
    mode: GenerationMode
    status: GenerationStatus
    error: Optional[str]
    prompt_version_id: Optional[int]
    result_image_id: Optional[int]
    auto_review: bool = False
    review_score: Optional[int] = None
    review_passed: Optional[bool] = None
    params: dict
    steps: list[GenerationStepOut] = Field(default_factory=list)
    created_at: datetime
    finished_at: Optional[datetime]


# --- Videos ---
class VideoGenerationCreate(BaseModel):
    mode: VideoMode = VideoMode.t2v
    text: str = Field(min_length=1)
    source_image_ids: list[int] = Field(default_factory=list)
    width: int = 1152
    height: int = 768
    num_frames: int = 121
    frame_rate: float = 24
    seed: Optional[int] = None
    negative_prompt: Optional[str] = None
    category_id: Optional[int] = None


class VideoGenerationOut(BaseModel):
    id: int
    mode: VideoMode
    status: GenerationStatus
    error: Optional[str]
    progress: int
    params: dict
    provider_task_id: Optional[str] = None
    provider_video_id: Optional[str] = None
    result_video_id: Optional[int]
    created_at: datetime
    finished_at: Optional[datetime]


class VideoOut(BaseModel):
    id: int
    width: int
    height: int
    duration: float
    fps: float
    seed: Optional[int]
    mode: VideoMode
    prompt_text: str
    negative_prompt: Optional[str]
    source_image_ids: list[int]
    category_id: Optional[int]
    created_at: datetime
    file_url: str


class VideoUpdate(BaseModel):
    category_id: Optional[int] = None


class VideoListResponse(BaseModel):
    items: list[VideoOut]
    total: int
    page: int
    page_size: int


# --- Assistant ---
class ImproveRequest(BaseModel):
    text: str = Field(min_length=1)
    category_name: Optional[str] = None


class ImproveResponse(BaseModel):
    improved_text: str
