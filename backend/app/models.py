from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from sqlalchemy import BigInteger, Column, ForeignKey, Text, UniqueConstraint
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    # Naive UTC: SQLAlchemy DateTime columns are TIMESTAMP WITHOUT TIME ZONE,
    # and asyncpg rejects tz-aware values for them.
    return datetime.now(timezone.utc).replace(tzinfo=None)


class ImageKind(str, Enum):
    reference = "reference"
    generated = "generated"
    draft = "draft"


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


class VideoMode(str, Enum):
    t2v = "t2v"
    i2v = "i2v"
    keyframes = "keyframes"


class ImproveKind(str, Enum):
    image_t2i = "image_t2i"
    image_i2i = "image_i2i"
    video_t2v = "video_t2v"
    video_i2v = "video_i2v"
    video_keyframes = "video_keyframes"


class StyleKind(str, Enum):
    image = "image"
    video = "video"
    both = "both"


class AppPromptKind(str, Enum):
    """Admin-managed global prompt templates (not per-user like ImprovePromptVersion)."""

    prompt_gen = "prompt_gen"


class LimitResourceKind(str, Enum):
    """Metered operation kinds. Add new values to meter more endpoints."""

    image = "image"
    video = "video"


class LimitPeriod(str, Enum):
    """Calendar windows in UTC; total = all-time."""

    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"
    total = "total"


class CreditKind(str, Enum):
    paid = "paid"
    bonus = "bonus"
    adjustment = "adjustment"
    consume = "consume"


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


class TelegramAccount(SQLModel, table=True):
    """Telegram identity provisioned from Mini App initData, linked 1:1 to a
    shadow web user that owns the generated content. Subject of quota limits."""

    __tablename__ = "telegram_accounts"

    # Telegram user ids exceed int32, hence BigInteger.
    telegram_id: int = Field(sa_column=Column(BigInteger, primary_key=True))
    username: Optional[str] = Field(default=None, index=True, max_length=64)
    first_name: str = Field(default="", max_length=128)
    last_name: Optional[str] = Field(default=None, max_length=128)
    photo_url: Optional[str] = Field(default=None, max_length=512)
    language_code: Optional[str] = Field(default=None, max_length=16)
    is_premium: bool = False
    linked_user_id: Optional[int] = Field(default=None, foreign_key="users.id", unique=True)
    is_blocked: bool = False
    first_seen_at: datetime = Field(default_factory=utcnow)
    last_seen_at: datetime = Field(default_factory=utcnow)


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
    prompt_text: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
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
    auto_review: bool = False
    review_score: Optional[int] = None
    review_passed: Optional[bool] = None
    created_at: datetime = Field(default_factory=utcnow)
    finished_at: Optional[datetime] = None


class GenerationStep(SQLModel, table=True):
    __tablename__ = "generation_steps"

    id: Optional[int] = Field(default=None, primary_key=True)
    generation_id: int = Field(foreign_key="generations.id", index=True)
    attempt: int
    action: str = Field(max_length=32)  # initial | fix_i2i | fix_regen
    prompt_used: str = Field(sa_column=Column(Text, nullable=False))
    image_id: Optional[int] = Field(default=None, foreign_key="images.id")
    review_score: Optional[int] = None
    review_passed: Optional[bool] = None
    review_issues: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    review_fix_mode: Optional[str] = Field(default=None, max_length=16)
    error: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    created_at: datetime = Field(default_factory=utcnow)
    finished_at: Optional[datetime] = None


class Video(SQLModel, table=True):
    __tablename__ = "videos"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    path: str
    width: int = 0
    height: int = 0
    duration: float = 0.0
    fps: float = 24.0
    seed: Optional[int] = None
    mode: VideoMode = VideoMode.t2v
    prompt_text: str = Field(sa_column=Column(Text, nullable=False))
    negative_prompt: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    source_image_ids: str = Field(default="[]", sa_column=Column(Text, nullable=False))
    category_id: Optional[int] = Field(default=None, foreign_key="categories.id")
    created_at: datetime = Field(default_factory=utcnow)


class VideoGeneration(SQLModel, table=True):
    __tablename__ = "video_generations"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    mode: VideoMode = VideoMode.t2v
    status: GenerationStatus = GenerationStatus.pending
    error: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    params: str = Field(default="{}", sa_column=Column(Text, nullable=False))
    progress: int = 0
    provider_task_id: Optional[str] = Field(default=None, max_length=128)
    provider_video_id: Optional[str] = Field(default=None, max_length=128)
    result_video_id: Optional[int] = Field(default=None, foreign_key="videos.id")
    created_at: datetime = Field(default_factory=utcnow)
    finished_at: Optional[datetime] = None


class ImprovePromptVersion(SQLModel, table=True):
    __tablename__ = "improve_prompt_versions"
    __table_args__ = (
        UniqueConstraint("user_id", "kind", "version", name="uq_improve_prompt_version"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    kind: ImproveKind
    version: int
    text: str = Field(sa_column=Column(Text, nullable=False))
    created_at: datetime = Field(default_factory=utcnow)


class AppPromptTemplate(SQLModel, table=True):
    """Versioned global prompt template (e.g. for the «Придумай промпт» assistant).

    Current text = latest version; fall back to code default when no versions exist.
    """

    __tablename__ = "app_prompt_templates"
    __table_args__ = (UniqueConstraint("kind", "version", name="uq_app_prompt_template"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    kind: AppPromptKind = Field(index=True)
    version: int
    text: str = Field(sa_column=Column(Text, nullable=False))
    updated_by: Optional[int] = Field(default=None, foreign_key="users.id")
    created_at: datetime = Field(default_factory=utcnow)


class PromptGenIntent(SQLModel, table=True):
    """Admin-managed mood/intent for «Придумай промпт» (funny, romantic, …).

    `label` is shown in clients (RU), `instruction` is injected into the
    system prompt (EN). Inactive intents are hidden from users and rejected
    by the suggest endpoint.
    """

    __tablename__ = "prompt_gen_intents"

    id: Optional[int] = Field(default=None, primary_key=True)
    key: str = Field(index=True, unique=True, max_length=64)
    label: str = Field(max_length=128)
    instruction: str = Field(sa_column=Column(Text, nullable=False))
    is_active: bool = Field(default=True)
    position: int = Field(default=0)
    created_at: datetime = Field(default_factory=utcnow)


class StylePreset(SQLModel, table=True):
    __tablename__ = "style_presets"
    __table_args__ = (UniqueConstraint("user_id", "title", name="uq_style_preset_user_title"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    title: str = Field(max_length=256)
    description: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    category: str = Field(max_length=128)
    kind: StyleKind = StyleKind.both
    text: str = Field(sa_column=Column(Text, nullable=False))
    created_at: datetime = Field(default_factory=utcnow)


class ProviderModelCache(SQLModel, table=True):
    """TTL cache for normalized provider model catalogs."""

    __tablename__ = "provider_model_cache"

    provider: str = Field(primary_key=True, max_length=32)
    payload: str = Field(sa_column=Column(Text, nullable=False))
    fetched_at: datetime = Field(default_factory=utcnow)
    expires_at: datetime = Field(index=True)


class ProviderCredential(SQLModel, table=True):
    """Admin-managed provider credentials (overrides env when set)."""

    __tablename__ = "provider_credentials"

    provider: str = Field(primary_key=True, max_length=32)
    api_key: str = Field(default="", sa_column=Column(Text, nullable=False))
    enabled: bool = True
    base_url: Optional[str] = Field(default=None, max_length=512)
    chat_model: Optional[str] = Field(default=None, max_length=256)
    updated_at: datetime = Field(default_factory=utcnow)


class UserChatPreference(SQLModel, table=True):
    """Per-user selected chat provider/model for assistant features."""

    __tablename__ = "user_chat_preferences"

    user_id: int = Field(primary_key=True, foreign_key="users.id")
    provider: str = Field(max_length=32)
    model: str = Field(max_length=256)
    updated_at: datetime = Field(default_factory=utcnow)


class SalesPlanScenario(SQLModel, table=True):
    """Named admin scenario for sales-funnel unit economics (free tier,
    referral %, conversions). `payload` is a JSON blob owned by the frontend
    calculator; the API stores/returns it as-is."""

    __tablename__ = "sales_plan_scenarios"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True, max_length=128)
    payload: str = Field(sa_column=Column(Text, nullable=False))
    updated_by: Optional[int] = Field(default=None, foreign_key="users.id")
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class TariffPlan(SQLModel, table=True):
    """Named bundle of periodic quotas; assigned to Telegram accounts."""

    __tablename__ = "tariff_plans"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True, max_length=128)
    description: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    # New Telegram accounts fall back to the default plan when they have no
    # active subscription.
    is_default: bool = False
    is_active: bool = True
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class TariffLimit(SQLModel, table=True):
    """One periodic quota row inside a plan: max N generations per period.
    max_count=None means unlimited; credit_cost is charged from the credit
    balance once the periodic quota is exhausted."""

    __tablename__ = "tariff_limits"

    id: Optional[int] = Field(default=None, primary_key=True)
    plan_id: int = Field(
        sa_column=Column(
            ForeignKey("tariff_plans.id", ondelete="CASCADE"), index=True, nullable=False
        )
    )
    resource_kind: LimitResourceKind
    period: LimitPeriod
    max_count: Optional[int] = Field(default=None, ge=0)
    credit_cost: int = Field(default=1, ge=1)


class UserSubscription(SQLModel, table=True):
    """Plan assignment history for a Telegram account. The effective plan is
    the latest non-expired row; expires_at=None is indefinite."""

    __tablename__ = "user_subscriptions"

    id: Optional[int] = Field(default=None, primary_key=True)
    telegram_id: int = Field(
        sa_column=Column(
            ForeignKey("telegram_accounts.telegram_id"), index=True, nullable=False
        )
    )
    plan_id: int = Field(foreign_key="tariff_plans.id", index=True)
    created_by: Optional[int] = Field(default=None, foreign_key="users.id")
    expires_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utcnow)


class CreditTransaction(SQLModel, table=True):
    """Append-only credit ledger; balance = SUM(amount). Positive rows are
    grants (paid packs, bonuses, manual adjustments), negative rows are
    consumption by the limits service or manual debits. `source` anticipates
    future payment integrations (e.g. telegram_stars)."""

    __tablename__ = "credit_transactions"

    id: Optional[int] = Field(default=None, primary_key=True)
    telegram_id: int = Field(
        sa_column=Column(
            ForeignKey("telegram_accounts.telegram_id"), index=True, nullable=False
        )
    )
    amount: int
    kind: CreditKind
    reason: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    created_by: Optional[int] = Field(default=None, foreign_key="users.id")
    source: str = Field(default="manual", max_length=32)
    created_at: datetime = Field(default_factory=utcnow)
