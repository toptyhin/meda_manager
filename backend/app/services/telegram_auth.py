"""Telegram Mini App initData validation.

Implements the Bot API spec: the `hash` field is an HMAC-SHA256 hex digest of
the data-check-string (all `key=value` pairs except `hash`, sorted by key,
joined with newlines), keyed by HMAC-SHA256("WebAppData", bot_token).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from dataclasses import dataclass, field
from urllib.parse import parse_qsl


class InitDataError(ValueError):
    """Raised when initData is malformed, forged, or stale."""


@dataclass
class TelegramIdentity:
    telegram_id: int
    first_name: str
    username: str | None = None
    last_name: str | None = None
    photo_url: str | None = None
    language_code: str | None = None
    is_premium: bool = False
    auth_date: int = 0
    start_param: str | None = None
    raw: dict = field(default_factory=dict)


def validate_init_data(init_data: str, bot_token: str, max_age: int = 86400) -> TelegramIdentity:
    if not init_data:
        raise InitDataError("initData is empty")

    pairs = parse_qsl(init_data, keep_blank_values=True)
    data = dict(pairs)
    received_hash = data.pop("hash", None)
    if not received_hash:
        raise InitDataError("initData has no hash")

    data_check_string = "\n".join(f"{key}={value}" for key, value in sorted(data.items()))
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    calculated = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(calculated, received_hash):
        raise InitDataError("initData hash mismatch")

    try:
        auth_date = int(data.get("auth_date", "0"))
    except ValueError as exc:
        raise InitDataError("initData auth_date is invalid") from exc
    if max_age > 0 and (time.time() - auth_date) > max_age:
        raise InitDataError("initData is expired")

    user_raw = data.get("user")
    if not user_raw:
        raise InitDataError("initData has no user")
    try:
        user = json.loads(user_raw)
    except json.JSONDecodeError as exc:
        raise InitDataError("initData user is not valid JSON") from exc
    if not isinstance(user, dict) or not isinstance(user.get("id"), int):
        raise InitDataError("initData user has no id")

    start_param = data.get("start_param") or None
    if start_param is not None:
        start_param = str(start_param)

    return TelegramIdentity(
        telegram_id=user["id"],
        first_name=str(user.get("first_name") or ""),
        username=user.get("username") or None,
        last_name=user.get("last_name") or None,
        photo_url=user.get("photo_url") or None,
        language_code=user.get("language_code") or None,
        is_premium=bool(user.get("is_premium", False)),
        auth_date=auth_date,
        start_param=start_param,
        raw=user,
    )
