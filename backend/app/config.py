from functools import lru_cache
from pathlib import Path

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
    jwt_secret: str = "change-me-in-production"
    jwt_expire_hours: int = 72
    data_dir: Path = ROOT_DIR / "data"
    frontend_dist: Path = ROOT_DIR / "frontend" / "dist"
    bootstrap_invite: str = ""
    cors_origins: str = "http://localhost:5173"
    public_base_url: str = ""
    max_upload_mb: int = 10
    auto_review_max_fixes: int = 2
    auto_review_pass_score: int = 7
    video_poll_interval: int = 5
    video_poll_timeout: int = 900
    media_link_ttl: int = 3600


    @property
    def database_url(self) -> str:
        return f"sqlite+aiosqlite:///{self.data_dir / 'app.db'}"

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


@lru_cache
def get_settings() -> Settings:
    return Settings()
