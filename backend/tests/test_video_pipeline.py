import io
import json
import time
from contextlib import contextmanager
from typing import Iterator
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from PIL import Image as PILImage

from app.config import get_settings
from app.db import async_session_factory
from app.models import GenerationStatus, Video, VideoGeneration, VideoMode
from app.providers.base import GenerationError, VideoTaskRef, VideoTaskResult
from app.services.jobs import run_video_generation
from app.services.media_links import build_signed_image_url, verify_signed_image_link


def _make_png(color: tuple[int, int, int] = (20, 40, 80), w: int = 64, h: int = 64) -> bytes:
    buf = io.BytesIO()
    PILImage.new("RGB", (w, h), color=color).save(buf, format="PNG")
    return buf.getvalue()


PNG_A = _make_png((10, 20, 30))
FAKE_MP4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 64


async def _upload_image(auth_client: AsyncClient) -> int:
    resp = await auth_client.post(
        "/api/images/upload",
        files={"file": ("a.png", PNG_A, "image/png")},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _create_video_job(
    auth_client: AsyncClient,
    *,
    mode: VideoMode = VideoMode.t2v,
    source_image_ids: list[int] | None = None,
    text: str = "a cinematic beach scene",
    seed: int = 123,
) -> int:
    me = await auth_client.get("/api/auth/me")
    user_id = me.json()["id"]
    params = {
        "text": text,
        "source_image_ids": source_image_ids or [],
        "width": 1152,
        "height": 768,
        "num_frames": 81,
        "frame_rate": 24,
        "seed": seed,
        "negative_prompt": "blurry, watermark",
        "category_id": None,
        "mode": mode.value,
    }
    async with async_session_factory() as session:
        job = VideoGeneration(
            user_id=user_id,
            mode=mode,
            params=json.dumps(params, ensure_ascii=False),
            progress=0,
        )
        session.add(job)
        await session.commit()
        await session.refresh(job)
        return job.id  # type: ignore[return-value]


@contextmanager
def _mock_video_provider(
    *,
    create: AsyncMock | None = None,
    get_result: AsyncMock | None = None,
    download: AsyncMock | None = None,
) -> Iterator[None]:
    create = create or AsyncMock(
        return_value=VideoTaskRef(task_id="task_1", video_id="video_1")
    )
    get_result = get_result or AsyncMock(
        return_value=VideoTaskResult(
            status="completed",
            progress=100,
            url="https://cdn.example.com/out.mp4",
            seconds=3.0,
            size="1152x768",
        )
    )
    download = download or AsyncMock(return_value=FAKE_MP4)
    with (
        patch("app.services.jobs.AgnesProvider.create_video_task", create),
        patch("app.services.jobs.AgnesProvider.get_video_result", get_result),
        patch("app.services.jobs.AgnesProvider.download_video", download),
        patch("app.services.jobs.AgnesProvider.aclose", AsyncMock()),
    ):
        yield


@pytest.mark.asyncio
async def test_video_job_t2v_success(auth_client: AsyncClient) -> None:
    job_id = await _create_video_job(auth_client, mode=VideoMode.t2v)
    with _mock_video_provider():
        await run_video_generation(job_id)

    async with async_session_factory() as session:
        job = await session.get(VideoGeneration, job_id)
        assert job is not None
        assert job.status == GenerationStatus.done
        assert job.progress == 100
        assert job.result_video_id is not None
        assert job.provider_video_id == "video_1"
        video = await session.get(Video, job.result_video_id)
        assert video is not None
        assert video.mode == VideoMode.t2v
        assert video.seed == 123
        assert video.width == 1152
        assert video.height == 768
        assert video.duration == 3.0
        assert video.negative_prompt == "blurry, watermark"


@pytest.mark.asyncio
async def test_video_job_provider_failure(auth_client: AsyncClient) -> None:
    job_id = await _create_video_job(auth_client)
    create = AsyncMock(side_effect=GenerationError("boom", status_code=500))
    with _mock_video_provider(create=create):
        await run_video_generation(job_id)

    async with async_session_factory() as session:
        job = await session.get(VideoGeneration, job_id)
        assert job is not None
        assert job.status == GenerationStatus.error
        assert "boom" in (job.error or "")


@pytest.mark.asyncio
async def test_video_job_poll_then_complete(auth_client: AsyncClient) -> None:
    job_id = await _create_video_job(auth_client)
    get_result = AsyncMock(
        side_effect=[
            VideoTaskResult(status="queued", progress=0),
            VideoTaskResult(status="in_progress", progress=40),
            VideoTaskResult(
                status="completed",
                progress=100,
                url="https://cdn.example.com/out.mp4",
                seconds=3.375,
                size="1152x768",
            ),
        ]
    )
    settings = get_settings()
    with (
        _mock_video_provider(get_result=get_result),
        patch("app.services.jobs.asyncio.sleep", AsyncMock()),
        patch.object(settings, "video_poll_interval", 0),
    ):
        await run_video_generation(job_id)

    async with async_session_factory() as session:
        job = await session.get(VideoGeneration, job_id)
        assert job is not None
        assert job.status == GenerationStatus.done
        assert get_result.await_count == 3


@pytest.mark.asyncio
async def test_create_video_generation_api_validation(auth_client: AsyncClient) -> None:
    # bad frames
    resp = await auth_client.post(
        "/api/video-generations",
        json={
            "mode": "t2v",
            "text": "hello",
            "width": 1152,
            "height": 768,
            "num_frames": 80,
            "frame_rate": 24,
        },
    )
    assert resp.status_code == 400
    assert "8n+1" in resp.json()["detail"]

    # i2v without PUBLIC_BASE_URL
    img_id = await _upload_image(auth_client)
    settings = get_settings()
    with patch.object(settings, "public_base_url", ""):
        resp = await auth_client.post(
            "/api/video-generations",
            json={
                "mode": "i2v",
                "text": "animate",
                "source_image_ids": [img_id],
                "width": 1152,
                "height": 768,
                "num_frames": 81,
                "frame_rate": 24,
            },
        )
        assert resp.status_code == 400
        assert "PUBLIC_BASE_URL" in resp.json()["detail"]

    # i2v wrong image count
    with patch.object(settings, "public_base_url", "http://test"):
        resp = await auth_client.post(
            "/api/video-generations",
            json={
                "mode": "i2v",
                "text": "animate",
                "source_image_ids": [],
                "width": 1152,
                "height": 768,
                "num_frames": 81,
                "frame_rate": 24,
            },
        )
        assert resp.status_code == 400


@pytest.mark.asyncio
async def test_create_and_poll_video_generation_api(auth_client: AsyncClient) -> None:
    create = AsyncMock(return_value=VideoTaskRef(task_id="t", video_id="v"))
    get_result = AsyncMock(
        return_value=VideoTaskResult(
            status="completed",
            progress=100,
            url="https://cdn.example.com/out.mp4",
            seconds=5.0,
            size="1280x720",
        )
    )
    download = AsyncMock(return_value=FAKE_MP4)

    with (
        patch("app.services.jobs.AgnesProvider.create_video_task", create),
        patch("app.services.jobs.AgnesProvider.get_video_result", get_result),
        patch("app.services.jobs.AgnesProvider.download_video", download),
        patch("app.services.jobs.AgnesProvider.aclose", AsyncMock()),
        patch("app.services.jobs.asyncio.sleep", AsyncMock()),
    ):
        resp = await auth_client.post(
            "/api/video-generations",
            json={
                "mode": "t2v",
                "text": "a dog running",
                "width": 1280,
                "height": 720,
                "num_frames": 121,
                "frame_rate": 24,
                "seed": 7,
            },
        )
        assert resp.status_code == 201, resp.text
        job = resp.json()
        assert job["status"] == "pending"
        assert job["params"]["seed"] == 7

        # Background task may still be running; poll until terminal.
        done = job
        for _ in range(50):
            resp = await auth_client.get(f"/api/video-generations/{job['id']}")
            assert resp.status_code == 200
            done = resp.json()
            if done["status"] in ("done", "error"):
                break
            import asyncio

            await asyncio.sleep(0.05)

    assert done["status"] == "done", done
    assert done["result_video_id"] is not None

    vid = done["result_video_id"]
    resp = await auth_client.get(f"/api/videos/{vid}")
    assert resp.status_code == 200
    assert resp.json()["seed"] == 7

    resp = await auth_client.get(f"/api/videos/{vid}/file")
    assert resp.status_code == 200
    assert resp.content == FAKE_MP4

    resp = await auth_client.get("/api/videos")
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1

    resp = await auth_client.delete(f"/api/videos/{vid}")
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_signed_media_links(auth_client: AsyncClient) -> None:
    img_id = await _upload_image(auth_client)
    settings = get_settings()
    with patch.object(settings, "public_base_url", "http://test"):
        url = build_signed_image_url(img_id, settings, ttl=60)
        assert f"/api/media-ingress/{img_id}" in url
        assert "exp=" in url and "sig=" in url

        from urllib.parse import parse_qs, urlparse

        qs = parse_qs(urlparse(url).query)
        exp = int(qs["exp"][0])
        sig = qs["sig"][0]
        assert verify_signed_image_link(img_id, exp, sig, settings) is True
        assert verify_signed_image_link(img_id, exp, "deadbeef", settings) is False
        assert verify_signed_image_link(img_id, int(time.time()) - 10, sig, settings) is False

        resp = await auth_client.get(f"/api/media-ingress/{img_id}", params={"exp": exp, "sig": sig})
        assert resp.status_code == 200
        assert resp.content == PNG_A

        resp = await auth_client.get(
            f"/api/media-ingress/{img_id}",
            params={"exp": exp, "sig": "0" * 64},
        )
        assert resp.status_code == 403


@pytest.mark.asyncio
async def test_i2v_job_builds_signed_urls(auth_client: AsyncClient) -> None:
    img_id = await _upload_image(auth_client)
    settings = get_settings()
    job_id = await _create_video_job(
        auth_client,
        mode=VideoMode.i2v,
        source_image_ids=[img_id],
    )
    create = AsyncMock(return_value=VideoTaskRef(task_id="t", video_id="v"))
    with (
        patch.object(settings, "public_base_url", "http://public.test"),
        _mock_video_provider(create=create),
    ):
        await run_video_generation(job_id)

    assert create.await_count == 1
    kwargs = create.await_args.kwargs
    assert kwargs["mode"] == "i2v"
    assert len(kwargs["image_urls"]) == 1
    assert kwargs["image_urls"][0].startswith("http://public.test/api/media-ingress/")
