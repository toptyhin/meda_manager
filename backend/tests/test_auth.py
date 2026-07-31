import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register_login_me(client: AsyncClient) -> None:
    bad = await client.post(
        "/api/auth/register",
        json={"username": "bob", "password": "secret12", "invite_code": "wrong"},
    )
    assert bad.status_code == 400

    reg = await client.post(
        "/api/auth/register",
        json={
            "username": "bob",
            "password": "secret12",
            "invite_code": "test-invite-code",
        },
    )
    assert reg.status_code == 200
    token = reg.json()["access_token"]

    # invite reused
    again = await client.post(
        "/api/auth/register",
        json={
            "username": "carol",
            "password": "secret12",
            "invite_code": "test-invite-code",
        },
    )
    assert again.status_code == 400

    me = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["username"] == "bob"
    assert me.json()["is_admin"] is True

    login = await client.post(
        "/api/auth/login",
        json={"username": "bob", "password": "secret12"},
    )
    assert login.status_code == 200

    fail = await client.post(
        "/api/auth/login",
        json={"username": "bob", "password": "wrongpass"},
    )
    assert fail.status_code == 401


@pytest.mark.asyncio
async def test_register_seeds_default_categories(client: AsyncClient) -> None:
    reg = await client.post(
        "/api/auth/register",
        json={
            "username": "bob",
            "password": "secret12",
            "invite_code": "test-invite-code",
        },
    )
    assert reg.status_code == 200
    token = reg.json()["access_token"]

    resp = await client.get(
        "/api/categories", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    names = [c["name"] for c in resp.json()]
    assert sorted(names) == sorted(["Семья", "Отпуск", "Мода"])


@pytest.mark.asyncio
async def test_register_seeds_preset_prompts(client: AsyncClient) -> None:
    reg = await client.post(
        "/api/auth/register",
        json={
            "username": "bob",
            "password": "secret12",
            "invite_code": "test-invite-code",
        },
    )
    assert reg.status_code == 200
    headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}

    cats = await client.get("/api/categories", headers=headers)
    assert cats.status_code == 200
    prompts = await client.get("/api/prompts", headers=headers)
    assert prompts.status_code == 200
    items = prompts.json()
    assert len(items) >= 6

    for cat in cats.json():
        modes = {p["mode"] for p in items if p["category_id"] == cat["id"]}
        assert {"t2i", "i2i"} <= modes, f"category {cat['name']} misses t2i/i2i presets"

    for p in items:
        assert p["current_version"] is not None
        assert p["current_version"]["text"].strip()


@pytest.mark.asyncio
async def test_admin_invite(auth_client: AsyncClient) -> None:
    resp = await auth_client.post("/api/invites")
    assert resp.status_code == 200
    code = resp.json()["code"]
    assert code

    reg = await auth_client.post(
        "/api/auth/register",
        json={"username": "dave", "password": "secret12", "invite_code": code},
    )
    # auth_client already has Authorization header; register shouldn't need it
    assert reg.status_code == 200
    assert reg.json()["access_token"]
