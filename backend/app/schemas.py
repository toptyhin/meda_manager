from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import (
    CreditKind,
    GenerationMode,
    GenerationStatus,
    ImageKind,
    ImproveKind,
    LimitPeriod,
    LimitResourceKind,
    PromptMode,
    PromptSource,
    StyleKind,
    VideoMode,
)


# --- Auth ---
class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=6, max_length=128)
    invite_code: str = Field(min_length=1, max_length=64)


class LoginRequest(BaseModel):
    username: str
    password: str


class TelegramAuthRequest(BaseModel):
    init_data: str = Field(min_length=1, max_length=8192)


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


# --- Style presets ---
class StylePresetCreate(BaseModel):
    title: str = Field(min_length=1, max_length=256)
    description: Optional[str] = None
    category: str = Field(min_length=1, max_length=128)
    kind: StyleKind = StyleKind.both
    text: str = Field(min_length=1)


class StylePresetUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=256)
    description: Optional[str] = None
    category: Optional[str] = Field(default=None, min_length=1, max_length=128)
    kind: Optional[StyleKind] = None
    text: Optional[str] = Field(default=None, min_length=1)


class StylePresetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: Optional[str]
    category: str
    kind: StyleKind
    text: str
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
    prompt_text: Optional[str] = None
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
    # Image: "t2i" | "i2i"; video: "t2v" | "i2v" | "keyframes". None -> default mode.
    mode: Optional[str] = None


class ImproveResponse(BaseModel):
    improved_text: str


class VisionPromptRequest(BaseModel):
    image_id: int


class VisionPromptResponse(BaseModel):
    text: str


class ImproveTemplateVersionCreate(BaseModel):
    text: str = Field(min_length=1)


class ImproveTemplateVersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: ImproveKind
    version: int
    text: str
    created_at: datetime


class ImproveTemplateOut(BaseModel):
    kind: ImproveKind
    text: str
    version: Optional[int] = None
    is_default: bool
    default_text: str
    versions: list[ImproveTemplateVersionOut] = Field(default_factory=list)


# --- Providers / model catalog ---
class ProviderCapabilitiesOut(BaseModel):
    chat: bool = False
    image: bool = False
    video: bool = False
    catalog: bool = False


class ProviderOut(BaseModel):
    id: str
    name: str
    capabilities: ProviderCapabilitiesOut
    configured: bool
    is_default_chat: bool = False


class ModelPricingOut(BaseModel):
    prompt_per_1m: Optional[float] = None
    completion_per_1m: Optional[float] = None
    image: Optional[float] = None
    request: Optional[float] = None
    input_cache_read_per_1m: Optional[float] = None
    unit: Optional[str] = None


class ModelInfoOut(BaseModel):
    id: str
    provider: str
    kind: str
    context_length: Optional[int] = None
    max_output_length: Optional[int] = None
    input_modalities: list[str] = Field(default_factory=list)
    output_modalities: list[str] = Field(default_factory=list)
    pricing: Optional[ModelPricingOut] = None


class ProviderModelsResponse(BaseModel):
    provider: str
    items: list[ModelInfoOut]
    cached: bool = False
    fetched_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None


class ProviderSettingsOut(BaseModel):
    id: str
    name: str
    enabled: bool
    configured: bool
    key_source: str  # db | env | none
    api_key_masked: Optional[str] = None
    base_url: str
    chat_model: str
    capabilities: ProviderCapabilitiesOut


class ProviderSettingsUpdate(BaseModel):
    api_key: Optional[str] = None
    clear_api_key: bool = False
    enabled: Optional[bool] = None
    base_url: Optional[str] = None
    clear_base_url: bool = False
    chat_model: Optional[str] = None
    clear_chat_model: bool = False


class ChatModelPreferenceOut(BaseModel):
    provider: str
    model: str
    source: str  # user | default


class ChatModelPreferenceUpdate(BaseModel):
    provider: str = Field(min_length=1, max_length=32)
    model: str = Field(min_length=1, max_length=256)


# --- Tariffs & limits ---


class TariffLimitIn(BaseModel):
    resource_kind: LimitResourceKind
    period: LimitPeriod
    max_count: Optional[int] = Field(default=None, ge=0)
    credit_cost: int = Field(default=1, ge=1)


class TariffLimitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    resource_kind: LimitResourceKind
    period: LimitPeriod
    max_count: Optional[int]
    credit_cost: int


class TariffPlanIn(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: Optional[str] = None
    is_default: bool = False
    is_active: bool = True
    limits: list[TariffLimitIn] = Field(default_factory=list)


class TariffPlanUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=128)
    description: Optional[str] = None
    clear_description: bool = False
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None
    limits: Optional[list[TariffLimitIn]] = None


class TariffPlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str]
    is_default: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime
    limits: list[TariffLimitOut] = Field(default_factory=list)


class SubscriptionIn(BaseModel):
    plan_id: int
    expires_at: Optional[datetime] = None

    @field_validator("expires_at", mode="after")
    @classmethod
    def _naive_utc(cls, value: Optional[datetime]) -> Optional[datetime]:
        # DB columns are TIMESTAMP WITHOUT TIME ZONE (naive UTC); clients send
        # ISO strings with offsets — normalize here, see models.utcnow.
        if value is not None and value.tzinfo is not None:
            return value.astimezone(timezone.utc).replace(tzinfo=None)
        return value


class SubscriptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    plan_id: int
    plan_name: str = ""
    created_by: Optional[int]
    expires_at: Optional[datetime]
    created_at: datetime
    active: bool = True


class CreditIn(BaseModel):
    amount: int  # non-zero validated in the endpoint
    kind: CreditKind = CreditKind.paid
    reason: Optional[str] = Field(default=None, max_length=512)


class CreditTransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    amount: int
    kind: CreditKind
    reason: Optional[str]
    source: str
    created_by: Optional[int]
    created_at: datetime


class QuotaResourceOut(BaseModel):
    resource_kind: LimitResourceKind
    period: LimitPeriod
    limit: Optional[int]  # None = unlimited
    used: int
    remaining: Optional[int]  # None = unlimited
    reset_at: Optional[datetime]  # None for total period
    credit_cost: int


class QuotaPlanOut(BaseModel):
    id: int
    name: str
    expires_at: Optional[datetime] = None


class QuotaSnapshot(BaseModel):
    plan: Optional[QuotaPlanOut]
    resources: list[QuotaResourceOut] = Field(default_factory=list)
    credits: int = 0
    enforcement_enabled: bool = False


class TgUserListItem(BaseModel):
    telegram_id: int
    username: Optional[str]
    first_name: str
    last_name: Optional[str]
    photo_url: Optional[str]
    is_premium: bool
    is_blocked: bool
    linked_user_id: Optional[int]
    plan: Optional[QuotaPlanOut] = None
    balance: int = 0
    used_today: int = 0
    used_month: int = 0
    first_seen_at: datetime
    last_seen_at: datetime


class TgUserListResponse(BaseModel):
    items: list[TgUserListItem]
    total: int


class TgUserDetail(TgUserListItem):
    subscriptions: list[SubscriptionOut] = Field(default_factory=list)
    transactions: list[CreditTransactionOut] = Field(default_factory=list)
    quota: Optional[QuotaSnapshot] = None


class TgUserUpdate(BaseModel):
    is_blocked: bool
