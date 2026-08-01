from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.auth import get_current_user
from app.db import get_session
from app.models import StyleKind, StylePreset, User
from app.schemas import StylePresetCreate, StylePresetOut, StylePresetUpdate
from app.style_preset_seed import SEED_STYLE_PRESETS

router = APIRouter()


_SEED_KIND_BY_TITLE = {item["title"]: item["kind"] for item in SEED_STYLE_PRESETS}


async def _ensure_seeded(user: User, session: AsyncSession) -> None:
    """Insert any missing seed presets (by title) for the user."""
    result = await session.exec(
        select(StylePreset.title).where(StylePreset.user_id == user.id)
    )
    have = set(result.all())
    added = False
    for item in SEED_STYLE_PRESETS:
        if item["title"] in have:
            continue
        session.add(
            StylePreset(
                user_id=user.id,
                title=item["title"],
                description=item["description"],
                category=item["category"],
                kind=item["kind"],
                text=item["text"],
            )
        )
        added = True
    if added:
        await session.commit()


async def _normalize_seed_kinds(user: User, session: AsyncSession) -> None:
    """Fix legacy seed rows stored as kind=both that should be image/video."""
    result = await session.exec(
        select(StylePreset).where(
            StylePreset.user_id == user.id,
            StylePreset.title.in_(list(_SEED_KIND_BY_TITLE.keys())),
        )
    )
    changed = False
    for preset in result.all():
        expected = _SEED_KIND_BY_TITLE.get(preset.title)
        if expected is not None and preset.kind != expected:
            preset.kind = expected
            session.add(preset)
            changed = True
    if changed:
        await session.commit()


@router.get("", response_model=list[StylePresetOut])
async def list_styles(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    kind: Optional[StyleKind] = Query(default=None),
) -> list[StylePreset]:
    await _ensure_seeded(user, session)
    await _normalize_seed_kinds(user, session)
    stmt = select(StylePreset).where(StylePreset.user_id == user.id)
    if kind is not None:
        # Include 'both' when filtering by image or video
        if kind == StyleKind.both:
            stmt = stmt.where(StylePreset.kind == StyleKind.both)
        else:
            stmt = stmt.where(
                (StylePreset.kind == kind) | (StylePreset.kind == StyleKind.both)
            )
    stmt = stmt.order_by(StylePreset.category, StylePreset.title)
    result = await session.exec(stmt)
    return list(result.all())


@router.post("", response_model=StylePresetOut, status_code=status.HTTP_201_CREATED)
async def create_style(
    body: StylePresetCreate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> StylePreset:
    existing = await session.exec(
        select(StylePreset).where(
            StylePreset.user_id == user.id, StylePreset.title == body.title
        )
    )
    if existing.first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Style preset already exists"
        )
    preset = StylePreset(
        user_id=user.id,
        title=body.title,
        description=body.description,
        category=body.category,
        kind=body.kind,
        text=body.text,
    )
    session.add(preset)
    await session.commit()
    await session.refresh(preset)
    return preset


@router.patch("/{preset_id}", response_model=StylePresetOut)
async def update_style(
    preset_id: int,
    body: StylePresetUpdate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> StylePreset:
    preset = await session.get(StylePreset, preset_id)
    if preset is None or preset.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Style preset not found"
        )
    data = body.model_dump(exclude_unset=True)
    if "title" in data and data["title"] != preset.title:
        clash = await session.exec(
            select(StylePreset).where(
                StylePreset.user_id == user.id,
                StylePreset.title == data["title"],
                StylePreset.id != preset_id,
            )
        )
        if clash.first():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Style preset already exists",
            )
    for key, value in data.items():
        setattr(preset, key, value)
    session.add(preset)
    await session.commit()
    await session.refresh(preset)
    return preset


@router.delete("/{preset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_style(
    preset_id: int,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    preset = await session.get(StylePreset, preset_id)
    if preset is None or preset.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Style preset not found"
        )
    await session.delete(preset)
    await session.commit()
