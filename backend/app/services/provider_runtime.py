"""Resolve provider credentials from DB (admin UI) with env fallback."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from sqlmodel.ext.asyncio.session import AsyncSession

from app.config import Settings, get_settings
from app.models import ProviderCredential, User, UserChatPreference, utcnow
from app.providers.base import ChatProvider, GenerationError, ModelCatalog
from app.providers.openai_compat import (
    AtlasCatalogNormalizer,
    CrazyRouterCatalogNormalizer,
    NordRouterCatalogNormalizer,
    OpenAICompatConfig,
    OpenAICompatibleProvider,
)
from app.providers.registry import (
    _PROVIDER_META,
    _CHAT_PROVIDERS,
    _cached_class,
    known_provider_ids,
)


@dataclass(frozen=True)
class ResolvedProvider:
    provider_id: str
    name: str
    api_key: str
    base_url: str
    chat_model: str
    enabled: bool
    key_source: str  # db | env | none
    capabilities: dict[str, Any]


def _env_defaults(provider_id: str, settings: Settings) -> tuple[str, str, str, bool]:
    """Return (api_key, base_url, chat_model, enabled_by_env)."""
    enabled = provider_id in set(settings.enabled_provider_list)
    if provider_id == "agnes":
        return (
            settings.agnes_api_key,
            settings.agnes_base_url,
            "agnes-2.5-flash",
            enabled,
        )
    if provider_id == "atlas":
        return (
            settings.atlas_api_key,
            settings.atlas_base_url,
            settings.atlas_chat_model,
            enabled,
        )
    if provider_id == "crazyrouter":
        return (
            settings.crazyrouter_api_key,
            settings.crazyrouter_base_url,
            settings.crazyrouter_chat_model,
            enabled,
        )
    if provider_id == "nordrouter":
        return (
            settings.nordrouter_api_key,
            settings.nordrouter_base_url,
            settings.nordrouter_chat_model,
            enabled,
        )
    return "", "", "", False


def mask_api_key(api_key: str) -> Optional[str]:
    if not api_key:
        return None
    if len(api_key) <= 8:
        return "*" * len(api_key)
    return f"{api_key[:3]}…{api_key[-4:]}"


async def get_credential(
    session: AsyncSession, provider_id: str
) -> Optional[ProviderCredential]:
    return await session.get(ProviderCredential, provider_id)


async def resolve_provider(
    session: AsyncSession,
    provider_id: str,
    settings: Optional[Settings] = None,
) -> ResolvedProvider:
    settings = settings or get_settings()
    provider_id = provider_id.strip().lower()
    meta = _PROVIDER_META.get(provider_id)
    if meta is None or provider_id not in _CHAT_PROVIDERS:
        raise GenerationError(f"Unknown provider: {provider_id}", status_code=404)

    env_key, env_base, env_model, env_enabled = _env_defaults(provider_id, settings)
    row = await get_credential(session, provider_id)

    if row is not None:
        api_key = row.api_key if row.api_key else env_key
        key_source = "db" if row.api_key else ("env" if env_key else "none")
        base_url = (row.base_url or "").strip() or env_base
        chat_model = (row.chat_model or "").strip() or env_model
        enabled = bool(row.enabled)
    else:
        api_key = env_key
        key_source = "env" if env_key else "none"
        base_url = env_base
        chat_model = env_model
        enabled = env_enabled

    return ResolvedProvider(
        provider_id=provider_id,
        name=meta["name"],
        api_key=api_key,
        base_url=base_url,
        chat_model=chat_model,
        enabled=enabled,
        key_source=key_source,
        capabilities=dict(meta["capabilities"]),
    )


async def list_resolved_providers(
    session: AsyncSession,
    *,
    only_enabled: bool = False,
    settings: Optional[Settings] = None,
) -> list[ResolvedProvider]:
    settings = settings or get_settings()
    out: list[ResolvedProvider] = []
    for provider_id in known_provider_ids():
        resolved = await resolve_provider(session, provider_id, settings=settings)
        if only_enabled and not resolved.enabled:
            continue
        out.append(resolved)
    return out


def _normalizer_for(provider_id: str):
    if provider_id == "atlas":
        return AtlasCatalogNormalizer()
    if provider_id == "crazyrouter":
        return CrazyRouterCatalogNormalizer()
    if provider_id == "nordrouter":
        return NordRouterCatalogNormalizer()
    raise GenerationError(f"No OpenAI normalizer for {provider_id}", status_code=400)


def build_chat_provider(
    resolved: ResolvedProvider,
    *,
    model: Optional[str] = None,
    settings: Optional[Settings] = None,
) -> ChatProvider:
    settings = settings or get_settings()
    if not resolved.enabled:
        raise GenerationError(
            f"Provider {resolved.provider_id} is not enabled",
            status_code=400,
        )
    if not resolved.api_key:
        raise GenerationError(
            f"{resolved.provider_id} API key is not configured",
            status_code=503,
        )

    chat_model = (model or resolved.chat_model).strip()
    if resolved.provider_id == "agnes":
        overlay = settings.model_copy(
            update={
                "agnes_api_key": resolved.api_key,
                "agnes_base_url": resolved.base_url,
            }
        )
        cls = _cached_class(_CHAT_PROVIDERS["agnes"])
        return cls(settings=overlay)

    config = OpenAICompatConfig(
        provider_id=resolved.provider_id,
        base_url=resolved.base_url,
        api_key=resolved.api_key,
        default_model=chat_model,
        normalizer=_normalizer_for(resolved.provider_id),
    )
    return OpenAICompatibleProvider(config, settings=settings)


def build_model_catalog(
    resolved: ResolvedProvider,
    *,
    settings: Optional[Settings] = None,
) -> ModelCatalog:
    settings = settings or get_settings()
    if not resolved.enabled:
        raise GenerationError(
            f"Provider {resolved.provider_id} is not enabled",
            status_code=400,
        )
    if resolved.provider_id == "agnes":
        # Static catalog — key optional.
        overlay = settings.model_copy(
            update={
                "agnes_api_key": resolved.api_key,
                "agnes_base_url": resolved.base_url,
            }
        )
        cls = _cached_class(_CHAT_PROVIDERS["agnes"])
        return cls(settings=overlay)

    if not resolved.api_key:
        raise GenerationError(
            f"{resolved.provider_id} API key is not configured",
            status_code=503,
        )
    config = OpenAICompatConfig(
        provider_id=resolved.provider_id,
        base_url=resolved.base_url,
        api_key=resolved.api_key,
        default_model=resolved.chat_model,
        normalizer=_normalizer_for(resolved.provider_id),
    )
    return OpenAICompatibleProvider(config, settings=settings)


async def get_user_chat_preference(
    session: AsyncSession, user_id: int
) -> Optional[UserChatPreference]:
    return await session.get(UserChatPreference, user_id)


async def set_user_chat_preference(
    session: AsyncSession,
    user_id: int,
    provider: str,
    model: str,
) -> UserChatPreference:
    provider = provider.strip().lower()
    model = model.strip()
    if not model:
        raise GenerationError("model is required", status_code=400)
    resolved = await resolve_provider(session, provider)
    if not resolved.enabled:
        raise GenerationError(f"Provider {provider} is not enabled", status_code=400)
    if not resolved.api_key:
        raise GenerationError(
            f"Provider {provider} has no API key configured",
            status_code=400,
        )

    row = await session.get(UserChatPreference, user_id)
    if row is None:
        row = UserChatPreference(user_id=user_id, provider=provider, model=model)
        session.add(row)
    else:
        row.provider = provider
        row.model = model
        row.updated_at = utcnow()
        session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


async def resolve_chat_selection(
    session: AsyncSession,
    user: Optional[User] = None,
    settings: Optional[Settings] = None,
) -> tuple[ResolvedProvider, str]:
    """Return (provider, model_id) for assistant chat calls."""
    settings = settings or get_settings()
    if user is not None:
        pref = await get_user_chat_preference(session, user.id)  # type: ignore[arg-type]
        if pref is not None:
            resolved = await resolve_provider(session, pref.provider, settings=settings)
            if resolved.enabled and resolved.api_key:
                return resolved, pref.model

    # Fallback: first enabled+configured provider, preferring default_chat_provider.
    preferred = settings.default_chat_provider.strip().lower()
    candidates = await list_resolved_providers(session, only_enabled=True, settings=settings)
    ordered = sorted(
        candidates,
        key=lambda r: (0 if r.provider_id == preferred else 1, r.provider_id),
    )
    for resolved in ordered:
        if resolved.api_key:
            return resolved, resolved.chat_model

    raise GenerationError(
        "No chat provider is enabled and configured",
        status_code=503,
    )


async def get_chat_provider_for_user(
    session: AsyncSession,
    user: Optional[User] = None,
    settings: Optional[Settings] = None,
) -> ChatProvider:
    resolved, model = await resolve_chat_selection(session, user=user, settings=settings)
    return build_chat_provider(resolved, model=model, settings=settings)


async def upsert_credential(
    session: AsyncSession,
    provider_id: str,
    *,
    api_key: Optional[str] = None,
    clear_api_key: bool = False,
    enabled: Optional[bool] = None,
    base_url: Optional[str] = None,
    clear_base_url: bool = False,
    chat_model: Optional[str] = None,
    clear_chat_model: bool = False,
) -> ProviderCredential:
    provider_id = provider_id.strip().lower()
    if provider_id not in _CHAT_PROVIDERS:
        raise GenerationError(f"Unknown provider: {provider_id}", status_code=404)

    row = await session.get(ProviderCredential, provider_id)
    if row is None:
        env_key, env_base, env_model, env_enabled = _env_defaults(
            provider_id, get_settings()
        )
        row = ProviderCredential(
            provider=provider_id,
            api_key="",
            enabled=env_enabled if enabled is None else enabled,
            base_url=None,
            chat_model=None,
        )
        # Preserve env defaults visually by not copying secrets into DB until set.
        _ = (env_key, env_base, env_model)
        session.add(row)

    if clear_api_key:
        row.api_key = ""
    elif api_key is not None:
        row.api_key = api_key.strip()

    if enabled is not None:
        row.enabled = enabled

    if clear_base_url:
        row.base_url = None
    elif base_url is not None:
        cleaned = base_url.strip()
        row.base_url = cleaned or None

    if clear_chat_model:
        row.chat_model = None
    elif chat_model is not None:
        cleaned = chat_model.strip()
        row.chat_model = cleaned or None

    row.updated_at = utcnow()
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


async def build_agnes_settings(session: AsyncSession) -> Settings:
    """Settings overlay with Agnes credentials resolved from DB/env."""
    settings = get_settings()
    resolved = await resolve_provider(session, "agnes", settings=settings)
    return settings.model_copy(
        update={
            "agnes_api_key": resolved.api_key,
            "agnes_base_url": resolved.base_url,
        }
    )
