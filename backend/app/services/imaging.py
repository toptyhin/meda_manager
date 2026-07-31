import uuid
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

from PIL import Image as PILImage

from app.config import Settings, get_settings

THUMB_MAX = 400


@dataclass
class SavedImage:
    path: str
    thumb_path: str
    width: int
    height: int


def _ext_for(data: bytes) -> str:
    if data[:3] == b"\xff\xd8\xff":
        return ".jpg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    return ".png"


def save_image(data: bytes, settings: Settings | None = None, prefix: str = "img") -> SavedImage:
    settings = settings or get_settings()
    settings.images_dir.mkdir(parents=True, exist_ok=True)
    settings.thumbs_dir.mkdir(parents=True, exist_ok=True)

    ext = _ext_for(data)
    name = f"{prefix}_{uuid.uuid4().hex}{ext}"
    full_path = settings.images_dir / name
    thumb_name = f"{Path(name).stem}_thumb.jpg"
    thumb_path = settings.thumbs_dir / thumb_name

    full_path.write_bytes(data)

    with PILImage.open(BytesIO(data)) as im:
        im = im.convert("RGB") if im.mode not in ("RGB", "L") else im
        width, height = im.size
        thumb = im.copy()
        thumb.thumbnail((THUMB_MAX, THUMB_MAX))
        thumb.convert("RGB").save(thumb_path, "JPEG", quality=85)

    return SavedImage(
        path=str(full_path.relative_to(settings.data_dir)),
        thumb_path=str(thumb_path.relative_to(settings.data_dir)),
        width=width,
        height=height,
    )


def resolve_path(relative: str, settings: Settings | None = None) -> Path:
    settings = settings or get_settings()
    path = (settings.data_dir / relative).resolve()
    if not str(path).startswith(str(settings.data_dir.resolve())):
        raise ValueError("Invalid path")
    return path


def delete_image_files(path: str, thumb_path: str, settings: Settings | None = None) -> None:
    settings = settings or get_settings()
    for rel in (path, thumb_path):
        try:
            p = resolve_path(rel, settings)
            if p.exists():
                p.unlink()
        except (ValueError, OSError):
            pass


def read_image_bytes(relative: str, settings: Settings | None = None) -> bytes:
    return resolve_path(relative, settings).read_bytes()
