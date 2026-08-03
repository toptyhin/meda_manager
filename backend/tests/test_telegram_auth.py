import time
from urllib.parse import urlencode

import pytest
from httpx import AsyncClient

from app.config import get_settings
from tg_helpers import (
    BOT_TOKEN,
    get_tg_account,
    login_tg_user,
    make_init_data,
    me_id,
    tg_user_payload,
)


@pytest.mark.asyncio
async def test_valid_login_creates_account_and_shadow_user(client: AsyncClient) -> None:
    token = await login_tg_user(client, 555000111, first_name="Алиса")

    account = await get_tg_account(555000111)
    assert account is not None
    assert account.first_name == "Алиса"
    assert account.linked_user_id is not None

    user_id = await me_id(client, token)
    assert user_id == account.linked_user_id

    # New telegram users get the same starter content as web registrations.
    resp = await client.get("/api/categories", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


@pytest.mark.asyncio
async def test_relogin_returns_same_user(client: AsyncClient) -> None:
    token1 = await login_tg_user(client, 555000222)
    token2 = await login_tg_user(client, 555000222, first_name="Renamed")
    assert await me_id(client, token1) == await me_id(client, token2)

    account = await get_tg_account(555000222)
    assert account is not None
    assert account.first_name == "Renamed"
    assert account.first_seen_at <= account.last_seen_at


@pytest.mark.asyncio
async def test_tampered_init_data_rejected(client: AsyncClient) -> None:
    good = make_init_data(tg_user_payload(555000333))
    forged = good.replace("Tester", "Hacker")
    resp = await client.post("/api/auth/telegram", json={"init_data": forged})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_init_data_without_hash_rejected(client: AsyncClient) -> None:
    payload = tg_user_payload(555000444)
    forged = urlencode({"auth_date": str(int(time.time())), "user": str(payload)})
    resp = await client.post("/api/auth/telegram", json={"init_data": forged})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_stale_init_data_rejected(client: AsyncClient) -> None:
    stale = make_init_data(
        tg_user_payload(555000555),
        auth_date=int(time.time()) - 3 * 86400,
    )
    resp = await client.post("/api/auth/telegram", json={"init_data": stale})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_wrong_bot_token_rejected(client: AsyncClient) -> None:
    forged = make_init_data(tg_user_payload(555000666), bot_token="different-token")
    resp = await client.post("/api/auth/telegram", json={"init_data": forged})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_blocked_account_cannot_login(auth_client: AsyncClient, client: AsyncClient) -> None:
    await login_tg_user(client, 555000777)

    resp = await auth_client.patch("/api/admin/tg-users/555000777", json={"is_blocked": True})
    assert resp.status_code == 200, resp.text

    resp = await client.post(
        "/api/auth/telegram",
        json={"init_data": make_init_data(tg_user_payload(555000777))},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_disabled_when_no_bot_token(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "telegram_bot_token", "")
    resp = await client.post(
        "/api/auth/telegram",
        json={"init_data": make_init_data(tg_user_payload(555000888))},
    )
    assert resp.status_code == 503


@pytest.mark.asyncio
async def test_telegram_token_works_for_generation_api(client: AsyncClient) -> None:
    """The shadow-user JWT authorizes the regular generation endpoints."""
    token = await login_tg_user(client, 555000999)
    resp = await client.get("/api/limits/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["enforcement_enabled"] is False  # no tariffs configured yet
    assert body["credits"] == 0
