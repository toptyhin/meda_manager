from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Project root: media_manager/
ROOT_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ROOT_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    agnes_api_key: str = ""
    agnes_base_url: str = "https://apihub.agnes-ai.com/v1"
    agnes_video_model: str = "agnes-video-v2.0"

    # Comma-separated provider ids. Chat providers besides Agnes need their API keys.
    enabled_providers: str = "agnes"
    default_chat_provider: str = "agnes"

    atlas_api_key: str = ""
    atlas_base_url: str = "https://api.atlascloud.ai/v1"
    atlas_chat_model: str = "deepseek-ai/DeepSeek-V3.1"

    crazyrouter_api_key: str = ""
    crazyrouter_base_url: str = "https://api.crazyrouter.com/v1"
    crazyrouter_chat_model: str = "gpt-5.5"

    nordrouter_api_key: str = ""
    nordrouter_base_url: str = "https://nordrouter.com/v1"
    nordrouter_chat_model: str = "anthropic/claude-sonnet-4.6"

    model_catalog_ttl_seconds: int = 43200

    jwt_secret: str = "change-me-in-production"
    jwt_expire_hours: int = 72
    # Telegram Mini App auth: bot token validates initData HMAC; empty disables it.
    telegram_bot_token: str = ""
    telegram_init_data_max_age: int = 86400
    # Base deep-link for referral share URLs: https://t.me/<bot>/<app>
    # Empty → /api/referrals/me returns link=null (code still works).
    telegram_app_url: str = ""
    data_dir: Path = ROOT_DIR / "data"
    frontend_dist: Path = ROOT_DIR / "frontend" / "dist"
    # Required: postgresql+asyncpg://...  SQLite is not supported at runtime.
    database_url: str
    bootstrap_invite: str = ""
    cors_origins: str = "http://localhost:5173"
    public_base_url: str = ""
    max_upload_mb: int = 10
    auto_review_max_fixes: int = 2
    auto_review_pass_score: int = 7
    video_poll_interval: int = 5
    video_poll_timeout: int = 900
    media_link_ttl: int = 3600

    @field_validator("database_url")
    @classmethod
    def _require_postgres(cls, value: str) -> str:
        url = value.strip()
        if not url:
            raise ValueError("DATABASE_URL is required")
        if not url.startswith("postgresql"):
            raise ValueError(
                "DATABASE_URL must be a postgresql(+asyncpg):// URL; SQLite is not supported"
            )
        return url

    @property
    def images_dir(self) -> Path:
        return self.data_dir / "images"

    @property
    def thumbs_dir(self) -> Path:
        return self.data_dir / "thumbs"

    @property
    def videos_dir(self) -> Path:
        return self.data_dir / "videos"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def enabled_provider_list(self) -> list[str]:
        return [p.strip().lower() for p in self.enabled_providers.split(",") if p.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
