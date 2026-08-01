import pytest
from httpx import AsyncClient

from app.style_preset_seed import SEED_STYLE_PRESETS


@pytest.mark.asyncio
async def test_styles_seed_on_first_list(auth_client: AsyncClient) -> None:
    resp = await auth_client.get("/api/styles")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == len(SEED_STYLE_PRESETS) == 62
    titles = {p["title"] for p in items}
    assert "Студийная фотография" in titles
    assert "Покадровая анимация (Stop Motion)" in titles
    assert "Дрон-пролет (Эпический обзор)" in titles
    assert "FPV-экшн (Вид от первого лица)" in titles
    video = [p for p in items if p["kind"] == "video"]
    assert len(video) == 26
    image = [p for p in items if p["kind"] == "image"]
    assert len(image) == 36
    both = [p for p in items if p["kind"] == "both"]
    assert len(both) == 0


@pytest.mark.asyncio
async def test_styles_seed_idempotent(auth_client: AsyncClient) -> None:
    first = await auth_client.get("/api/styles")
    assert first.status_code == 200
    assert len(first.json()) == 62

    second = await auth_client.get("/api/styles")
    assert second.status_code == 200
    assert len(second.json()) == 62
    assert {p["id"] for p in first.json()} == {p["id"] for p in second.json()}


@pytest.mark.asyncio
async def test_styles_kind_filter(auth_client: AsyncClient) -> None:
    await auth_client.get("/api/styles")  # seed

    image = await auth_client.get("/api/styles", params={"kind": "image"})
    assert image.status_code == 200
    image_items = image.json()
    assert all(p["kind"] in ("image", "both") for p in image_items)
    assert len(image_items) == 36
    assert all(p["kind"] == "image" for p in image_items)

    video = await auth_client.get("/api/styles", params={"kind": "video"})
    assert video.status_code == 200
    video_items = video.json()
    assert all(p["kind"] in ("video", "both") for p in video_items)
    assert len(video_items) == 26
    assert all(p["kind"] == "video" for p in video_items)


@pytest.mark.asyncio
async def test_styles_seed_adds_missing_presets(auth_client: AsyncClient) -> None:
    """Existing users get newly added seed presets on next list."""
    first = await auth_client.get("/api/styles")
    assert first.status_code == 200
    assert len(first.json()) == 62

    # Simulate "old" DB: delete the new video presets
    new_titles = {
        "Дрон-пролет (Эпический обзор)",
        "FPV-экшн (Вид от первого лица)",
    }
    for p in first.json():
        if p["title"] in new_titles:
            deleted = await auth_client.delete(f"/api/styles/{p['id']}")
            assert deleted.status_code == 204

    mid = await auth_client.get("/api/styles")
    assert mid.status_code == 200
    assert len(mid.json()) == 62  # re-seeded missing titles
    titles = {p["title"] for p in mid.json()}
    assert new_titles.issubset(titles)


@pytest.mark.asyncio
async def test_styles_crud(auth_client: AsyncClient) -> None:
    created = await auth_client.post(
        "/api/styles",
        json={
            "title": "Мой стиль",
            "description": "Кастомный",
            "category": "Свои",
            "kind": "image",
            "text": "Custom style of {subject}, neon glow.",
        },
    )
    assert created.status_code == 201, created.text
    data = created.json()
    assert data["title"] == "Мой стиль"
    assert data["kind"] == "image"
    preset_id = data["id"]

    dup = await auth_client.post(
        "/api/styles",
        json={
            "title": "Мой стиль",
            "category": "Свои",
            "text": "duplicate",
        },
    )
    assert dup.status_code == 409

    patched = await auth_client.patch(
        f"/api/styles/{preset_id}",
        json={"title": "Мой стиль v2", "text": "Updated style of {subject}."},
    )
    assert patched.status_code == 200
    assert patched.json()["title"] == "Мой стиль v2"
    assert "Updated style" in patched.json()["text"]

    deleted = await auth_client.delete(f"/api/styles/{preset_id}")
    assert deleted.status_code == 204

    gone = await auth_client.patch(
        f"/api/styles/{preset_id}",
        json={"title": "ghost"},
    )
    assert gone.status_code == 404

    missing = await auth_client.delete("/api/styles/999999")
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_styles_user_isolation(client: AsyncClient, auth_client: AsyncClient) -> None:
    # auth_client is alice — seed her presets
    alice_list = await auth_client.get("/api/styles")
    assert alice_list.status_code == 200
    alice_ids = {p["id"] for p in alice_list.json()}
    assert len(alice_ids) == 62

    # create a second unused invite and register bob
    from app.db import async_session_factory
    from app.models import Invite

    async with async_session_factory() as session:
        session.add(Invite(code="bob-invite-code"))
        await session.commit()

    reg = await client.post(
        "/api/auth/register",
        json={
            "username": "bob",
            "password": "secret12",
            "invite_code": "bob-invite-code",
        },
    )
    assert reg.status_code == 200, reg.text
    bob_token = reg.json()["access_token"]

    bob_list = await client.get(
        "/api/styles",
        headers={"Authorization": f"Bearer {bob_token}"},
    )
    assert bob_list.status_code == 200
    bob_items = bob_list.json()
    assert len(bob_items) == 62
    bob_ids = {p["id"] for p in bob_items}
    assert alice_ids.isdisjoint(bob_ids)

    # bob cannot delete alice's preset
    alice_id = next(iter(alice_ids))
    forbidden = await client.delete(
        f"/api/styles/{alice_id}",
        headers={"Authorization": f"Bearer {bob_token}"},
    )
    assert forbidden.status_code == 404
