from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.auth import get_current_user
from app.db import get_session
from app.models import Category, Prompt, PromptSource, PromptVersion, User
from app.schemas import (
    PromptCreate,
    PromptOut,
    PromptUpdate,
    PromptVersionCreate,
    PromptVersionOut,
)

router = APIRouter()


async def _latest_version(session: AsyncSession, prompt_id: int) -> Optional[PromptVersion]:
    result = await session.exec(
        select(PromptVersion)
        .where(PromptVersion.prompt_id == prompt_id)
        .order_by(PromptVersion.version.desc())
        .limit(1)
    )
    return result.first()


def _to_out(prompt: Prompt, version: Optional[PromptVersion]) -> PromptOut:
    return PromptOut(
        id=prompt.id,  # type: ignore[arg-type]
        title=prompt.title,
        category_id=prompt.category_id,
        mode=prompt.mode,
        created_at=prompt.created_at,
        current_version=PromptVersionOut.model_validate(version) if version else None,
    )


@router.get("", response_model=list[PromptOut])
async def list_prompts(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    category_id: Optional[int] = None,
) -> list[PromptOut]:
    query = select(Prompt).where(Prompt.user_id == user.id)
    if category_id is not None:
        query = query.where(Prompt.category_id == category_id)
    query = query.order_by(Prompt.created_at.desc())
    result = await session.exec(query)
    prompts = list(result.all())
    out: list[PromptOut] = []
    for p in prompts:
        ver = await _latest_version(session, p.id)  # type: ignore[arg-type]
        out.append(_to_out(p, ver))
    return out


@router.post("", response_model=PromptOut, status_code=status.HTTP_201_CREATED)
async def create_prompt(
    body: PromptCreate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PromptOut:
    cat = await session.get(Category, body.category_id)
    if cat is None or cat.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid category")

    prompt = Prompt(
        user_id=user.id,
        category_id=body.category_id,
        title=body.title,
        mode=body.mode,
    )
    session.add(prompt)
    await session.commit()
    await session.refresh(prompt)

    version = PromptVersion(
        prompt_id=prompt.id,  # type: ignore[arg-type]
        version=1,
        text=body.text,
        source=PromptSource.manual,
    )
    session.add(version)
    await session.commit()
    await session.refresh(version)
    return _to_out(prompt, version)


@router.get("/{prompt_id}", response_model=PromptOut)
async def get_prompt(
    prompt_id: int,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PromptOut:
    prompt = await session.get(Prompt, prompt_id)
    if prompt is None or prompt.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompt not found")
    ver = await _latest_version(session, prompt_id)
    return _to_out(prompt, ver)


@router.patch("/{prompt_id}", response_model=PromptOut)
async def update_prompt(
    prompt_id: int,
    body: PromptUpdate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PromptOut:
    prompt = await session.get(Prompt, prompt_id)
    if prompt is None or prompt.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompt not found")
    if body.category_id is not None:
        cat = await session.get(Category, body.category_id)
        if cat is None or cat.user_id != user.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid category")
        prompt.category_id = body.category_id
    if body.title is not None:
        prompt.title = body.title
    session.add(prompt)
    await session.commit()
    await session.refresh(prompt)
    ver = await _latest_version(session, prompt_id)
    return _to_out(prompt, ver)


@router.delete("/{prompt_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_prompt(
    prompt_id: int,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    prompt = await session.get(Prompt, prompt_id)
    if prompt is None or prompt.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompt not found")
    versions = await session.exec(select(PromptVersion).where(PromptVersion.prompt_id == prompt_id))
    for v in versions.all():
        await session.delete(v)
    await session.delete(prompt)
    await session.commit()


@router.get("/{prompt_id}/versions", response_model=list[PromptVersionOut])
async def list_versions(
    prompt_id: int,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[PromptVersion]:
    prompt = await session.get(Prompt, prompt_id)
    if prompt is None or prompt.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompt not found")
    result = await session.exec(
        select(PromptVersion)
        .where(PromptVersion.prompt_id == prompt_id)
        .order_by(PromptVersion.version.desc())
    )
    return list(result.all())


@router.post(
    "/{prompt_id}/versions",
    response_model=PromptVersionOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_version(
    prompt_id: int,
    body: PromptVersionCreate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PromptVersion:
    prompt = await session.get(Prompt, prompt_id)
    if prompt is None or prompt.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompt not found")
    latest = await _latest_version(session, prompt_id)
    next_ver = (latest.version + 1) if latest else 1
    version = PromptVersion(
        prompt_id=prompt_id,
        version=next_ver,
        text=body.text,
        source=body.source,
    )
    session.add(version)
    await session.commit()
    await session.refresh(version)
    return version
