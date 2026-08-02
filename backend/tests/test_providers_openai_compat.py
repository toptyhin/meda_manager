import httpx
import pytest
import respx

from app.config import Settings
from app.providers.base import GenerationError
from app.providers.openai_compat import (
    AtlasCatalogNormalizer,
    AtlasProvider,
    CrazyRouterCatalogNormalizer,
    CrazyRouterProvider,
    NordRouterProvider,
)


def test_atlas_normalizer_pricing_and_context() -> None:
    payload = {
        "code": 200,
        "msg": "succeed",
        "data": [
            {
                "id": "deepseek-ai/DeepSeek-V3.1",
                "context_length": 131072,
                "max_output_length": 8192,
                "input_modalities": ["text"],
                "output_modalities": ["text"],
                "pricing": {
                    "prompt": "0.0000003",
                    "completion": "0.00000095",
                    "image": "0",
                    "request": "0",
                    "input_cache_read": "0.00000013",
                },
            }
        ],
    }
    models = AtlasCatalogNormalizer().normalize("atlas", payload)
    assert len(models) == 1
    m = models[0]
    assert m.id == "deepseek-ai/DeepSeek-V3.1"
    assert m.kind == "chat"
    assert m.context_length == 131072
    assert m.max_output_length == 8192
    assert m.pricing is not None
    assert m.pricing.prompt_per_1m == pytest.approx(0.3)
    assert m.pricing.completion_per_1m == pytest.approx(0.95)
    assert m.pricing.input_cache_read_per_1m == pytest.approx(0.13)
    assert m.pricing.unit == "token"


def test_crazyrouter_normalizer_minimal_schema() -> None:
    payload = {
        "success": True,
        "object": "list",
        "data": [
            {
                "id": "gpt-5.5",
                "object": "model",
                "created": 1700000000,
                "owned_by": "openai",
            }
        ],
    }
    models = CrazyRouterCatalogNormalizer().normalize("crazyrouter", payload)
    assert len(models) == 1
    assert models[0].id == "gpt-5.5"
    assert models[0].kind == "chat"
    assert models[0].pricing is None
    assert models[0].context_length is None


@pytest.mark.asyncio
@respx.mock
async def test_atlas_list_models_http() -> None:
    settings = Settings(
        atlas_api_key="sk-atlas-test",
        atlas_base_url="https://api.atlascloud.ai/v1",
    )
    respx.get("https://api.atlascloud.ai/v1/models").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "id": "Qwen/Qwen3-235B",
                        "context_length": 131072,
                        "pricing": {"prompt": "0.0000002", "completion": "0.00000088"},
                        "input_modalities": ["text"],
                        "output_modalities": ["text"],
                    }
                ]
            },
        )
    )
    provider = AtlasProvider(settings=settings)
    try:
        models = await provider.list_models()
    finally:
        await provider.aclose()
    assert models[0].id == "Qwen/Qwen3-235B"
    assert models[0].pricing is not None
    assert models[0].pricing.prompt_per_1m == pytest.approx(0.2)


@pytest.mark.asyncio
@respx.mock
async def test_nordrouter_improve_prompt() -> None:
    settings = Settings(
        nordrouter_api_key="sk-nr-test",
        nordrouter_base_url="https://nordrouter.com/v1",
        nordrouter_chat_model="anthropic/claude-sonnet-4.6",
    )
    route = respx.post("https://nordrouter.com/v1/chat/completions").mock(
        return_value=httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {"content": "A cinematic portrait of a fox at dusk"},
                        "finish_reason": "stop",
                    }
                ]
            },
        )
    )
    provider = NordRouterProvider(settings=settings)
    try:
        improved = await provider.improve_prompt("fox dusk", system="Improve this.")
    finally:
        await provider.aclose()
    assert "fox" in improved.lower()
    assert route.called
    body = route.calls[0].request.content
    assert b"anthropic/claude-sonnet-4.6" in body


@pytest.mark.asyncio
@respx.mock
async def test_crazyrouter_missing_key() -> None:
    settings = Settings(crazyrouter_api_key="")
    provider = CrazyRouterProvider(settings=settings)
    with pytest.raises(GenerationError, match="API key is not configured"):
        await provider.list_models()
    await provider.aclose()
