"""Lazy provider registry — imports modules only when a provider is first used."""

from __future__ import annotations

import importlib
import logging
from functools import lru_cache
from typing import Any, Optional

from app.config import Settings, get_settings
from app.providers.base import ChatProvider, GenerationError, ModelCatalog

logger = logging.getLogger(__name__)

# provider_id -> "module.path:ClassName"
_CHAT_PROVIDERS: dict[str, str] = {
    "agnes": "app.providers.agnes:AgnesProvider",
    "atlas": "app.providers.openai_compat:AtlasProvider",
    "crazyrouter": "app.providers.openai_compat:CrazyRouterProvider",
    "nordrouter": "app.providers.openai_compat:NordRouterProvider",
}

# Capabilities advertised by /api/providers (media stays Agnes-only in iteration 1).
_PROVIDER_META: dict[str, dict[str, Any]] = {
    "agnes": {
        "name": "Agnes",
        "capabilities": {"chat": True, "image": True, "video": True, "catalog": True},
    },
    "atlas": {
        "name": "Atlas Cloud",
        "capabilities": {"chat": True, "image": False, "video": False, "catalog": True},
    },
    "crazyrouter": {
        "name": "CrazyRouter",
        "capabilities": {"chat": True, "image": False, "video": False, "catalog": True},
    },
    "nordrouter": {
        "name": "NordRouter",
        "capabilities": {"chat": True, "image": False, "video": False, "catalog": True},
    },
}


def _lazy_import(path: str) -> type:
    module_path, class_name = path.split(":")
    module = importlib.import_module(module_path)
    return getattr(module, class_name)


@lru_cache(maxsize=16)
def _cached_class(path: str) -> type:
    return _lazy_import(path)


def known_provider_ids() -> list[str]:
    return list(_CHAT_PROVIDERS.keys())


def provider_has_api_key(provider_id: str, settings: Settings) -> bool:
    if provider_id == "agnes":
        return bool(settings.agnes_api_key)
    if provider_id == "atlas":
        return bool(settings.atlas_api_key)
    if provider_id == "crazyrouter":
        return bool(settings.crazyrouter_api_key)
    if provider_id == "nordrouter":
        return bool(settings.nordrouter_api_key)
    return False


def list_enabled_providers(settings: Optional[Settings] = None) -> list[dict[str, Any]]:
    settings = settings or get_settings()
    enabled = set(settings.enabled_provider_list)
    out: list[dict[str, Any]] = []
    for provider_id, meta in _PROVIDER_META.items():
        if provider_id not in enabled:
            continue
        if provider_id not in _CHAT_PROVIDERS:
            continue
        out.append(
            {
                "id": provider_id,
                "name": meta["name"],
                "capabilities": meta["capabilities"],
                "configured": provider_has_api_key(provider_id, settings),
                "is_default_chat": provider_id == settings.default_chat_provider,
            }
        )
    return out


def _resolve_provider_id(name: Optional[str], settings: Settings) -> str:
    provider_id = (name or settings.default_chat_provider).strip().lower()
    if provider_id not in _CHAT_PROVIDERS:
        raise GenerationError(f"Unknown chat provider: {provider_id}", status_code=400)
    enabled = set(settings.enabled_provider_list)
    if provider_id not in enabled:
        raise GenerationError(
            f"Provider {provider_id} is not enabled",
            status_code=400,
        )
    return provider_id


def get_chat_provider(
    name: Optional[str] = None,
    settings: Optional[Settings] = None,
) -> ChatProvider:
    settings = settings or get_settings()
    provider_id = _resolve_provider_id(name, settings)
    cls = _cached_class(_CHAT_PROVIDERS[provider_id])
    return cls(settings=settings)


def get_model_catalog(
    name: Optional[str] = None,
    settings: Optional[Settings] = None,
) -> ModelCatalog:
    """Catalog providers share the same classes as chat providers in iteration 1."""
    settings = settings or get_settings()
    provider_id = _resolve_provider_id(name, settings)
    cls = _cached_class(_CHAT_PROVIDERS[provider_id])
    return cls(settings=settings)
