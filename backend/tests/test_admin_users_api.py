import pytest
from httpx import AsyncClient

from tg_helpers import create_tariff, login_tg_user


@pytest.mark.asyncio
async def test_list_search_and_pagination(auth_client: AsyncClient, client: AsyncClient) -> None:
    await login_tg_user(client, 999000111, first_name="Маша", username="masha_t")
    await login_tg_user(client, 999000222, first_name="Петя", username="petya_t")

    resp = await auth_client.get("/api/admin/tg-users")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 2
    assert len(body["items"]) == 2
    item = body["items"][0]
    assert {"telegram_id", "username", "plan", "balance", "used_today", "used_month", "is_blocked"} <= set(item)

    resp = await auth_client.get("/api/admin/tg-users", params={"q": "masha"})
    assert resp.json()["total"] == 1
    assert resp.json()["items"][0]["telegram_id"] == 999000111

    resp = await auth_client.get("/api/admin/tg-users", params={"q": "999000222"})
    assert resp.json()["total"] == 1
    assert resp.json()["items"][0]["username"] == "petya_t"

    resp = await auth_client.get("/api/admin/tg-users", params={"limit": 1, "offset": 1})
    assert resp.json()["total"] == 2
    assert len(resp.json()["items"]) == 1


@pytest.mark.asyncio
async def test_detail_with_subscription_and_credits(
    auth_client: AsyncClient, client: AsyncClient
) -> None:
    plan = await create_tariff(
        auth_client,
        name="Free",
        is_default=True,
        limits=[{"resource_kind": "image", "period": "daily", "max_count": 3}],
    )
    await login_tg_user(client, 999000333)

    resp = await auth_client.post(
        "/api/admin/tg-users/999000333/subscription",
        json={"plan_id": plan["id"], "expires_at": None},
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["plan_name"] == "Free"

    resp = await auth_client.post(
        "/api/admin/tg-users/999000333/credits",
        json={"amount": 25, "kind": "bonus", "reason": "welcome"},
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["amount"] == 25

    resp = await auth_client.get("/api/admin/tg-users/999000333")
    assert resp.status_code == 200, resp.text
    detail = resp.json()
    assert detail["balance"] == 25
    assert detail["subscriptions"][0]["plan_name"] == "Free"
    assert detail["subscriptions"][0]["active"] is True
    assert any(t["amount"] == 25 and t["kind"] == "bonus" for t in detail["transactions"])
    assert detail["quota"]["plan"]["name"] == "Free"
    img = detail["quota"]["resources"][0]
    assert img["limit"] == 3 and img["remaining"] == 3


@pytest.mark.asyncio
async def test_assign_missing_or_inactive_plan_rejected(
    auth_client: AsyncClient, client: AsyncClient
) -> None:
    await login_tg_user(client, 999000444)

    resp = await auth_client.post(
        "/api/admin/tg-users/999000444/subscription", json={"plan_id": 424242}
    )
    assert resp.status_code == 404

    plan = await create_tariff(auth_client, name="Dead")
    resp = await auth_client.patch(f"/api/admin/tariffs/{plan['id']}", json={"is_active": False})
    assert resp.status_code == 200

    resp = await auth_client.post(
        "/api/admin/tg-users/999000444/subscription", json={"plan_id": plan["id"]}
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_credits_validation(auth_client: AsyncClient, client: AsyncClient) -> None:
    await login_tg_user(client, 999000555)

    resp = await auth_client.post(
        "/api/admin/tg-users/999000555/credits", json={"amount": 0, "kind": "bonus"}
    )
    assert resp.status_code == 400

    resp = await auth_client.post(
        "/api/admin/tg-users/999000555/credits", json={"amount": 5, "kind": "consume"}
    )
    assert resp.status_code == 400

    resp = await auth_client.post(
        "/api/admin/tg-users/999000555/credits",
        json={"amount": -3, "kind": "adjustment", "reason": "clawback"},
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["amount"] == -3

    resp = await auth_client.get("/api/admin/tg-users/999000555")
    assert resp.json()["balance"] == -3


@pytest.mark.asyncio
async def test_block_toggle(auth_client: AsyncClient, client: AsyncClient) -> None:
    await login_tg_user(client, 999000666)

    resp = await auth_client.patch("/api/admin/tg-users/999000666", json={"is_blocked": True})
    assert resp.status_code == 200
    assert resp.json()["is_blocked"] is True

    resp = await auth_client.patch("/api/admin/tg-users/999000666", json={"is_blocked": False})
    assert resp.status_code == 200
    assert resp.json()["is_blocked"] is False


@pytest.mark.asyncio
async def test_missing_user_404(auth_client: AsyncClient) -> None:
    resp = await auth_client.get("/api/admin/tg-users/424242")
    assert resp.status_code == 404
    resp = await auth_client.patch("/api/admin/tg-users/424242", json={"is_blocked": True})
    assert resp.status_code == 404
    resp = await auth_client.post(
        "/api/admin/tg-users/424242/credits", json={"amount": 1, "kind": "bonus"}
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_non_admin_forbidden(auth_client: AsyncClient, client: AsyncClient) -> None:
    invite = await auth_client.post("/api/invites")
    assert invite.status_code == 200
    resp = await client.post(
        "/api/auth/register",
        json={"username": "bob", "password": "secret12", "invite_code": invite.json()["code"]},
    )
    assert resp.status_code == 200
    token = resp.json()["access_token"]

    resp = await client.get(
        "/api/admin/tg-users", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 403
