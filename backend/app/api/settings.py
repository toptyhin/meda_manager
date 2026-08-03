from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.auth import get_admin_user
from app.db import get_session
from app.models import AppPromptKind, AppPromptTemplate, PromptGenIntent, User
from app.providers.base import GenerationError
from app.schemas import (
    AppPromptTemplateOut,
    AppPromptTemplateRestore,
    AppPromptTemplateUpdate,
    AppPromptTemplateVersionOut,
    PromptGenIntentCreate,
    PromptGenIntentOut,
    PromptGenIntentUpdate,
    PromptGenPreviewRequest,
    ProviderCapabilitiesOut,
    ProviderSettingsOut,
    ProviderSettingsUpdate,
    SuggestPromptResponse,
)
from app.services import prompt_gen
from app.services.provider_runtime import (
    get_chat_provider_for_user,
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


# --- Prompt-generation template («Придумай промпт») ---


def _template_out(
    text: str,
    version: int | None,
    versions: list[AppPromptTemplate],
    updated_at=None,
) -> AppPromptTemplateOut:
    return AppPromptTemplateOut(
        kind=AppPromptKind.prompt_gen.value,
        text=text,
        version=version,
        is_default=version is None,
        default_text=prompt_gen.DEFAULT_PROMPT_GEN_TEMPLATE,
        updated_at=updated_at,
        versions=[AppPromptTemplateVersionOut.model_validate(v) for v in versions],
    )


@router.get("/prompt-template", response_model=AppPromptTemplateOut)
async def get_prompt_template(
    admin: Annotated[User, Depends(get_admin_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AppPromptTemplateOut:
    _ = admin
    text, version = await prompt_gen.get_prompt_gen_template(session)
    versions = await prompt_gen.list_prompt_gen_versions(session)
    updated_at = versions[0].created_at if versions else None
    return _template_out(text, version, versions, updated_at)


@router.put("/prompt-template", response_model=AppPromptTemplateOut)
async def update_prompt_template(
    body: AppPromptTemplateUpdate,
    admin: Annotated[User, Depends(get_admin_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AppPromptTemplateOut:
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Template text cannot be empty")
    _, version = await prompt_gen.get_prompt_gen_template(session)
    next_version = (version or 0) + 1
    template = AppPromptTemplate(
        kind=AppPromptKind.prompt_gen,
        version=next_version,
        text=text,
        updated_by=admin.id,
    )
    session.add(template)
    await session.commit()
    await session.refresh(template)
    versions = await prompt_gen.list_prompt_gen_versions(session)
    return _template_out(text, next_version, versions, template.created_at)


@router.post("/prompt-template/restore", response_model=AppPromptTemplateOut)
async def restore_prompt_template(
    body: AppPromptTemplateRestore,
    admin: Annotated[User, Depends(get_admin_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AppPromptTemplateOut:
    """Restore an old version: its text is saved as a new (latest) version."""
    result = await session.exec(
        select(AppPromptTemplate).where(
            AppPromptTemplate.kind == AppPromptKind.prompt_gen,
            AppPromptTemplate.version == body.version,
        )
    )
    source = result.first()
    if source is None:
        raise HTTPException(status_code=404, detail="Version not found")
    _, current_version = await prompt_gen.get_prompt_gen_template(session)
    next_version = (current_version or 0) + 1
    template = AppPromptTemplate(
        kind=AppPromptKind.prompt_gen,
        version=next_version,
        text=source.text,
        updated_by=admin.id,
    )
    session.add(template)
    await session.commit()
    await session.refresh(template)
    versions = await prompt_gen.list_prompt_gen_versions(session)
    return _template_out(source.text, next_version, versions, template.created_at)


@router.delete("/prompt-template", response_model=AppPromptTemplateOut)
async def reset_prompt_template(
    admin: Annotated[User, Depends(get_admin_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AppPromptTemplateOut:
    """Reset to the code default: drop all stored versions."""
    _ = admin
    result = await session.exec(
        select(AppPromptTemplate).where(AppPromptTemplate.kind == AppPromptKind.prompt_gen)
    )
    for row in result.all():
        await session.delete(row)
    await session.commit()
    return AppPromptTemplateOut(
        kind=AppPromptKind.prompt_gen.value,
        text=prompt_gen.DEFAULT_PROMPT_GEN_TEMPLATE,
        version=None,
        is_default=True,
        default_text=prompt_gen.DEFAULT_PROMPT_GEN_TEMPLATE,
    )


@router.post("/prompt-template/preview", response_model=SuggestPromptResponse)
async def preview_prompt_template(
    body: PromptGenPreviewRequest,
    admin: Annotated[User, Depends(get_admin_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SuggestPromptResponse:
    """Admin playground: run prompt generation with a draft (or current) template."""
    if body.text is None:
        template, _ = await prompt_gen.get_prompt_gen_template(session)
    else:
        template = body.text.strip()
        if not template:
            raise HTTPException(status_code=400, detail="Template text cannot be empty")
    try:
        intent = await prompt_gen.get_prompt_gen_intent(session, body.intent)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    instruction = intent.instruction.strip() if intent is not None else ""
    system = prompt_gen.render_prompt_gen_system(template, body.mode, instruction)
    user_text = body.hint.strip() or prompt_gen.SUGGEST_DEFAULT_REQUEST
    try:
        provider = await get_chat_provider_for_user(session, user=admin)
    except GenerationError as exc:
        raise HTTPException(status_code=exc.status_code or 502, detail=exc.message) from exc
    try:
        text = await provider.suggest_prompt(user_text, system)
    except GenerationError as exc:
        raise HTTPException(status_code=exc.status_code or 502, detail=exc.message) from exc
    finally:
        await provider.aclose()
    return SuggestPromptResponse(text=text)


# --- Prompt-generation intents («Придумай промпт» настроения) ---


@router.get("/prompt-gen-intents", response_model=list[PromptGenIntentOut])
async def list_prompt_gen_intents(
    admin: Annotated[User, Depends(get_admin_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[PromptGenIntentOut]:
    _ = admin
    result = await session.exec(
        select(PromptGenIntent).order_by(PromptGenIntent.position, PromptGenIntent.id)
    )
    return [PromptGenIntentOut.model_validate(i) for i in result.all()]


@router.post(
    "/prompt-gen-intents",
    response_model=PromptGenIntentOut,
    status_code=201,
)
async def create_prompt_gen_intent(
    body: PromptGenIntentCreate,
    admin: Annotated[User, Depends(get_admin_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PromptGenIntent:
    _ = admin
    exists = await session.exec(
        select(PromptGenIntent.id).where(PromptGenIntent.key == body.key).limit(1)
    )
    if exists.first() is not None:
        raise HTTPException(status_code=409, detail="Intent key already exists")
    intent = PromptGenIntent(
        key=body.key,
        label=body.label.strip(),
        instruction=body.instruction.strip(),
        is_active=body.is_active,
        position=body.position,
    )
    session.add(intent)
    await session.commit()
    await session.refresh(intent)
    return intent


@router.patch("/prompt-gen-intents/{intent_id}", response_model=PromptGenIntentOut)
async def update_prompt_gen_intent(
    intent_id: int,
    body: PromptGenIntentUpdate,
    admin: Annotated[User, Depends(get_admin_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PromptGenIntent:
    _ = admin
    intent = await session.get(PromptGenIntent, intent_id)
    if intent is None:
        raise HTTPException(status_code=404, detail="Intent not found")
    if body.label is not None:
        intent.label = body.label.strip()
    if body.instruction is not None:
        intent.instruction = body.instruction.strip()
    if body.is_active is not None:
        intent.is_active = body.is_active
    if body.position is not None:
        intent.position = body.position
    session.add(intent)
    await session.commit()
    await session.refresh(intent)
    return intent


@router.delete("/prompt-gen-intents/{intent_id}", status_code=204)
async def delete_prompt_gen_intent(
    intent_id: int,
    admin: Annotated[User, Depends(get_admin_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    _ = admin
    intent = await session.get(PromptGenIntent, intent_id)
    if intent is None:
        raise HTTPException(status_code=404, detail="Intent not found")
    await session.delete(intent)
    await session.commit()
