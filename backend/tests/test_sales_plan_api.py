import pytest
from httpx import AsyncClient


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
async def test_create_list_update_delete_scenario(auth_client: AsyncClient) -> None:
    resp = await auth_client.post(
        "/api/sales-scenarios",
        json={
            "name": "Baseline",
            "payload": {"currencyRate": 90, "arppuRub": 990},
        },
    )
    assert resp.status_code == 201, resp.text
    created = resp.json()
    assert created["name"] == "Baseline"
    assert created["payload"]["currencyRate"] == 90
    assert created["id"] > 0

    resp = await auth_client.get("/api/sales-scenarios")
    assert resp.status_code == 200
    assert [s["name"] for s in resp.json()] == ["Baseline"]

    resp = await auth_client.patch(
        f"/api/sales-scenarios/{created['id']}",
        json={"name": "Optimistic", "payload": {"currencyRate": 100, "arppuRub": 1490}},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["name"] == "Optimistic"
    assert body["payload"]["arppuRub"] == 1490

    resp = await auth_client.delete(f"/api/sales-scenarios/{created['id']}")
    assert resp.status_code == 204

    resp = await auth_client.get("/api/sales-scenarios")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_duplicate_name_rejected(auth_client: AsyncClient) -> None:
    resp = await auth_client.post(
        "/api/sales-scenarios",
        json={"name": "Baseline", "payload": {}},
    )
    assert resp.status_code == 201, resp.text

    resp = await auth_client.post(
        "/api/sales-scenarios",
        json={"name": "Baseline", "payload": {"x": 1}},
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_missing_scenario_404(auth_client: AsyncClient) -> None:
    resp = await auth_client.patch(
        "/api/sales-scenarios/424242",
        json={"name": "x"},
    )
    assert resp.status_code == 404
    resp = await auth_client.delete("/api/sales-scenarios/424242")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_non_admin_allowed(auth_client: AsyncClient, client: AsyncClient) -> None:
    token = await _register_second_user(client, auth_client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.get("/api/sales-scenarios", headers=headers)
    assert resp.status_code == 200
    resp = await client.post(
        "/api/sales-scenarios",
        json={"name": "Bob scenario", "payload": {}},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text


@pytest.mark.asyncio
async def test_unauthenticated_forbidden(client: AsyncClient) -> None:
    resp = await client.get("/api/sales-scenarios")
    assert resp.status_code == 401
