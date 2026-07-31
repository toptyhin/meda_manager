import base64
import io

import pytest
from httpx import AsyncClient
from PIL import Image as PILImage

TINY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


def _make_png(w: int = 64, h: int = 64) -> bytes:
    buf = io.BytesIO()
    PILImage.new("RGB", (w, h), color=(20, 40, 80)).save(buf, format="PNG")
    return buf.getvalue()


@pytest.mark.asyncio
async def test_upload_list_rate(auth_client: AsyncClient) -> None:
    data = _make_png()
    resp = await auth_client.post(
        "/api/images/upload",
        files={"file": ("ref.png", data, "image/png")},
    )
    assert resp.status_code == 201, resp.text
    img = resp.json()
    assert img["kind"] == "reference"
    assert img["width"] == 64
    image_id = img["id"]

    patch = await auth_client.patch(f"/api/images/{image_id}", json={"rating": 4})
    assert patch.status_code == 200
    assert patch.json()["rating"] == 4

    listing = await auth_client.get("/api/images", params={"rating_min": 3, "sort": "rating"})
    assert listing.status_code == 200
    body = listing.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == image_id

    thumb = await auth_client.get(f"/api/images/{image_id}/thumb")
    assert thumb.status_code == 200
    assert thumb.headers["content-type"].startswith("image/")
