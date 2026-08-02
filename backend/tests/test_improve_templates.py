import httpx
import pytest
import respx
from httpx import AsyncClient

from app.config import get_settings
from app.providers.agnes import IMPROVE_SYSTEM_T2I, VIDEO_IMPROVE_SYSTEM_T2V


@pytest.mark.asyncio
async def test_get_default_image_template(auth_client: AsyncClient) -> None:
    resp = await auth_client.get("/api/assistant/templates/image_t2i")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["kind"] == "image_t2i"
    assert body["is_default"] is True
    assert body["version"] is None
    assert body["versions"] == []
    assert body["text"] == IMPROVE_SYSTEM_T2I
    assert body["default_text"] == IMPROVE_SYSTEM_T2I


@pytest.mark.asyncio
async def test_get_default_video_template(auth_client: AsyncClient) -> None:
    resp = await auth_client.get("/api/assistant/templates/video_t2v")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["kind"] == "video_t2v"
    assert body["is_default"] is True
    assert body["text"] == VIDEO_IMPROVE_SYSTEM_T2V


@pytest.mark.asyncio
async def test_create_and_list_template_versions(auth_client: AsyncClient) -> None:
    v1 = await auth_client.post(
        "/api/assistant/templates/image_t2i/versions",
        json={"text": "Custom image improve v1"},
    )
    assert v1.status_code == 201, v1.text
    assert v1.json()["version"] == 1
    assert v1.json()["text"] == "Custom image improve v1"

    v2 = await auth_client.post(
        "/api/assistant/templates/image_t2i/versions",
        json={"text": "Custom image improve v2"},
    )
    assert v2.status_code == 201, v2.text
    assert v2.json()["version"] == 2

    current = await auth_client.get("/api/assistant/templates/image_t2i")
    assert current.status_code == 200
    body = current.json()
    assert body["is_default"] is False
    assert body["version"] == 2
    assert body["text"] == "Custom image improve v2"
    assert [v["version"] for v in body["versions"]] == [2, 1]


@pytest.mark.asyncio
async def test_image_and_video_templates_are_separate(auth_client: AsyncClient) -> None:
    await auth_client.post(
        "/api/assistant/templates/image_t2i/versions",
        json={"text": "Image-only template"},
    )
    await auth_client.post(
        "/api/assistant/templates/video_t2v/versions",
        json={"text": "Video-only template"},
    )

    image = (await auth_client.get("/api/assistant/templates/image_t2i")).json()
    video = (await auth_client.get("/api/assistant/templates/video_t2v")).json()
    assert image["text"] == "Image-only template"
    assert video["text"] == "Video-only template"


@pytest.mark.asyncio
async def test_mode_templates_are_separate(auth_client: AsyncClient) -> None:
    await auth_client.post(
        "/api/assistant/templates/image_t2i/versions",
        json={"text": "T2I template"},
    )
    await auth_client.post(
        "/api/assistant/templates/image_i2i/versions",
        json={"text": "I2I template"},
    )

    t2i = (await auth_client.get("/api/assistant/templates/image_t2i")).json()
    i2i = (await auth_client.get("/api/assistant/templates/image_i2i")).json()
    assert t2i["text"] == "T2I template"
    assert i2i["text"] == "I2I template"


@pytest.mark.asyncio
async def test_templates_are_per_user(
    client: AsyncClient, auth_client: AsyncClient
) -> None:
    await auth_client.post(
        "/api/assistant/templates/image_t2i/versions",
        json={"text": "Alice template"},
    )

    # second user via another invite
    from app.db import async_session_factory
    from app.models import Invite

    async with async_session_factory() as session:
        session.add(Invite(code="second-invite"))
        await session.commit()

    reg = await client.post(
        "/api/auth/register",
        json={
            "username": "bob",
            "password": "secret12",
            "invite_code": "second-invite",
        },
    )
    assert reg.status_code == 200, reg.text
    bob_token = reg.json()["access_token"]

    bob = await client.get(
        "/api/assistant/templates/image_t2i",
        headers={"Authorization": f"Bearer {bob_token}"},
    )
    assert bob.status_code == 200
    body = bob.json()
    assert body["is_default"] is True
    assert body["text"] == IMPROVE_SYSTEM_T2I


@pytest.mark.asyncio
@respx.mock
async def test_improve_uses_user_template(auth_client: AsyncClient) -> None:
    custom = "You are a custom image prompt rewriter. Output only English."
    await auth_client.post(
        "/api/assistant/templates/image_t2i/versions",
        json={"text": custom},
    )

    settings = get_settings()
    route = respx.post(f"{settings.agnes_base_url}/chat/completions").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "x",
                "choices": [
                    {
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": "Improved English prompt",
                        },
                        "finish_reason": "stop",
                    }
                ],
            },
        )
    )

    resp = await auth_client.post(
        "/api/assistant/improve",
        json={"text": "человек на улице"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["improved_text"] == "Improved English prompt"
    assert route.called
    body = route.calls[0].request.content
    assert custom.encode() in body


@pytest.mark.asyncio
@respx.mock
async def test_video_improve_uses_user_template(auth_client: AsyncClient) -> None:
    custom = "You are a custom video prompt rewriter."
    await auth_client.post(
        "/api/assistant/templates/video_t2v/versions",
        json={"text": custom},
    )

    settings = get_settings()
    route = respx.post(f"{settings.agnes_base_url}/chat/completions").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "x",
                "choices": [
                    {
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": "Cinematic tracking shot",
                        },
                        "finish_reason": "stop",
                    }
                ],
            },
        )
    )

    resp = await auth_client.post(
        "/api/assistant/video-improve",
        json={"text": "девушка идёт по улице"},
    )
    assert resp.status_code == 200, resp.text
    assert route.called
    assert custom.encode() in route.calls[0].request.content


@pytest.mark.asyncio
async def test_reject_empty_template(auth_client: AsyncClient) -> None:
    resp = await auth_client.post(
        "/api/assistant/templates/image_t2i/versions",
        json={"text": "   "},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
@respx.mock
async def test_improve_mode_selects_mode_template(auth_client: AsyncClient) -> None:
    i2i_custom = "You are an i2i edit instruction rewriter."
    await auth_client.post(
        "/api/assistant/templates/image_i2i/versions",
        json={"text": i2i_custom},
    )

    settings = get_settings()
    route = respx.post(f"{settings.agnes_base_url}/chat/completions").mock(
        return_value=httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": "Change the background to a sunset beach, preserve the subject",
                        },
                        "finish_reason": "stop",
                    }
                ],
            },
        )
    )

    resp = await auth_client.post(
        "/api/assistant/improve",
        json={"text": "замени фон на пляж", "mode": "i2i"},
    )
    assert resp.status_code == 200, resp.text
    assert route.called
    assert i2i_custom.encode() in route.calls[0].request.content

    resp = await auth_client.post(
        "/api/assistant/improve",
        json={"text": "кот в космосе"},
    )
    assert resp.status_code == 200, resp.text
    # t2i default template is used when mode is omitted
    assert b"text-to-image" in route.calls[1].request.content


@pytest.mark.asyncio
@respx.mock
async def test_video_improve_mode_selects_mode_template(auth_client: AsyncClient) -> None:
    settings = get_settings()
    route = respx.post(f"{settings.agnes_base_url}/chat/completions").mock(
        return_value=httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": "Gentle zoom-in while the candle flame flickers",
                        },
                        "finish_reason": "stop",
                    }
                ],
            },
        )
    )

    resp = await auth_client.post(
        "/api/assistant/video-improve",
        json={"text": "оживи фото свечи", "mode": "i2v"},
    )
    assert resp.status_code == 200, resp.text
    assert route.called
    assert b"image-to-video" in route.calls[0].request.content

    resp = await auth_client.post(
        "/api/assistant/video-improve",
        json={"text": "переход от дня к ночи", "mode": "keyframes"},
    )
    assert resp.status_code == 200, resp.text
    assert b"keyframe" in route.calls[1].request.content
