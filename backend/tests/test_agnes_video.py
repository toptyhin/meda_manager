import httpx
import pytest
import respx

from app.config import get_settings
from app.providers.agnes import AgnesProvider
from app.providers.base import GenerationError


@pytest.mark.asyncio
@respx.mock
async def test_create_video_task_t2v() -> None:
    settings = get_settings()
    route = respx.post(f"{settings.agnes_base_url}/videos").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "task_abc",
                "task_id": "task_abc",
                "video_id": "video_xyz",
                "status": "queued",
                "progress": 0,
            },
        )
    )
    provider = AgnesProvider(settings=settings)
    try:
        ref = await provider.create_video_task(
            "a cat on the beach",
            mode="t2v",
            width=1152,
            height=768,
            num_frames=121,
            frame_rate=24,
            seed=42,
            negative_prompt="blurry",
        )
        assert ref.task_id == "task_abc"
        assert ref.video_id == "video_xyz"
        assert route.called
        body = route.calls[0].request.content
        assert b"agnes-video-v2.0" in body
        assert b"negative_prompt" in body
        assert b'"seed": 42' in body or b'"seed":42' in body
    finally:
        await provider.aclose()


@pytest.mark.asyncio
@respx.mock
async def test_create_video_task_i2v() -> None:
    settings = get_settings()
    route = respx.post(f"{settings.agnes_base_url}/videos").mock(
        return_value=httpx.Response(
            200,
            json={"task_id": "task_1", "video_id": "video_1", "status": "queued"},
        )
    )
    provider = AgnesProvider(settings=settings)
    try:
        ref = await provider.create_video_task(
            "animate gently",
            mode="i2v",
            image_urls=["https://example.com/img.png"],
        )
        assert ref.video_id == "video_1"
        body = route.calls[0].request.content
        assert b"https://example.com/img.png" in body
        assert b"extra_body" not in body
    finally:
        await provider.aclose()


@pytest.mark.asyncio
@respx.mock
async def test_create_video_task_keyframes() -> None:
    settings = get_settings()
    route = respx.post(f"{settings.agnes_base_url}/videos").mock(
        return_value=httpx.Response(
            200,
            json={"task_id": "task_k", "video_id": "video_k", "status": "queued"},
        )
    )
    provider = AgnesProvider(settings=settings)
    try:
        await provider.create_video_task(
            "smooth transition",
            mode="keyframes",
            image_urls=[
                "https://example.com/a.png",
                "https://example.com/b.png",
            ],
        )
        body = route.calls[0].request.content
        assert b"keyframes" in body
        assert b"https://example.com/a.png" in body
        assert b"https://example.com/b.png" in body
    finally:
        await provider.aclose()


@pytest.mark.asyncio
@respx.mock
async def test_create_video_task_error() -> None:
    settings = get_settings()
    respx.post(f"{settings.agnes_base_url}/videos").mock(
        return_value=httpx.Response(400, text="bad params")
    )
    provider = AgnesProvider(settings=settings)
    try:
        with pytest.raises(GenerationError) as exc:
            await provider.create_video_task("x", mode="t2v")
        assert "400" in exc.value.message
    finally:
        await provider.aclose()


@pytest.mark.asyncio
@respx.mock
async def test_get_video_result_completed() -> None:
    settings = get_settings()
    root = settings.agnes_base_url.rstrip("/")
    if root.endswith("/v1"):
        root = root[: -len("/v1")]
    route = respx.get(url__regex=rf"{root}/agnesapi\?video_id=video_xyz").mock(
        return_value=httpx.Response(
            200,
            json={
                "video_id": "video_xyz",
                "status": "completed",
                "progress": 100,
                "seconds": "5.0",
                "size": "1280x720",
                "metadata": {
                    "url": "https://cdn.example.com/out.mp4",
                },
            },
        )
    )
    provider = AgnesProvider(settings=settings)
    try:
        result = await provider.get_video_result("video_xyz")
        assert route.called
        assert "model_name=" in str(route.calls[0].request.url)
        assert result.status == "completed"
        assert result.progress == 100
        assert result.url == "https://cdn.example.com/out.mp4"
        assert result.seconds == 5.0
        assert result.size == "1280x720"
    finally:
        await provider.aclose()


@pytest.mark.asyncio
@respx.mock
async def test_get_video_result_remixed_from_video_id() -> None:
    """Live gateway often puts the mp4 URL in remixed_from_video_id."""
    settings = get_settings()
    root = settings.agnes_base_url.rstrip("/")
    if root.endswith("/v1"):
        root = root[: -len("/v1")]
    respx.get(url__regex=rf"{root}/agnesapi\?video_id=video_live").mock(
        return_value=httpx.Response(
            200,
            json={
                "video_id": "video_live",
                "status": "completed",
                "progress": 100,
                "remixed_from_video_id": "https://storage.googleapis.com/agnes/out.mp4",
                "error": None,
            },
        )
    )
    provider = AgnesProvider(settings=settings)
    try:
        result = await provider.get_video_result("video_live")
        assert result.url == "https://storage.googleapis.com/agnes/out.mp4"
    finally:
        await provider.aclose()


@pytest.mark.asyncio
@respx.mock
async def test_get_video_result_fallback_legacy() -> None:
    settings = get_settings()
    root = settings.agnes_base_url.rstrip("/")
    if root.endswith("/v1"):
        root = root[: -len("/v1")]
    respx.get(url__regex=rf"{root}/agnesapi\?video_id=video_fb").mock(
        return_value=httpx.Response(
            200,
            json={"video_id": "video_fb", "status": "completed", "progress": 100},
        )
    )
    respx.get(f"{settings.agnes_base_url}/videos/video_fb").mock(
        return_value=httpx.Response(
            200,
            json={
                "status": "completed",
                "progress": 100,
                "url": "https://cdn.example.com/legacy.mp4",
            },
        )
    )
    provider = AgnesProvider(settings=settings)
    try:
        result = await provider.get_video_result("video_fb")
        assert result.url == "https://cdn.example.com/legacy.mp4"
    finally:
        await provider.aclose()


@pytest.mark.asyncio
@respx.mock
async def test_get_video_result_failed() -> None:
    settings = get_settings()
    root = settings.agnes_base_url.rstrip("/")
    if root.endswith("/v1"):
        root = root[: -len("/v1")]
    respx.get(url__regex=rf"{root}/agnesapi\?video_id=video_fail").mock(
        return_value=httpx.Response(
            200,
            json={
                "status": "failed",
                "progress": 10,
                "error": {"message": "content policy"},
            },
        )
    )
    provider = AgnesProvider(settings=settings)
    try:
        result = await provider.get_video_result("video_fail")
        assert result.status == "failed"
        assert "content policy" in (result.error or "")
    finally:
        await provider.aclose()


@pytest.mark.asyncio
@respx.mock
async def test_download_video() -> None:
    settings = get_settings()
    content = b"fake-mp4-bytes"
    route = respx.get("https://cdn.example.com/out.mp4").mock(
        return_value=httpx.Response(200, content=content)
    )
    provider = AgnesProvider(settings=settings)
    try:
        data = await provider.download_video("https://cdn.example.com/out.mp4")
        assert data == content
        assert route.called
        # CDN downloads must not send the Agnes API Bearer token
        assert "Authorization" not in route.calls[0].request.headers
    finally:
        await provider.aclose()


@pytest.mark.asyncio
async def test_download_video_rejects_bad_url() -> None:
    provider = AgnesProvider(settings=get_settings())
    try:
        with pytest.raises(GenerationError, match="Invalid video URL"):
            await provider.download_video("not-a-url")
    finally:
        await provider.aclose()


@pytest.mark.asyncio
@respx.mock
async def test_improve_video_prompt() -> None:
    settings = get_settings()
    route = respx.post(f"{settings.agnes_base_url}/chat/completions").mock(
        return_value=httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": "A cinematic tracking shot of a dancer spinning under neon lights",
                        }
                    }
                ]
            },
        )
    )
    provider = AgnesProvider(settings=settings)
    try:
        text = await provider.improve_prompt("танцовщица крутится", kind="video")
        assert "dancer" in text.lower() or "cinematic" in text.lower()
        assert route.called
        body = route.calls[0].request.content
        assert b"Agnes Video" in body or b"video generation" in body
    finally:
        await provider.aclose()
