"""Shared helpers for telegram/limits tests: signed initData, tg login, DB rows."""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

from httpx import AsyncClient

from app.db import async_session_factory
from app.models import Generation, TelegramAccount, User, VideoGeneration, utcnow

BOT_TOKEN = "test-bot-token-123"


def make_init_data(
    user: dict,
    bot_token: str = BOT_TOKEN,
    auth_date: int | None = None,
    extra: dict | None = None,
) -> str:
    data = {
        "auth_date": str(auth_date if auth_date is not None else int(time.time())),
        "user": json.dumps(user, separators=(",", ":"), ensure_ascii=False),
    }
    if extra:
        data.update(extra)
    check = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    data["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return urlencode(data)


def tg_user_payload(telegram_id: int, **overrides) -> dict:
    payload = {
        "id": telegram_id,
        "first_name": "Tester",
        "username": f"tg{telegram_id}",
        "language_code": "ru",
        "is_premium": False,
    }
    payload.update(overrides)
    return payload


async def login_tg_user(client: AsyncClient, telegram_id: int, **overrides) -> str:
    """Login via /api/auth/telegram, return the access token."""
    resp = await client.post(
        "/api/auth/telegram",
        json={"init_data": make_init_data(tg_user_payload(telegram_id, **overrides))},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]  # type: ignore[no-any-return]


async def me_id(client: AsyncClient, token: str) -> int:
    resp = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]  # type: ignore[no-any-return]


async def seed_usage(user_id: int, kind: str, count: int) -> None:
    """Insert generation rows directly to simulate past usage."""
    async with async_session_factory() as session:
        for _ in range(count):
            if kind == "image":
                session.add(
                    Generation(
                        user_id=user_id,
                        params="{}",
                        created_at=utcnow(),
                    )
                )
            else:
                session.add(
                    VideoGeneration(
                        user_id=user_id,
                        params="{}",
                        created_at=utcnow(),
                    )
                )
        await session.commit()


async def get_tg_account(telegram_id: int) -> TelegramAccount | None:
    async with async_session_factory() as session:
        return await session.get(TelegramAccount, telegram_id)


async def get_user(user_id: int) -> User | None:
    async with async_session_factory() as session:
        return await session.get(User, user_id)


async def create_tariff(
    client: AsyncClient,
    *,
    name: str = "Free",
    is_default: bool = False,
    limits: list[dict] | None = None,
) -> dict:
    body: dict = {"name": name, "is_default": is_default}
    if limits is not None:
        body["limits"] = limits
    resp = await client.post("/api/admin/tariffs", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()  # type: ignore[no-any-return]
