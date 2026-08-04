"""Referral attribution (Telegram start_param) and L1/L2/L3 stats."""

import pytest
from httpx import AsyncClient

from app.config import get_settings
from app.services.referrals import parse_referral_start_param
from app.services.telegram_auth import validate_init_data
from tg_helpers import BOT_TOKEN, get_tg_account, login_tg_user, make_init_data, tg_user_payload


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("ref_12345", 12345),
        ("ref_1", 1),
        ("ref_999000111", 999000111),
        (None, None),
        ("", None),
        ("  ", None),
        ("ref_", None),
        ("ref_abc", None),
        ("REF_123", None),
        ("referral_123", None),
        ("ref_123_extra", None),
        ("ref_-1", None),
    ],
)
def test_parse_referral_start_param(value: str | None, expected: int | None) -> None:
    assert parse_referral_start_param(value) == expected


@pytest.mark.asyncio
async def test_validate_init_data_exposes_start_param() -> None:
    init = make_init_data(tg_user_payload(1001), start_param="ref_42")
    identity = validate_init_data(init, BOT_TOKEN)
    assert identity.start_param == "ref_42"
    assert identity.telegram_id == 1001


@pytest.mark.asyncio
async def test_first_login_attaches_referrer(client: AsyncClient) -> None:
    await login_tg_user(client, 700001)
    await login_tg_user(client, 700002, start_param="ref_700001")

    account = await get_tg_account(700002)
    assert account is not None
    assert account.referred_by_telegram_id == 700001
    assert account.referred_at is not None


@pytest.mark.asyncio
async def test_relogin_does_not_overwrite_referrer(client: AsyncClient) -> None:
    await login_tg_user(client, 700011)
    await login_tg_user(client, 700012)
    await login_tg_user(client, 700013, start_param="ref_700011")

    await login_tg_user(client, 700013, start_param="ref_700012")
    account = await get_tg_account(700013)
    assert account is not None
    assert account.referred_by_telegram_id == 700011


@pytest.mark.asyncio
async def test_self_referral_ignored(client: AsyncClient) -> None:
    await login_tg_user(client, 700021, start_param="ref_700021")
    account = await get_tg_account(700021)
    assert account is not None
    assert account.referred_by_telegram_id is None


@pytest.mark.asyncio
async def test_unknown_referrer_ignored(client: AsyncClient) -> None:
    await login_tg_user(client, 700031, start_param="ref_999999999")
    account = await get_tg_account(700031)
    assert account is not None
    assert account.referred_by_telegram_id is None


@pytest.mark.asyncio
async def test_garbage_start_param_ignored(client: AsyncClient) -> None:
    await login_tg_user(client, 700041, start_param="not-a-ref")
    account = await get_tg_account(700041)
    assert account is not None
    assert account.referred_by_telegram_id is None


@pytest.mark.asyncio
async def test_three_level_chain_stats(client: AsyncClient) -> None:
    # A → B → C → D
    await login_tg_user(client, 800001)  # A
    token_a = await login_tg_user(client, 800001)
    await login_tg_user(client, 800002, start_param="ref_800001")  # B
    token_b = await login_tg_user(client, 800002)
    await login_tg_user(client, 800003, start_param="ref_800002")  # C
    await login_tg_user(client, 800004, start_param="ref_800003")  # D

    resp = await client.get(
        "/api/referrals/me", headers={"Authorization": f"Bearer {token_a}"}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["code"] == "ref_800001"
    assert body["counts"] == {"l1": 1, "l2": 1, "l3": 1, "total": 3}
    assert [u["telegram_id"] for u in body["levels"]["l1"]] == [800002]
    assert [u["telegram_id"] for u in body["levels"]["l2"]] == [800003]
    assert [u["telegram_id"] for u in body["levels"]["l3"]] == [800004]

    resp = await client.get(
        "/api/referrals/me", headers={"Authorization": f"Bearer {token_b}"}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["counts"] == {"l1": 1, "l2": 1, "l3": 0, "total": 2}


@pytest.mark.asyncio
async def test_referrals_me_builds_link_when_configured(client: AsyncClient) -> None:
    settings = get_settings()
    previous = settings.telegram_app_url
    settings.telegram_app_url = "https://t.me/TestBot/app"
    try:
        token = await login_tg_user(client, 800101)
        resp = await client.get(
            "/api/referrals/me", headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 200
        assert resp.json()["link"] == "https://t.me/TestBot/app?startapp=ref_800101"
    finally:
        settings.telegram_app_url = previous


@pytest.mark.asyncio
async def test_referrals_me_without_tg_link_404(auth_client: AsyncClient) -> None:
    # auth_client is a web-registered admin without TelegramAccount.
    resp = await auth_client.get("/api/referrals/me")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_admin_detail_includes_referral_block(
    auth_client: AsyncClient, client: AsyncClient
) -> None:
    await login_tg_user(client, 900001)
    await login_tg_user(client, 900002, start_param="ref_900001")
    await login_tg_user(client, 900003, start_param="ref_900002")

    resp = await auth_client.get("/api/admin/tg-users/900001")
    assert resp.status_code == 200, resp.text
    referral = resp.json()["referral"]
    assert referral["referred_by"] is None
    assert referral["counts"] == {"l1": 1, "l2": 1, "l3": 0, "total": 2}

    resp = await auth_client.get("/api/admin/tg-users/900002")
    assert resp.status_code == 200, resp.text
    referral = resp.json()["referral"]
    assert referral["referred_by"]["telegram_id"] == 900001
    assert referral["counts"]["l1"] == 1
    assert referral["counts"]["l2"] == 0
