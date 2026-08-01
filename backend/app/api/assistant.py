from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.auth import get_current_user
from app.config import get_settings
from app.db import get_session
from app.models import ImproveKind, ImprovePromptVersion, User
from app.providers.agnes import IMPROVE_SYSTEM, VIDEO_IMPROVE_SYSTEM, AgnesProvider
from app.providers.base import GenerationError
from app.schemas import (
    ImproveRequest,
    ImproveResponse,
    ImproveTemplateOut,
    ImproveTemplateVersionCreate,
    ImproveTemplateVersionOut,
)

router = APIRouter()


def _default_text(kind: ImproveKind) -> str:
    return VIDEO_IMPROVE_SYSTEM if kind == ImproveKind.video else IMPROVE_SYSTEM


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
    system = await _current_template(session, user.id, ImproveKind.image)  # type: ignore[arg-type]
    provider = AgnesProvider(settings=get_settings())
    try:
        improved = await provider.improve_prompt(
            body.text, body.category_name, kind="image", system=system
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
    system = await _current_template(session, user.id, ImproveKind.video)  # type: ignore[arg-type]
    provider = AgnesProvider(settings=get_settings())
    try:
        improved = await provider.improve_prompt(
            body.text, body.category_name, kind="video", system=system
        )
    except GenerationError as exc:
        raise HTTPException(status_code=502, detail=exc.message) from exc
    finally:
        await provider.aclose()
    return ImproveResponse(improved_text=improved)
