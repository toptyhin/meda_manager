from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.auth import get_current_user
from app.config import get_settings
from app.db import get_session
from app.models import Image, ImproveKind, ImprovePromptVersion, User
from app.providers.agnes import (
    DEFAULT_IMPROVE_TEMPLATES,
    DESCRIBE_IMAGE_SYSTEM,
    EXTRACT_STYLE_SYSTEM,
)
from app.providers.base import GenerationError
from app.schemas import (
    ImproveRequest,
    ImproveResponse,
    ImproveTemplateOut,
    ImproveTemplateVersionCreate,
    ImproveTemplateVersionOut,
    VisionPromptRequest,
    VisionPromptResponse,
)
from app.services import imaging
from app.services.provider_runtime import get_chat_provider_for_user

router = APIRouter()


def _default_text(kind: ImproveKind) -> str:
    return DEFAULT_IMPROVE_TEMPLATES[kind]


def _image_kind(mode: str | None) -> ImproveKind:
    return ImproveKind.image_i2i if mode == "i2i" else ImproveKind.image_t2i


def _video_kind(mode: str | None) -> ImproveKind:
    return {
        "i2v": ImproveKind.video_i2v,
        "keyframes": ImproveKind.video_keyframes,
    }.get(mode or "", ImproveKind.video_t2v)


async def _list_versions(
    session: AsyncSession,
    user_id: int,
    kind: ImproveKind,
) -> list[ImprovePromptVersion]:
    result = await session.exec(
        select(ImprovePromptVersion)
        .where(
            ImprovePromptVersion.user_id == user_id,
            ImprovePromptVersion.kind == kind,
        )
        .order_by(ImprovePromptVersion.version.desc())
    )
    return list(result.all())


async def _latest_version(
    session: AsyncSession,
    user_id: int,
    kind: ImproveKind,
) -> ImprovePromptVersion | None:
    result = await session.exec(
        select(ImprovePromptVersion)
        .where(
            ImprovePromptVersion.user_id == user_id,
            ImprovePromptVersion.kind == kind,
        )
        .order_by(ImprovePromptVersion.version.desc())
        .limit(1)
    )
    return result.first()


async def _current_template(
    session: AsyncSession,
    user_id: int,
    kind: ImproveKind,
) -> str:
    latest = await _latest_version(session, user_id, kind)
    if latest is not None:
        return latest.text
    return _default_text(kind)


@router.get("/templates/{kind}", response_model=ImproveTemplateOut)
async def get_template(
    kind: ImproveKind,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ImproveTemplateOut:
    versions = await _list_versions(session, user.id, kind)  # type: ignore[arg-type]
    default_text = _default_text(kind)
    if versions:
        current = versions[0]
        return ImproveTemplateOut(
            kind=kind,
            text=current.text,
            version=current.version,
            is_default=False,
            default_text=default_text,
            versions=[
                ImproveTemplateVersionOut.model_validate(v) for v in versions
            ],
        )
    return ImproveTemplateOut(
        kind=kind,
        text=default_text,
        version=None,
        is_default=True,
        default_text=default_text,
        versions=[],
    )


@router.post(
    "/templates/{kind}/versions",
    response_model=ImproveTemplateVersionOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_template_version(
    kind: ImproveKind,
    body: ImproveTemplateVersionCreate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ImprovePromptVersion:
    text = body.text.strip()
    if not text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Template text cannot be empty",
        )
    latest = await _latest_version(session, user.id, kind)  # type: ignore[arg-type]
    next_ver = (latest.version + 1) if latest else 1
    version = ImprovePromptVersion(
        user_id=user.id,  # type: ignore[arg-type]
        kind=kind,
        version=next_ver,
        text=text,
    )
    session.add(version)
    await session.commit()
    await session.refresh(version)
    return version


@router.post("/improve", response_model=ImproveResponse)
async def improve_prompt(
    body: ImproveRequest,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ImproveResponse:
    kind = _image_kind(body.mode)
    system = await _current_template(session, user.id, kind)  # type: ignore[arg-type]
    try:
        provider = await get_chat_provider_for_user(session, user=user)
    except GenerationError as exc:
        raise HTTPException(status_code=exc.status_code or 502, detail=exc.message) from exc
    try:
        improved = await provider.improve_prompt(
            body.text, body.category_name, kind=kind, system=system
        )
    except GenerationError as exc:
        raise HTTPException(status_code=502, detail=exc.message) from exc
    finally:
        await provider.aclose()
    return ImproveResponse(improved_text=improved)


@router.post("/video-improve", response_model=ImproveResponse)
async def improve_video_prompt(
    body: ImproveRequest,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ImproveResponse:
    kind = _video_kind(body.mode)
    system = await _current_template(session, user.id, kind)  # type: ignore[arg-type]
    try:
        provider = await get_chat_provider_for_user(session, user=user)
    except GenerationError as exc:
        raise HTTPException(status_code=exc.status_code or 502, detail=exc.message) from exc
    try:
        improved = await provider.improve_prompt(
            body.text, body.category_name, kind=kind, system=system
        )
    except GenerationError as exc:
        raise HTTPException(status_code=502, detail=exc.message) from exc
    finally:
        await provider.aclose()
    return ImproveResponse(improved_text=improved)


async def _vision_prompt(
    session: AsyncSession,
    user: User,
    image_id: int,
    system: str,
    instruction: str,
) -> str:
    img = await session.get(Image, image_id)
    if img is None or img.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")
    settings = get_settings()
    path = imaging.resolve_path(img.path, settings)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File missing")

    try:
        provider = await get_chat_provider_for_user(session, user=user, settings=settings)
    except GenerationError as exc:
        raise HTTPException(status_code=exc.status_code or 502, detail=exc.message) from exc
    try:
        return await provider.vision_prompt(path.read_bytes(), system, instruction)
    except GenerationError as exc:
        raise HTTPException(status_code=502, detail=exc.message) from exc
    finally:
        await provider.aclose()


@router.post("/describe-image", response_model=VisionPromptResponse)
async def describe_image(
    body: VisionPromptRequest,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VisionPromptResponse:
    text = await _vision_prompt(
        session,
        user,
        body.image_id,
        DESCRIBE_IMAGE_SYSTEM,
        "Describe this image as an AI image generation prompt.",
    )
    return VisionPromptResponse(text=text)


@router.post("/extract-style", response_model=VisionPromptResponse)
async def extract_style(
    body: VisionPromptRequest,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VisionPromptResponse:
    text = await _vision_prompt(
        session,
        user,
        body.image_id,
        EXTRACT_STYLE_SYSTEM,
        "Analyze the artistic style of this image and output a reusable style prompt.",
    )
    return VisionPromptResponse(text=text)
