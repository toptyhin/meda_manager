import pytest
from httpx import AsyncClient

from tg_helpers import create_tariff, login_tg_user


async def _register_second_user(client: AsyncClient, auth_client: AsyncClient) -> str:
    """Create a non-admin user, return its token."""
    invite = await auth_client.post("/api/invites")
    assert invite.status_code == 200, invite.text
    resp = await client.post(
        "/api/auth/register",
        json={
            "username": "bob",
            "password": "secret12",
            "invite_code": invite.json()["code"],
        },
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]  # type: ignore[no-any-return]


@pytest.mark.asyncio
async def test_create_list_update_tariff(auth_client: AsyncClient) -> None:
    plan = await create_tariff(
        auth_client,
        name="Free",
        is_default=True,
        limits=[
            {"resource_kind": "image", "period": "daily", "max_count": 10, "credit_cost": 1},
            {"resource_kind": "video", "period": "monthly", "max_count": 3, "credit_cost": 5},
        ],
    )
    assert plan["name"] == "Free"
    assert plan["is_default"] is True
    assert len(plan["limits"]) == 2

    resp = await auth_client.get("/api/admin/tariffs")
    assert resp.status_code == 200
    assert [p["name"] for p in resp.json()] == ["Free"]
    assert len(resp.json()[0]["limits"]) == 2

    resp = await auth_client.patch(
        f"/api/admin/tariffs/{plan['id']}",
        json={
            "name": "Free+",
            "limits": [{"resource_kind": "image", "period": "weekly", "max_count": 50}],
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["name"] == "Free+"
    assert len(body["limits"]) == 1
    assert body["limits"][0]["period"] == "weekly"
    assert body["limits"][0]["max_count"] == 50


@pytest.mark.asyncio
async def test_duplicate_name_rejected(auth_client: AsyncClient) -> None:
    await create_tariff(auth_client, name="Free")
    resp = await auth_client.post("/api/admin/tariffs", json={"name": "Free"})
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_duplicate_limit_row_rejected(auth_client: AsyncClient) -> None:
    resp = await auth_client.post(
        "/api/admin/tariffs",
        json={
            "name": "Broken",
            "limits": [
                {"resource_kind": "image", "period": "daily", "max_count": 5},
                {"resource_kind": "image", "period": "daily", "max_count": 10},
            ],
        },
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_default_is_unique(auth_client: AsyncClient) -> None:
    first = await create_tariff(auth_client, name="One", is_default=True)
    await create_tariff(auth_client, name="Two", is_default=True)

    resp = await auth_client.get("/api/admin/tariffs")
    plans = {p["id"]: p for p in resp.json()}
    assert plans[first["id"]]["is_default"] is False


@pytest.mark.asyncio
async def test_delete_without_subscriptions_is_hard(auth_client: AsyncClient) -> None:
    plan = await create_tariff(auth_client, name="Temp")
    resp = await auth_client.delete(f"/api/admin/tariffs/{plan['id']}")
    assert resp.status_code == 204

    resp = await auth_client.get("/api/admin/tariffs")
    assert resp.json() == []


@pytest.mark.asyncio
async def test_delete_with_subscriptions_is_soft(
    auth_client: AsyncClient, client: AsyncClient
) -> None:
    plan = await create_tariff(auth_client, name="Free", is_default=True)
    await login_tg_user(client, 888000111)
    resp = await auth_client.post(
        "/api/admin/tg-users/888000111/subscription",
        json={"plan_id": plan["id"]},
    )
    assert resp.status_code == 201

    resp = await auth_client.delete(f"/api/admin/tariffs/{plan['id']}")
    assert resp.status_code == 204

    resp = await auth_client.get("/api/admin/tariffs")
    kept = resp.json()[0]
    assert kept["is_active"] is False
    assert kept["is_default"] is False


@pytest.mark.asyncio
async def test_missing_tariff_404(auth_client: AsyncClient) -> None:
    resp = await auth_client.patch("/api/admin/tariffs/424242", json={"name": "x"})
    assert resp.status_code == 404
    resp = await auth_client.delete("/api/admin/tariffs/424242")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_non_admin_forbidden(auth_client: AsyncClient, client: AsyncClient) -> None:
    token = await _register_second_user(client, auth_client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.get("/api/admin/tariffs", headers=headers)
    assert resp.status_code == 403
    resp = await client.post("/api/admin/tariffs", json={"name": "Nope"}, headers=headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_unauthenticated_forbidden(client: AsyncClient) -> None:
    resp = await client.get("/api/admin/tariffs")
    assert resp.status_code == 401
