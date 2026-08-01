import asyncio
import base64
import io

import httpx
import pytest
import respx
from httpx import AsyncClient
from PIL import Image as PILImage

from app.config import get_settings

TINY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


def _make_png(w: int = 64, h: int = 64) -> bytes:
    buf = io.BytesIO()
    PILImage.new("RGB", (w, h), color=(20, 40, 80)).save(buf, format="PNG")
    return buf.getvalue()


def _mock_agnes() -> None:
    settings = get_settings()
    respx.post(f"{settings.agnes_base_url}/images/generations").mock(
        return_value=httpx.Response(
            200,
            json={
                "created": 1,
                "data": [
                    {
                        "url": None,
                        "b64_json": base64.b64encode(TINY_PNG).decode(),
                        "revised_prompt": None,
                    }
                ],
            },
        )
    )


async def _category_id(client: AsyncClient) -> int:
    resp = await client.get("/api/categories")
    assert resp.status_code == 200
    return resp.json()[0]["id"]  # type: ignore[no-any-return]


async def _create_prompt(client: AsyncClient, mode: str | None = None) -> dict:
    body: dict = {
        "title": f"prompt-{mode or 'default'}",
        "category_id": await _category_id(client),
        "text": "a test scene, cinematic lighting, high detail",
    }
    if mode is not None:
        body["mode"] = mode
    resp = await client.post("/api/prompts", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()  # type: ignore[no-any-return]


async def _upload_image(client: AsyncClient) -> int:
    resp = await client.post(
        "/api/images/upload",
        files={"file": ("ref.png", _make_png(), "image/png")},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]  # type: ignore[no-any-return]


@pytest.mark.asyncio
async def test_i2i_prompt_requires_reference(auth_client: AsyncClient) -> None:
    prompt = await _create_prompt(auth_client, mode="i2i")
    assert prompt["mode"] == "i2i"

    resp = await auth_client.post(
        "/api/generations",
        json={"prompt_version_id": prompt["current_version"]["id"]},
    )
    assert resp.status_code == 400
    assert "референс" in resp.json()["detail"]


@pytest.mark.asyncio
@respx.mock
async def test_i2i_prompt_with_reference_accepted(auth_client: AsyncClient) -> None:
    _mock_agnes()
    image_id = await _upload_image(auth_client)
    prompt = await _create_prompt(auth_client, mode="i2i")

    resp = await auth_client.post(
        "/api/generations",
        json={
            "prompt_version_id": prompt["current_version"]["id"],
            "reference_image_ids": [image_id],
        },
    )
    assert resp.status_code == 201, resp.text
    await asyncio.sleep(0.5)  # let the background job finish while agnes is mocked


@pytest.mark.asyncio
@respx.mock
async def test_i2i_prompt_with_parent_image_accepted(auth_client: AsyncClient) -> None:
    _mock_agnes()
    image_id = await _upload_image(auth_client)
    prompt = await _create_prompt(auth_client, mode="i2i")

    resp = await auth_client.post(
        "/api/generations",
        json={
            "mode": "edit",
            "prompt_version_id": prompt["current_version"]["id"],
            "parent_image_id": image_id,
        },
    )
    assert resp.status_code == 201, resp.text
    await asyncio.sleep(0.5)


@pytest.mark.asyncio
@respx.mock
async def test_t2i_prompt_without_reference_accepted(auth_client: AsyncClient) -> None:
    _mock_agnes()
    prompt = await _create_prompt(auth_client)
    assert prompt["mode"] == "t2i"

    resp = await auth_client.post(
        "/api/generations",
        json={"prompt_version_id": prompt["current_version"]["id"]},
    )
    assert resp.status_code == 201, resp.text
    await asyncio.sleep(0.5)


@pytest.mark.asyncio
@respx.mock
async def test_generation_saves_prompt_text_on_image(auth_client: AsyncClient) -> None:
    _mock_agnes()
    prompt_text = "a red fox in snow, cinematic lighting"

    resp = await auth_client.post(
        "/api/generations",
        json={"text": prompt_text, "size": "1K", "ratio": "1:1"},
    )
    assert resp.status_code == 201, resp.text
    job_id = resp.json()["id"]

    for _ in range(30):
        job = await auth_client.get(f"/api/generations/{job_id}")
        assert job.status_code == 200
        body = job.json()
        if body["status"] in ("done", "error"):
            break
        await asyncio.sleep(0.1)
    else:
        pytest.fail("generation did not finish")

    assert body["status"] == "done", body
    image_id = body["result_image_id"]
    assert image_id is not None

    img = await auth_client.get(f"/api/images/{image_id}")
    assert img.status_code == 200
    assert img.json()["prompt_text"] == prompt_text
