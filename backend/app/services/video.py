import uuid
from dataclasses import dataclass
from pathlib import Path

from app.config import Settings, get_settings
from app.services.imaging import resolve_path


@dataclass
class SavedVideo:
    path: str


def save_video(data: bytes, settings: Settings | None = None, prefix: str = "gen") -> SavedVideo:
    settings = settings or get_settings()
    settings.videos_dir.mkdir(parents=True, exist_ok=True)
    name = f"{prefix}_{uuid.uuid4().hex}.mp4"
    full_path = settings.videos_dir / name
    full_path.write_bytes(data)
    return SavedVideo(path=str(full_path.relative_to(settings.data_dir)))


def delete_video_file(path: str, settings: Settings | None = None) -> None:
    settings = settings or get_settings()
    try:
        p = resolve_path(path, settings)
        if p.exists():
            p.unlink()
    except (ValueError, OSError):
        pass


def resolve_video_path(relative: str, settings: Settings | None = None) -> Path:
    return resolve_path(relative, settings)
