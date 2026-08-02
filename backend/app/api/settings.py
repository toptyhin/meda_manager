from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel.ext.asyncio.session import AsyncSession

from app.auth import get_admin_user
from app.db import get_session
from app.models import User
from app.providers.base import GenerationError
from app.schemas import ProviderCapabilitiesOut, ProviderSettingsOut, ProviderSettingsUpdate
from app.services.provider_runtime import (
    list_resolved_providers,
    mask_api_key,
    resolve_provider,
    upsert_credential,
)

router = APIRouter()


def _to_out(resolved) -> ProviderSettingsOut:
    return ProviderSettingsOut(
        id=resolved.provider_id,
        name=resolved.name,
        enabled=resolved.enabled,
        configured=bool(resolved.api_key),
        key_source=resolved.key_source,
        api_key_masked=mask_api_key(resolved.api_key),
        base_url=resolved.base_url,
        chat_model=resolved.chat_model,
        capabilities=ProviderCapabilitiesOut(**resolved.capabilities),
    )


@router.get("/providers", response_model=list[ProviderSettingsOut])
async def list_provider_settings(
    admin: Annotated[User, Depends(get_admin_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[ProviderSettingsOut]:
    _ = admin
    items = await list_resolved_providers(session, only_enabled=False)
    return [_to_out(item) for item in items]


@router.patch("/providers/{provider_id}", response_model=ProviderSettingsOut)
async def update_provider_settings(
    provider_id: str,
    body: ProviderSettingsUpdate,
    admin: Annotated[User, Depends(get_admin_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProviderSettingsOut:
    _ = admin
    try:
        await upsert_credential(
            session,
            provider_id,
            api_key=body.api_key,
            clear_api_key=body.clear_api_key,
            enabled=body.enabled,
            base_url=body.base_url,
            clear_base_url=body.clear_base_url,
            chat_model=body.chat_model,
            clear_chat_model=body.clear_chat_model,
        )
        resolved = await resolve_provider(session, provider_id)
    except GenerationError as exc:
        status = exc.status_code or 400
        raise HTTPException(status_code=status, detail=exc.message) from exc
    return _to_out(resolved)
