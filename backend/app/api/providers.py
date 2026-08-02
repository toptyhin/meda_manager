from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel.ext.asyncio.session import AsyncSession

from app.auth import get_current_user
from app.db import get_session
from app.models import User
from app.providers.base import GenerationError
from app.schemas import (
    ChatModelPreferenceOut,
    ChatModelPreferenceUpdate,
    ModelInfoOut,
    ModelPricingOut,
    ProviderCapabilitiesOut,
    ProviderModelsResponse,
    ProviderOut,
)
from app.services.catalog import get_catalog
from app.services.provider_runtime import (
    get_user_chat_preference,
    list_resolved_providers,
    resolve_chat_selection,
    set_user_chat_preference,
)

router = APIRouter()


@router.get("", response_model=list[ProviderOut])
async def list_providers(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[ProviderOut]:
    _ = user
    items = await list_resolved_providers(session, only_enabled=True)
    preferred = None
    try:
        preferred_resolved, _ = await resolve_chat_selection(session, user=None)
        preferred = preferred_resolved.provider_id
    except GenerationError:
        preferred = None

    return [
        ProviderOut(
            id=item.provider_id,
            name=item.name,
            capabilities=ProviderCapabilitiesOut(**item.capabilities),
            configured=bool(item.api_key),
            is_default_chat=item.provider_id == preferred,
        )
        for item in items
    ]


@router.get("/me/chat-model", response_model=ChatModelPreferenceOut)
async def get_my_chat_model(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ChatModelPreferenceOut:
    pref = await get_user_chat_preference(session, user.id)  # type: ignore[arg-type]
    if pref is not None:
        return ChatModelPreferenceOut(
            provider=pref.provider, model=pref.model, source="user"
        )
    try:
        resolved, model = await resolve_chat_selection(session, user=None)
    except GenerationError as exc:
        status = exc.status_code or 503
        raise HTTPException(status_code=status, detail=exc.message) from exc
    return ChatModelPreferenceOut(
        provider=resolved.provider_id, model=model, source="default"
    )


@router.put("/me/chat-model", response_model=ChatModelPreferenceOut)
async def put_my_chat_model(
    body: ChatModelPreferenceUpdate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ChatModelPreferenceOut:
    try:
        pref = await set_user_chat_preference(
            session,
            user.id,  # type: ignore[arg-type]
            body.provider,
            body.model,
        )
    except GenerationError as exc:
        status = exc.status_code or 400
        raise HTTPException(status_code=status, detail=exc.message) from exc
    return ChatModelPreferenceOut(
        provider=pref.provider, model=pref.model, source="user"
    )


@router.get("/{provider_id}/models", response_model=ProviderModelsResponse)
async def list_provider_models(
    provider_id: str,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    kind: Optional[str] = Query(default=None),
    refresh: bool = Query(default=False),
) -> ProviderModelsResponse:
    _ = user
    try:
        result = await get_catalog(
            session,
            provider_id,
            force_refresh=refresh,
            kind=kind,
        )
    except GenerationError as exc:
        status = exc.status_code or 502
        if status < 400:
            status = 502
        raise HTTPException(status_code=status, detail=exc.message) from exc

    items = [
        ModelInfoOut(
            id=m.id,
            provider=m.provider,
            kind=m.kind,
            context_length=m.context_length,
            max_output_length=m.max_output_length,
            input_modalities=m.input_modalities,
            output_modalities=m.output_modalities,
            pricing=(
                ModelPricingOut(
                    prompt_per_1m=m.pricing.prompt_per_1m,
                    completion_per_1m=m.pricing.completion_per_1m,
                    image=m.pricing.image,
                    request=m.pricing.request,
                    input_cache_read_per_1m=m.pricing.input_cache_read_per_1m,
                    unit=m.pricing.unit,
                )
                if m.pricing
                else None
            ),
        )
        for m in result.models
    ]
    return ProviderModelsResponse(
        provider=provider_id.strip().lower(),
        items=items,
        cached=result.cached,
        fetched_at=result.fetched_at,
        expires_at=result.expires_at,
    )
