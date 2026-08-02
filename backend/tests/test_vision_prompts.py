import io
import json

import httpx
import pytest
import respx
from httpx import AsyncClient
from PIL import Image as PILImage

from app.config import get_settings


def _make_png(w: int = 32, h: int = 32) -> bytes:
    buf = io.BytesIO()
    PILImage.new("RGB", (w, h), color=(80, 40, 20)).save(buf, format="PNG")
    return buf.getvalue()


def _chat_response(text: str) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "choices": [
                {
                    "message": {"role": "assistant", "content": text},
                    "finish_reason": "stop",
                }
            ]
        },
    )


async def _upload_image(auth_client: AsyncClient) -> int:
    resp = await auth_client.post(
        "/api/images/upload",
        files={"file": ("ref.png", _make_png(), "image/png")},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]  # type: ignore[no-any-return]


@pytest.mark.asyncio
@respx.mock
async def test_describe_image(auth_client: AsyncClient) -> None:
    image_id = await _upload_image(auth_client)

    settings = get_settings()
    route = respx.post(f"{settings.agnes_base_url}/chat/completions").mock(
        return_value=_chat_response(
            "**Prompt:** A moody studio portrait, warm rim light, shallow depth of field"
        )
    )

    resp = await auth_client.post(
        "/api/assistant/describe-image",
        json={"image_id": image_id},
    )
    assert resp.status_code == 200, resp.text
    # service label prefix is stripped from the model output
    assert resp.json()["text"] == (
        "A moody studio portrait, warm rim light, shallow depth of field"
    )

    assert route.called
    payload = json.loads(route.calls[0].request.content)
    user_content = payload["messages"][1]["content"]
    image_part = next(p for p in user_content if p["type"] == "image_url")
    assert image_part["image_url"]["url"].startswith("data:image/png;base64,")


@pytest.mark.asyncio
@respx.mock
async def test_extract_style(auth_client: AsyncClient) -> None:
    image_id = await _upload_image(auth_client)

    settings = get_settings()
    route = respx.post(f"{settings.agnes_base_url}/chat/completions").mock(
        return_value=_chat_response(
            "Gouache illustration, flat muted palette, soft grain texture"
        )
    )

    resp = await auth_client.post(
        "/api/assistant/extract-style",
        json={"image_id": image_id},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["text"] == (
        "Gouache illustration, flat muted palette, soft grain texture"
    )
    assert route.called


@pytest.mark.asyncio
async def test_describe_image_not_found(auth_client: AsyncClient) -> None:
    resp = await auth_client.post(
        "/api/assistant/describe-image",
        json={"image_id": 9999},
    )
    assert resp.status_code == 404
