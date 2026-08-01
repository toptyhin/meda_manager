import hashlib
import hmac
import time
from typing import Optional

from app.config import Settings, get_settings


def _sign(secret: str, message: str) -> str:
    return hmac.new(
        secret.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def build_signed_image_url(
    image_id: int,
    settings: Optional[Settings] = None,
    *,
    ttl: Optional[int] = None,
) -> str:
    """Build a publicly fetchable HMAC-signed URL for an image.

    Requires ``settings.public_base_url`` (e.g. https://example.com).
    """
    settings = settings or get_settings()
    base = (settings.public_base_url or "").rstrip("/")
    if not base:
        raise ValueError("PUBLIC_BASE_URL is not configured")
    exp = int(time.time()) + int(ttl if ttl is not None else settings.media_link_ttl)
    message = f"{image_id}:{exp}"
    sig = _sign(settings.jwt_secret, message)
    return f"{base}/api/media-ingress/{image_id}?exp={exp}&sig={sig}"


def verify_signed_image_link(
    image_id: int,
    exp: int,
    sig: str,
    settings: Optional[Settings] = None,
) -> bool:
    """Return True if the signature is valid and not expired."""
    settings = settings or get_settings()
    try:
        exp_int = int(exp)
    except (TypeError, ValueError):
        return False
    if exp_int < int(time.time()):
        return False
    if not sig:
        return False
    expected = _sign(settings.jwt_secret, f"{image_id}:{exp_int}")
    return hmac.compare_digest(expected, sig)
