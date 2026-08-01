import pytest
from httpx import AsyncClient
from sqlmodel import select

from app.db import async_session_factory
from app.main import ensure_bootstrap_invite
from app.models import Invite, User


@pytest.mark.asyncio
async def test_invites_crud_and_block(auth_client: AsyncClient) -> None:
    resp = await auth_client.post("/api/invites")
    assert resp.status_code == 200
    inv = resp.json()
    assert inv["code"]
    assert inv["is_blocked"] is False
    assert inv["created_by_username"] == "alice"
    assert inv["used_by_username"] is None

    listed = await auth_client.get("/api/invites")
    assert listed.status_code == 200
    assert inv["id"] in [i["id"] for i in listed.json()]

    # blocked invite cannot be used for registration
    blocked = await auth_client.patch(f"/api/invites/{inv['id']}", json={"is_blocked": True})
    assert blocked.status_code == 200
    assert blocked.json()["is_blocked"] is True

    reg = await auth_client.post(
        "/api/auth/register",
        json={"username": "dave", "password": "secret12", "invite_code": inv["code"]},
    )
    assert reg.status_code == 400
    assert "blocked" in reg.json()["detail"].lower()

    # after unblocking registration succeeds and marks the invite used
    unblocked = await auth_client.patch(f"/api/invites/{inv['id']}", json={"is_blocked": False})
    assert unblocked.status_code == 200
    assert unblocked.json()["is_blocked"] is False

    reg2 = await auth_client.post(
        "/api/auth/register",
        json={"username": "dave", "password": "secret12", "invite_code": inv["code"]},
    )
    assert reg2.status_code == 200

    listed2 = await auth_client.get("/api/invites")
    entry = next(i for i in listed2.json() if i["id"] == inv["id"])
    assert entry["used_by_username"] == "dave"

    # delete
    deleted = await auth_client.delete(f"/api/invites/{inv['id']}")
    assert deleted.status_code == 204
    listed3 = await auth_client.get("/api/invites")
    assert inv["id"] not in [i["id"] for i in listed3.json()]

    missing = await auth_client.delete(f"/api/invites/{inv['id']}")
    assert missing.status_code == 404
    missing_patch = await auth_client.patch(
        f"/api/invites/{inv['id']}", json={"is_blocked": True}
    )
    assert missing_patch.status_code == 404


@pytest.mark.asyncio
async def test_invites_requires_auth(client: AsyncClient) -> None:
    assert (await client.get("/api/invites")).status_code == 401
    assert (await client.post("/api/invites")).status_code == 401


@pytest.mark.asyncio
async def test_invites_available_to_non_admin(client: AsyncClient) -> None:
    admin_reg = await client.post(
        "/api/auth/register",
        json={"username": "alice", "password": "secret12", "invite_code": "test-invite-code"},
    )
    assert admin_reg.status_code == 200
    admin_headers = {"Authorization": f"Bearer {admin_reg.json()['access_token']}"}

    inv_resp = await client.post("/api/invites", headers=admin_headers)
    assert inv_resp.status_code == 200
    inv = inv_resp.json()

    bob_reg = await client.post(
        "/api/auth/register",
        json={"username": "bob", "password": "secret12", "invite_code": inv["code"]},
    )
    assert bob_reg.status_code == 200
    bob_headers = {"Authorization": f"Bearer {bob_reg.json()['access_token']}"}

    assert (await client.get("/api/invites", headers=bob_headers)).status_code == 200
    assert (await client.post("/api/invites", headers=bob_headers)).status_code == 200
    assert (
        await client.patch(
            f"/api/invites/{inv['id']}", headers=bob_headers, json={"is_blocked": True}
        )
    ).status_code == 200
    assert (
        await client.delete(f"/api/invites/{inv['id']}", headers=bob_headers)
    ).status_code == 204


@pytest.mark.asyncio
async def test_bootstrap_invite_not_recreated_when_used() -> None:
    # consume the seeded bootstrap invite so no unused invites remain
    async with async_session_factory() as session:
        user = User(username="bob", password_hash="x")
        session.add(user)
        await session.commit()
        await session.refresh(user)

        result = await session.exec(select(Invite).where(Invite.code == "test-invite-code"))
        invite = result.one()
        invite.used_by = user.id
        session.add(invite)
        await session.commit()

    # startup must stay idempotent instead of crashing on the unique constraint
    await ensure_bootstrap_invite()
    await ensure_bootstrap_invite()

    async with async_session_factory() as session:
        result = await session.exec(select(Invite))
        assert [i.code for i in result.all()] == ["test-invite-code"]


@pytest.mark.asyncio
async def test_bootstrap_invite_created_when_absent() -> None:
    async with async_session_factory() as session:
        result = await session.exec(select(Invite))
        for invite in result.all():
            await session.delete(invite)
        await session.commit()

    await ensure_bootstrap_invite()
    await ensure_bootstrap_invite()

    async with async_session_factory() as session:
        result = await session.exec(select(Invite))
        invites = result.all()
        assert len(invites) == 1
        assert invites[0].code == "test-invite-code"
        assert invites[0].used_by is None
