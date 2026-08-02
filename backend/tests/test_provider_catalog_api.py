from datetime import datetime, timedelta, timezone

import httpx
import pytest
import respx
from httpx import AsyncClient
from app.config import get_settings
from app.db import async_session_factory
from app.models import ProviderModelCache
from app.providers.registry import _cached_class


@pytest.fixture
def enable_atlas(monkeypatch: pytest.MonkeyPatch):
    # Patch the live Settings singleton — do not cache_clear(), otherwise
    # modules that bound `settings = get_settings()` at import (e.g. videos.py)
    # keep a stale object and other tests flake.
    settings = get_settings()
    monkeypatch.setattr(settings, "enabled_providers", "agnes,atlas")
    monkeypatch.setattr(settings, "default_chat_provider", "agnes")
    monkeypatch.setattr(settings, "atlas_api_key", "sk-atlas-test")
    monkeypatch.setattr(settings, "atlas_base_url", "https://api.atlascloud.ai/v1")
    _cached_class.cache_clear()
    yield
    _cached_class.cache_clear()


@pytest.mark.asyncio
async def test_list_providers_default(auth_client: AsyncClient) -> None:
    resp = await auth_client.get("/api/providers")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert len(data) == 1
    assert data[0]["id"] == "agnes"
    assert data[0]["capabilities"]["chat"] is True
    assert data[0]["capabilities"]["image"] is True
    assert data[0]["configured"] is True
    assert data[0]["is_default_chat"] is True


@pytest.mark.asyncio
async def test_agnes_models_static_catalog(auth_client: AsyncClient) -> None:
    resp = await auth_client.get("/api/providers/agnes/models")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["provider"] == "agnes"
    ids = {m["id"] for m in body["items"]}
    assert "agnes-2.5-flash" in ids
    assert "agnes-image-2.1-flash" in ids
    kinds = {m["kind"] for m in body["items"]}
    assert "chat" in kinds
    assert "image" in kinds
    assert "video" in kinds


@pytest.mark.asyncio
async def test_disabled_provider_models(auth_client: AsyncClient) -> None:
    resp = await auth_client.get("/api/providers/atlas/models")
    assert resp.status_code == 400
    assert "not enabled" in resp.json()["detail"].lower()


@pytest.mark.asyncio
@respx.mock
async def test_atlas_models_cache_hit_and_refresh(
    auth_client: AsyncClient,
    enable_atlas,
) -> None:
    route = respx.get("https://api.atlascloud.ai/v1/models").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "id": "deepseek-ai/DeepSeek-V3.1",
                        "context_length": 131072,
                        "pricing": {
                            "prompt": "0.0000003",
                            "completion": "0.00000095",
                        },
                        "input_modalities": ["text"],
                        "output_modalities": ["text"],
                    }
                ]
            },
        )
    )

    first = await auth_client.get("/api/providers/atlas/models?kind=chat")
    assert first.status_code == 200, first.text
    assert first.json()["cached"] is False
    assert first.json()["items"][0]["id"] == "deepseek-ai/DeepSeek-V3.1"
    assert first.json()["items"][0]["context_length"] == 131072
    assert first.json()["items"][0]["pricing"]["prompt_per_1m"] == pytest.approx(0.3)
    assert route.call_count == 1

    second = await auth_client.get("/api/providers/atlas/models?kind=chat")
    assert second.status_code == 200, second.text
    assert second.json()["cached"] is True
    assert route.call_count == 1

    third = await auth_client.get("/api/providers/atlas/models?refresh=true")
    assert third.status_code == 200, third.text
    assert third.json()["cached"] is False
    assert route.call_count == 2


@pytest.mark.asyncio
@respx.mock
async def test_atlas_ttl_expiry_refetches(
    auth_client: AsyncClient,
    enable_atlas,
) -> None:
    respx.get("https://api.atlascloud.ai/v1/models").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "id": "model-a",
                        "input_modalities": ["text"],
                        "output_modalities": ["text"],
                    }
                ]
            },
        )
    )
    resp = await auth_client.get("/api/providers/atlas/models")
    assert resp.status_code == 200

    # Expire cache row manually.
    async with async_session_factory() as session:
        row = await session.get(ProviderModelCache, "atlas")
        assert row is not None
        row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        session.add(row)
        await session.commit()

    respx.get("https://api.atlascloud.ai/v1/models").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "id": "model-b",
                        "input_modalities": ["text"],
                        "output_modalities": ["text"],
                    }
                ]
            },
        )
    )
    resp2 = await auth_client.get("/api/providers/atlas/models")
    assert resp2.status_code == 200
    assert resp2.json()["cached"] is False
    assert resp2.json()["items"][0]["id"] == "model-b"


@pytest.mark.asyncio
async def test_list_providers_includes_atlas_when_enabled(
    auth_client: AsyncClient,
    enable_atlas,
) -> None:
    resp = await auth_client.get("/api/providers")
    assert resp.status_code == 200
    ids = {p["id"] for p in resp.json()}
    assert ids == {"agnes", "atlas"}
    atlas = next(p for p in resp.json() if p["id"] == "atlas")
    assert atlas["configured"] is True
    assert atlas["capabilities"]["image"] is False


@pytest.mark.asyncio
@respx.mock
async def test_atlas_models_missing_key_error(
    auth_client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "enabled_providers", "atlas")
    monkeypatch.setattr(settings, "atlas_api_key", "")
    monkeypatch.setattr(settings, "default_chat_provider", "atlas")
    _cached_class.cache_clear()
    resp = await auth_client.get("/api/providers/atlas/models")
    assert resp.status_code in (502, 503)
    assert "api key" in resp.json()["detail"].lower()
