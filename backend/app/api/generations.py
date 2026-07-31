import asyncio
import json
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.auth import get_current_user
from app.db import get_session
from app.models import (
    Generation,
    GenerationMode,
    Image,
    Prompt,
    PromptMode,
    PromptVersion,
    User,
)
from app.schemas import GenerationCreate, GenerationOut
from app.services.jobs import run_generation

router = APIRouter()

ALLOWED_SIZES = {"1K", "2K", "3K", "4K"}
ALLOWED_RATIOS = {"1:1", "3:4", "4:3", "16:9", "9:16", "2:3", "3:2", "21:9"}


def _to_out(job: Generation) -> GenerationOut:
    try:
        params = json.loads(job.params or "{}")
    except json.JSONDecodeError:
        params = {}
    return GenerationOut(
        id=job.id,  # type: ignore[arg-type]
        mode=job.mode,
        status=job.status,
        error=job.error,
        prompt_version_id=job.prompt_version_id,
        result_image_id=job.result_image_id,
        params=params,
        created_at=job.created_at,
        finished_at=job.finished_at,
    )


@router.post("", response_model=GenerationOut, status_code=status.HTTP_201_CREATED)
async def create_generation(
    body: GenerationCreate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> GenerationOut:
    if body.size not in ALLOWED_SIZES:
        raise HTTPException(status_code=400, detail=f"Invalid size, use one of {sorted(ALLOWED_SIZES)}")
    if body.ratio not in ALLOWED_RATIOS:
        raise HTTPException(status_code=400, detail=f"Invalid ratio, use one of {sorted(ALLOWED_RATIOS)}")

    prompt_text = body.text
    prompt_version_id = body.prompt_version_id

    if prompt_version_id is not None:
        version = await session.get(PromptVersion, prompt_version_id)
        if version is None:
            raise HTTPException(status_code=400, detail="Invalid prompt_version_id")
        prompt = await session.get(Prompt, version.prompt_id)
        if prompt is None or prompt.user_id != user.id:
            raise HTTPException(status_code=400, detail="Invalid prompt_version_id")
        if prompt.mode == PromptMode.i2i and not body.reference_image_ids and body.parent_image_id is None:
            raise HTTPException(
                status_code=400,
                detail="Для этого промпта нужен референс — выберите изображение",
            )
        if not prompt_text:
            prompt_text = version.text

    if not prompt_text:
        raise HTTPException(status_code=400, detail="text or prompt_version_id required")

    if body.mode == GenerationMode.edit:
        if body.parent_image_id is None:
            raise HTTPException(status_code=400, detail="parent_image_id required for edit")
        parent = await session.get(Image, body.parent_image_id)
        if parent is None or parent.user_id != user.id:
            raise HTTPException(status_code=400, detail="Invalid parent_image_id")

    for rid in body.reference_image_ids:
        img = await session.get(Image, rid)
        if img is None or img.user_id != user.id:
            raise HTTPException(status_code=400, detail=f"Invalid reference image id {rid}")

    params = {
        "text": prompt_text,
        "size": body.size,
        "ratio": body.ratio,
        "reference_image_ids": body.reference_image_ids,
        "parent_image_id": body.parent_image_id,
        "category_id": body.category_id,
        "mode": body.mode.value,
    }

    job = Generation(
        user_id=user.id,  # type: ignore[arg-type]
        prompt_version_id=prompt_version_id,
        mode=body.mode,
        params=json.dumps(params, ensure_ascii=False),
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)

    asyncio.create_task(run_generation(job.id))  # type: ignore[arg-type]
    return _to_out(job)


@router.get("", response_model=list[GenerationOut])
async def list_generations(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: int = 50,
) -> list[GenerationOut]:
    result = await session.exec(
        select(Generation)
        .where(Generation.user_id == user.id)
        .order_by(Generation.created_at.desc())
        .limit(limit)
    )
    return [_to_out(j) for j in result.all()]


@router.get("/{job_id}", response_model=GenerationOut)
async def get_generation(
    job_id: int,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> GenerationOut:
    job = await session.get(Generation, job_id)
    if job is None or job.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Generation not found")
    return _to_out(job)
