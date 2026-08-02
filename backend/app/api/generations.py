import asyncio
import json
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.auth import get_current_user
from app.config import get_settings
from app.db import get_session
from app.models import (
    Generation,
    GenerationMode,
    GenerationStep,
    Image,
    Prompt,
    PromptMode,
    PromptVersion,
    User,
)
from app.schemas import GenerationCreate, GenerationOut, GenerationStepOut
from app.services.jobs import run_generation

router = APIRouter()
settings = get_settings()

ALLOWED_SIZES = {"1K", "2K", "3K", "4K"}
ALLOWED_RATIOS = {"1:1", "3:4", "4:3", "16:9", "9:16", "2:3", "3:2", "21:9"}


def _step_to_out(step: GenerationStep) -> GenerationStepOut:
    issues: list[dict] = []
    if step.review_issues:
        try:
            parsed = json.loads(step.review_issues)
            if isinstance(parsed, list):
                issues = [i for i in parsed if isinstance(i, dict)]
        except json.JSONDecodeError:
            issues = []
    thumb_url = None
    file_url = None
    if step.image_id is not None:
        thumb_url = f"/api/images/{step.image_id}/thumb"
        file_url = f"/api/images/{step.image_id}/file"
    return GenerationStepOut(
        id=step.id,  # type: ignore[arg-type]
        attempt=step.attempt,
        action=step.action,
        prompt_used=step.prompt_used,
        image_id=step.image_id,
        thumb_url=thumb_url,
        file_url=file_url,
        review_score=step.review_score,
        review_passed=step.review_passed,
        review_issues=issues,
        review_fix_mode=step.review_fix_mode,
        error=step.error,
        created_at=step.created_at,
        finished_at=step.finished_at,
    )


def _to_out(job: Generation, steps: Optional[list[GenerationStep]] = None) -> GenerationOut:
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
        auto_review=bool(job.auto_review),
        review_score=job.review_score,
        review_passed=job.review_passed,
        params=params,
        steps=[_step_to_out(s) for s in (steps or [])],
        created_at=job.created_at,
        finished_at=job.finished_at,
    )


async def _load_steps(session: AsyncSession, job_id: int) -> list[GenerationStep]:
    result = await session.exec(
        select(GenerationStep)
        .where(GenerationStep.generation_id == job_id)
        .order_by(GenerationStep.attempt.asc())
    )
    return list(result.all())


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
        ref_count = len(body.reference_image_ids) + (
            1 if body.parent_image_id is not None else 0
        )
        if ref_count > 1:
            prompt_text = "Merge these images into one cohesive composition"
        elif ref_count == 1:
            prompt_text = (
                "Enhance and refine this image while preserving its "
                "composition and subject"
            )
        else:
            raise HTTPException(status_code=400, detail="text or prompt_version_id required")

    if body.auto_review and not settings.public_base_url:
        raise HTTPException(
            status_code=400,
            detail="PUBLIC_BASE_URL не настроен — авторевью недоступно "
            "(Agnes нужен публичный URL картинки)",
        )

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
        "auto_review": body.auto_review,
    }

    job = Generation(
        user_id=user.id,  # type: ignore[arg-type]
        prompt_version_id=prompt_version_id,
        mode=body.mode,
        params=json.dumps(params, ensure_ascii=False),
        auto_review=body.auto_review,
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)

    asyncio.create_task(run_generation(job.id))  # type: ignore[arg-type]
    return _to_out(job, steps=[])


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
    steps = await _load_steps(session, job_id)
    return _to_out(job, steps=steps)
