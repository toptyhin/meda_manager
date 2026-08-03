"""Provider model catalog with SQLite TTL cache."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.config import Settings, get_settings
from app.models import ProviderModelCache
from app.providers.base import GenerationError, ModelInfo
from app.services.provider_runtime import build_model_catalog, resolve_provider

logger = logging.getLogger(__name__)


@dataclass
class CatalogResult:
    models: list[ModelInfo]
    cached: bool
    fetched_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None


def _utcnow() -> datetime:
    # Naive UTC — matches SQLAlchemy DateTime (TIMESTAMP WITHOUT TIME ZONE) and
    # keeps asyncpg happy; see models.utcnow.
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _as_utc(dt: datetime) -> datetime:
    # Normalize to naive UTC; SQLite/fromisoformat reads may be aware or naive
    # depending on how the row was written.
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def _serialize_models(models: list[ModelInfo]) -> str:
    return json.dumps([m.to_dict() for m in models], separators=(",", ":"))


def _deserialize_models(payload: str) -> list[ModelInfo]:
    data = json.loads(payload)
    if not isinstance(data, list):
        return []
    return [ModelInfo.from_dict(item) for item in data if isinstance(item, dict)]


def _filter_kind(models: list[ModelInfo], kind: Optional[str]) -> list[ModelInfo]:
    if not kind:
        return models
    return [m for m in models if m.kind == kind]


async def _evict_expired(session: AsyncSession, now: datetime) -> None:
    result = await session.exec(
        select(ProviderModelCache).where(ProviderModelCache.expires_at < now)
    )
    for row in result.all():
        await session.delete(row)


async def get_catalog(
    session: AsyncSession,
    provider_id: str,
    *,
    force_refresh: bool = False,
    kind: Optional[str] = None,
    settings: Optional[Settings] = None,
) -> CatalogResult:
    settings = settings or get_settings()
    provider_id = provider_id.strip().lower()

    resolved = await resolve_provider(session, provider_id, settings=settings)
    if not resolved.enabled:
        raise GenerationError(f"Provider {provider_id} is not enabled", status_code=400)
    if provider_id != "agnes" and not resolved.api_key:
        raise GenerationError(
            f"Provider {provider_id} has no API key configured",
            status_code=503,
        )

    now = _utcnow()
    if not force_refresh:
        cached = await session.get(ProviderModelCache, provider_id)
        if cached is not None and _as_utc(cached.expires_at) > now:
            models = _filter_kind(_deserialize_models(cached.payload), kind)
            return CatalogResult(
                models=models,
                cached=True,
                fetched_at=cached.fetched_at,
                expires_at=cached.expires_at,
            )

    catalog = build_model_catalog(resolved, settings=settings)
    try:
        models = await catalog.list_models()
    finally:
        await catalog.aclose()

    ttl = max(60, int(settings.model_catalog_ttl_seconds))
    await _evict_expired(session, now)
    existing = await session.get(ProviderModelCache, provider_id)
    if existing is None:
        existing = ProviderModelCache(provider=provider_id, payload="")
        session.add(existing)
    existing.payload = _serialize_models(models)
    existing.fetched_at = now
    existing.expires_at = now + timedelta(seconds=ttl)
    session.add(existing)
    await session.commit()
    await session.refresh(existing)

    return CatalogResult(
        models=_filter_kind(models, kind),
        cached=False,
        fetched_at=existing.fetched_at,
        expires_at=existing.expires_at,
    )
