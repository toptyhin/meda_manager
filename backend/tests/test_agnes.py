import base64

import httpx
import pytest
import respx

from app.config import get_settings
from app.providers.agnes import AgnesProvider, _parse_review_json
from app.providers.base import GenerationError

TINY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


@pytest.mark.asyncio
@respx.mock
async def test_generate_b64() -> None:
    settings = get_settings()
    route = respx.post(f"{settings.agnes_base_url}/images/generations").mock(
        return_value=httpx.Response(
            200,
            json={
                "created": 1,
                "data": [{"url": None, "b64_json": base64.b64encode(TINY_PNG).decode(), "revised_prompt": None}],
            },
        )
    )
    provider = AgnesProvider(settings=settings)
    try:
        result = await provider.generate("a cat", images=[TINY_PNG], size="1K", ratio="1:1")
        assert result == TINY_PNG
        assert route.called
        body = route.calls[0].request.content
        assert b"agnes-image-2.1-flash" in body
        assert b"b64_json" in body
        assert b"data:image/png;base64," in body
    finally:
        await provider.aclose()


@pytest.mark.asyncio
@respx.mock
async def test_generate_error() -> None:
    settings = get_settings()
    respx.post(f"{settings.agnes_base_url}/images/generations").mock(
        return_value=httpx.Response(500, text="boom")
    )
    provider = AgnesProvider(settings=settings)
    try:
        with pytest.raises(GenerationError) as exc:
            await provider.generate("a cat", images=[], size="1K", ratio="1:1")
        assert "500" in exc.value.message
    finally:
        await provider.aclose()


@pytest.mark.asyncio
@respx.mock
async def test_improve_prompt() -> None:
    settings = get_settings()
    respx.post(f"{settings.agnes_base_url}/chat/completions").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "x",
                "choices": [
                    {
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": "A fashion portrait of a person wearing sunglasses and holding a bag, studio lighting, high detail",
                        },
                        "finish_reason": "stop",
                    }
                ],
            },
        )
    )
    provider = AgnesProvider(settings=settings)
    try:
        text = await provider.improve_prompt("человек в очках с сумкой", category="мода")
        assert "fashion" in text.lower() or "person" in text.lower() or "sunglasses" in text.lower()
    finally:
        await provider.aclose()


def test_parse_review_json_fenced() -> None:
    raw = """```json
{"score": 8, "passed": true, "issues": [], "fix_mode": "i2i", "fix_instructions": ""}
```"""
    obj = _parse_review_json(raw)
    assert obj["score"] == 8
    assert obj["passed"] is True


def test_parse_review_json_with_preamble() -> None:
    raw = 'Here is my review:\n{"score": 3, "passed": false, "issues": [], "fix_mode": "regen", "fix_instructions": "redo"}'
    obj = _parse_review_json(raw)
    assert obj["fix_mode"] == "regen"


@pytest.mark.asyncio
@respx.mock
async def test_review_image() -> None:
    settings = get_settings()
    route = respx.post(f"{settings.agnes_base_url}/chat/completions").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "r",
                "choices": [
                    {
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": (
                                '{"score": 6, "passed": false, '
                                '"issues": [{"type": "anatomy", "description": "bad hands", "severity": "major"}], '
                                '"fix_mode": "i2i", '
                                '"fix_instructions": "Fix hands, keep pose"}'
                            ),
                        },
                        "finish_reason": "stop",
                    }
                ],
            },
        )
    )
    provider = AgnesProvider(settings=settings)
    try:
        review = await provider.review_image(
            "a person waving",
            "https://example.com/api/media-ingress/1?exp=1&sig=abc",
        )
        assert review.score == 6
        assert review.passed is False
        assert review.fix_mode == "i2i"
        assert "hands" in review.fix_instructions.lower()
        assert route.called
        body = route.calls[0].request.content
        assert b"agnes-2.5-flash" in body
        assert b"image_url" in body
        assert b"https://example.com/api/media-ingress/1" in body
        assert b"data:image/" not in body
        assert b'"max_tokens": 4096' in body or b'"max_tokens":4096' in body
        assert b"enable_thinking" in body
        assert b"false" in body
    finally:
        await provider.aclose()


@pytest.mark.asyncio
@respx.mock
async def test_review_image_uses_reasoning_fallback() -> None:
    settings = get_settings()
    respx.post(f"{settings.agnes_base_url}/chat/completions").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "r",
                "choices": [
                    {
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": "",
                            "reasoning_content": (
                                '{"score": 8, "passed": true, "issues": [], '
                                '"fix_mode": "i2i", "fix_instructions": ""}'
                            ),
                        },
                        "finish_reason": "stop",
                    }
                ],
            },
        )
    )
    provider = AgnesProvider(settings=settings)
    try:
        review = await provider.review_image(
            "a cat",
            "https://example.com/img.png",
        )
        assert review.score == 8
        assert review.passed is True
    finally:
        await provider.aclose()


@pytest.mark.asyncio
async def test_review_image_rejects_data_uri() -> None:
    provider = AgnesProvider(settings=get_settings())
    try:
        with pytest.raises(GenerationError, match="publicly fetchable"):
            await provider.review_image("prompt", "data:image/png;base64,abc")
    finally:
        await provider.aclose()
