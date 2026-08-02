import httpx
import pytest
import respx
from httpx import AsyncClient
from sqlmodel import select

from app.config import get_settings
from app.db import async_session_factory
from app.models import ProviderCredential, User


@pytest.mark.asyncio
async def test_settings_providers_admin_only(auth_client: AsyncClient) -> None:
    # First registered user is admin
    resp = await auth_client.get("/api/settings/providers")
    assert resp.status_code == 200
    ids = {p["id"] for p in resp.json()}
    assert "agnes" in ids
    assert "atlas" in ids

    # demote to non-admin
    async with async_session_factory() as session:
        result = await session.exec(select(User).where(User.username == "alice"))
        user = result.first()
        assert user is not None
        user.is_admin = False
        session.add(user)
        await session.commit()

    resp = await auth_client.get("/api/settings/providers")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_settings_update_key_and_enable(auth_client: AsyncClient) -> None:
    resp = await auth_client.patch(
        "/api/settings/providers/atlas",
        json={
            "api_key": "sk-atlas-from-ui",
            "enabled": True,
            "chat_model": "deepseek-ai/DeepSeek-V3.1",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"] == "atlas"
    assert body["enabled"] is True
    assert body["configured"] is True
    assert body["key_source"] == "db"
    assert body["api_key_masked"] is not None
    assert "sk-" in body["api_key_masked"] or "…" in body["api_key_masked"]
    assert "sk-atlas-from-ui" not in body["api_key_masked"]

    async with async_session_factory() as session:
        row = await session.get(ProviderCredential, "atlas")
        assert row is not None
        assert row.api_key == "sk-atlas-from-ui"
        assert row.enabled is True


@pytest.mark.asyncio
@respx.mock
async def test_chat_model_preference_flow(auth_client: AsyncClient) -> None:
    settings = get_settings()
    # Enable atlas via settings API
    resp = await auth_client.patch(
        "/api/settings/providers/atlas",
        json={"api_key": "sk-atlas-pref", "enabled": True},
    )
    assert resp.status_code == 200, resp.text

    respx.get(f"{settings.atlas_base_url.rstrip('/')}/models").mock(
        return_value=httpx.Response(
            200,
            json={
                "data": [
                    {
                        "id": "deepseek-ai/DeepSeek-V3.1",
                        "context_length": 131072,
                        "input_modalities": ["text"],
                        "output_modalities": ["text"],
                    }
                ]
            },
        )
    )

    pref = await auth_client.put(
        "/api/providers/me/chat-model",
        json={"provider": "atlas", "model": "deepseek-ai/DeepSeek-V3.1"},
    )
    assert pref.status_code == 200, pref.text
    assert pref.json()["provider"] == "atlas"
    assert pref.json()["model"] == "deepseek-ai/DeepSeek-V3.1"
    assert pref.json()["source"] == "user"

    got = await auth_client.get("/api/providers/me/chat-model")
    assert got.status_code == 200
    assert got.json()["model"] == "deepseek-ai/DeepSeek-V3.1"


@pytest.mark.asyncio
async def test_clear_db_key_falls_back_to_env(
    auth_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "atlas_api_key", "sk-env-atlas")
    await auth_client.patch(
        "/api/settings/providers/atlas",
        json={"api_key": "sk-db-atlas", "enabled": True},
    )
    resp = await auth_client.patch(
        "/api/settings/providers/atlas",
        json={"clear_api_key": True},
    )
    assert resp.status_code == 200
    assert resp.json()["key_source"] == "env"
    assert resp.json()["configured"] is True
