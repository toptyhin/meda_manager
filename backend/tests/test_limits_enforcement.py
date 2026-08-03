import asyncio
from contextlib import contextmanager

import pytest
import respx
from httpx import AsyncClient

from tg_helpers import create_tariff, login_tg_user, me_id, seed_usage

GEN_BODY = {"text": "a red fox in snow", "size": "1K", "ratio": "1:1"}
VIDEO_BODY = {"text": "a fox running through snow"}


@contextmanager
def no_network():
    """Background job tasks make real httpx calls; make them fail instantly."""
    with respx.mock(assert_all_called=False) as router:
        yield router


def tg_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_daily_quota_blocks_after_limit(
    auth_client: AsyncClient, client: AsyncClient
) -> None:
    await create_tariff(
        auth_client,
        is_default=True,
        limits=[{"resource_kind": "image", "period": "daily", "max_count": 2}],
    )
    token = await login_tg_user(client, 777000111)
    user_id = await me_id(client, token)
    await seed_usage(user_id, "image", 2)

    resp = await client.post("/api/generations", json=GEN_BODY, headers=tg_headers(token))
    assert resp.status_code == 429, resp.text
    detail = resp.json()["detail"]
    assert detail["code"] == "quota_exceeded"
    assert detail["resource_kind"] == "image"
    assert detail["period"] == "daily"
    assert detail["limit"] == 2
    assert detail["remaining"] == 0
    assert detail["reset_at"] is not None
    assert detail["balance"] == 0


@pytest.mark.asyncio
async def test_unlimited_plan_never_blocks(auth_client: AsyncClient, client: AsyncClient) -> None:
    await create_tariff(
        auth_client,
        is_default=True,
        limits=[{"resource_kind": "image", "period": "daily", "max_count": None}],
    )
    token = await login_tg_user(client, 777000222)
    user_id = await me_id(client, token)
    await seed_usage(user_id, "image", 5)

    with no_network():
        resp = await client.post("/api/generations", json=GEN_BODY, headers=tg_headers(token))
        assert resp.status_code == 201, resp.text
        await asyncio.sleep(0.1)


@pytest.mark.asyncio
async def test_credits_consumed_after_quota(
    auth_client: AsyncClient, client: AsyncClient
) -> None:
    await create_tariff(
        auth_client,
        is_default=True,
        limits=[{"resource_kind": "image", "period": "daily", "max_count": 1, "credit_cost": 2}],
    )
    token = await login_tg_user(client, 777000333)
    user_id = await me_id(client, token)

    resp = await auth_client.post(
        "/api/admin/tg-users/777000333/credits",
        json={"amount": 5, "kind": "paid", "reason": "pack"},
    )
    assert resp.status_code == 201, resp.text

    await seed_usage(user_id, "image", 1)  # quota exhausted

    with no_network():
        resp = await client.post("/api/generations", json=GEN_BODY, headers=tg_headers(token))
        assert resp.status_code == 201, resp.text
        await asyncio.sleep(0.1)

    snap = await client.get("/api/limits/me", headers=tg_headers(token))
    assert snap.json()["credits"] == 3

    with no_network():
        resp = await client.post("/api/generations", json=GEN_BODY, headers=tg_headers(token))
        assert resp.status_code == 201, resp.text
        await asyncio.sleep(0.1)

    snap = await client.get("/api/limits/me", headers=tg_headers(token))
    assert snap.json()["credits"] == 1

    resp = await client.post("/api/generations", json=GEN_BODY, headers=tg_headers(token))
    assert resp.status_code == 429
    detail = resp.json()["detail"]
    assert detail["balance"] == 1
    assert detail["credit_cost"] == 2


@pytest.mark.asyncio
async def test_blocked_user_gets_403(auth_client: AsyncClient, client: AsyncClient) -> None:
    token = await login_tg_user(client, 777000444)
    resp = await auth_client.patch("/api/admin/tg-users/777000444", json={"is_blocked": True})
    assert resp.status_code == 200

    resp = await client.post("/api/generations", json=GEN_BODY, headers=tg_headers(token))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_no_default_plan_allows(client: AsyncClient) -> None:
    token = await login_tg_user(client, 777000555)
    with no_network():
        resp = await client.post("/api/generations", json=GEN_BODY, headers=tg_headers(token))
        assert resp.status_code == 201, resp.text
        await asyncio.sleep(0.1)


@pytest.mark.asyncio
async def test_admin_not_limited(auth_client: AsyncClient) -> None:
    await create_tariff(
        auth_client,
        is_default=True,
        limits=[{"resource_kind": "image", "period": "daily", "max_count": 1}],
    )
    with no_network():
        for _ in range(3):
            resp = await auth_client.post("/api/generations", json=GEN_BODY)
            assert resp.status_code == 201, resp.text
        await asyncio.sleep(0.1)


@pytest.mark.asyncio
async def test_video_quota_blocks(auth_client: AsyncClient, client: AsyncClient) -> None:
    await create_tariff(
        auth_client,
        is_default=True,
        limits=[{"resource_kind": "video", "period": "daily", "max_count": 1}],
    )
    token = await login_tg_user(client, 777000666)
    user_id = await me_id(client, token)
    await seed_usage(user_id, "video", 1)

    resp = await client.post(
        "/api/video-generations", json=VIDEO_BODY, headers=tg_headers(token)
    )
    assert resp.status_code == 429
    assert resp.json()["detail"]["resource_kind"] == "video"


@pytest.mark.asyncio
async def test_quota_snapshot(auth_client: AsyncClient, client: AsyncClient) -> None:
    await create_tariff(
        auth_client,
        name="Basic",
        is_default=True,
        limits=[
            {"resource_kind": "image", "period": "daily", "max_count": 5},
            {"resource_kind": "video", "period": "monthly", "max_count": None},
        ],
    )
    token = await login_tg_user(client, 777000777)
    user_id = await me_id(client, token)
    await seed_usage(user_id, "image", 2)

    resp = await client.get("/api/limits/me", headers=tg_headers(token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["enforcement_enabled"] is True
    assert body["plan"]["name"] == "Basic"
    resources = {(r["resource_kind"], r["period"]): r for r in body["resources"]}
    img = resources[("image", "daily")]
    assert img["limit"] == 5
    assert img["used"] == 2
    assert img["remaining"] == 3
    assert img["reset_at"] is not None
    vid = resources[("video", "monthly")]
    assert vid["limit"] is None
    assert vid["remaining"] is None


@pytest.mark.asyncio
async def test_subscription_overrides_default(auth_client: AsyncClient, client: AsyncClient) -> None:
    await create_tariff(
        auth_client,
        name="Free",
        is_default=True,
        limits=[{"resource_kind": "image", "period": "daily", "max_count": 1}],
    )
    premium = await create_tariff(
        auth_client,
        name="Premium",
        limits=[{"resource_kind": "image", "period": "daily", "max_count": 10}],
    )
    token = await login_tg_user(client, 777000888)
    user_id = await me_id(client, token)

    resp = await auth_client.post(
        "/api/admin/tg-users/777000888/subscription",
        json={"plan_id": premium["id"], "expires_at": None},
    )
    assert resp.status_code == 201, resp.text

    await seed_usage(user_id, "image", 3)  # over Free quota, under Premium
    with no_network():
        resp = await client.post("/api/generations", json=GEN_BODY, headers=tg_headers(token))
        assert resp.status_code == 201, resp.text
        await asyncio.sleep(0.1)

    snap = await client.get("/api/limits/me", headers=tg_headers(token))
    assert snap.json()["plan"]["name"] == "Premium"


@pytest.mark.asyncio
async def test_expired_subscription_falls_back_to_default(
    auth_client: AsyncClient, client: AsyncClient
) -> None:
    from datetime import datetime, timedelta, timezone

    await create_tariff(
        auth_client,
        name="Free",
        is_default=True,
        limits=[{"resource_kind": "image", "period": "daily", "max_count": 1}],
    )
    premium = await create_tariff(
        auth_client,
        name="Premium",
        limits=[{"resource_kind": "image", "period": "daily", "max_count": None}],
    )
    token = await login_tg_user(client, 777000999)
    user_id = await me_id(client, token)

    expired = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    resp = await auth_client.post(
        "/api/admin/tg-users/777000999/subscription",
        json={"plan_id": premium["id"], "expires_at": expired},
    )
    assert resp.status_code == 201

    await seed_usage(user_id, "image", 1)  # exhausts Free quota
    resp = await client.post("/api/generations", json=GEN_BODY, headers=tg_headers(token))
    assert resp.status_code == 429
