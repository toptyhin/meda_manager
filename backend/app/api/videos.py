import asyncio
import json
import random
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.auth import get_current_user
from app.config import get_settings
from app.db import get_session
from app.models import Category, Image, User, Video, VideoGeneration, VideoMode
from app.schemas import (
    VideoGenerationCreate,
    VideoGenerationOut,
    VideoListResponse,
    VideoOut,
    VideoUpdate,
)
from app.services import video as video_service
from app.services.jobs import run_video_generation

generations_router = APIRouter()
videos_router = APIRouter()
settings = get_settings()

# Recommended Agnes Video V2.0 resolution presets (width, height)
ALLOWED_RESOLUTIONS: set[tuple[int, int]] = {
    # 480p-ish
    (832, 448),
    (448, 832),
    (640, 640),
    (640, 480),
    (480, 640),
    # 720p
    (1280, 720),
    (720, 1280),
    (960, 960),
    (960, 720),
    (720, 960),
    # 1080p / Agnes defaults
    (1920, 1080),
    (1080, 1920),
    (1080, 1080),
    (1440, 1080),
    (1080, 1440),
    (1152, 768),
    (768, 1152),
}


def _validate_frames(num_frames: int) -> None:
    if num_frames < 1 or num_frames > 441:
        raise HTTPException(status_code=400, detail="num_frames must be between 1 and 441")
    if (num_frames - 1) % 8 != 0:
        raise HTTPException(
            status_code=400,
            detail="num_frames must follow the 8n+1 rule (e.g. 81, 121, 241, 441)",
        )


def _job_to_out(job: VideoGeneration) -> VideoGenerationOut:
    try:
        params = json.loads(job.params or "{}")
    except json.JSONDecodeError:
        params = {}
    return VideoGenerationOut(
        id=job.id,  # type: ignore[arg-type]
        mode=job.mode,
        status=job.status,
        error=job.error,
        progress=job.progress,
        params=params,
        provider_task_id=job.provider_task_id,
        provider_video_id=job.provider_video_id,
        result_video_id=job.result_video_id,
        created_at=job.created_at,
        finished_at=job.finished_at,
    )


def _video_to_out(v: Video) -> VideoOut:
    try:
        source_ids = json.loads(v.source_image_ids or "[]")
        if not isinstance(source_ids, list):
            source_ids = []
        source_ids = [int(x) for x in source_ids]
    except (json.JSONDecodeError, TypeError, ValueError):
        source_ids = []
    return VideoOut(
        id=v.id,  # type: ignore[arg-type]
        width=v.width,
        height=v.height,
        duration=v.duration,
        fps=v.fps,
        seed=v.seed,
        mode=v.mode,
        prompt_text=v.prompt_text,
        negative_prompt=v.negative_prompt,
        source_image_ids=source_ids,
        category_id=v.category_id,
        created_at=v.created_at,
        file_url=f"/api/videos/{v.id}/file",
    )


@generations_router.post(
    "",
    response_model=VideoGenerationOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_video_generation(
    body: VideoGenerationCreate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VideoGenerationOut:
    _validate_frames(body.num_frames)
    if body.frame_rate < 1 or body.frame_rate > 60:
        raise HTTPException(status_code=400, detail="frame_rate must be between 1 and 60")
    if (body.width, body.height) not in ALLOWED_RESOLUTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported resolution {body.width}x{body.height}",
        )

    if body.mode == VideoMode.i2v:
        if len(body.source_image_ids) != 1:
            raise HTTPException(
                status_code=400,
                detail="Оживлятор (i2v) требует ровно одно изображение",
            )
    elif body.mode == VideoMode.keyframes:
        if not (2 <= len(body.source_image_ids) <= 5):
            raise HTTPException(
                status_code=400,
                detail="Сторимейкер (keyframes) требует от 2 до 5 изображений",
            )
    elif body.mode == VideoMode.t2v:
        if body.source_image_ids:
            raise HTTPException(
                status_code=400,
                detail="Режиссёр (t2v) не использует исходные изображения",
            )

    if body.mode in (VideoMode.i2v, VideoMode.keyframes) and not settings.public_base_url:
        raise HTTPException(
            status_code=400,
            detail="PUBLIC_BASE_URL не настроен — режимы с изображениями недоступны",
        )

    for sid in body.source_image_ids:
        img = await session.get(Image, sid)
        if img is None or img.user_id != user.id:
            raise HTTPException(status_code=400, detail=f"Invalid source image id {sid}")

    if body.category_id is not None:
        cat = await session.get(Category, body.category_id)
        if cat is None or cat.user_id != user.id:
            raise HTTPException(status_code=400, detail="Invalid category_id")

    seed = body.seed
    if seed is None:
        seed = random.randint(0, 2_147_483_647)

    params = {
        "text": body.text,
        "source_image_ids": body.source_image_ids,
        "width": body.width,
        "height": body.height,
        "num_frames": body.num_frames,
        "frame_rate": body.frame_rate,
        "seed": seed,
        "negative_prompt": body.negative_prompt,
        "category_id": body.category_id,
        "mode": body.mode.value,
    }

    job = VideoGeneration(
        user_id=user.id,  # type: ignore[arg-type]
        mode=body.mode,
        params=json.dumps(params, ensure_ascii=False),
        progress=0,
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)

    asyncio.create_task(run_video_generation(job.id))  # type: ignore[arg-type]
    return _job_to_out(job)


@generations_router.get("", response_model=list[VideoGenerationOut])
async def list_video_generations(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: int = 50,
) -> list[VideoGenerationOut]:
    result = await session.exec(
        select(VideoGeneration)
        .where(VideoGeneration.user_id == user.id)
        .order_by(VideoGeneration.created_at.desc())
        .limit(limit)
    )
    return [_job_to_out(j) for j in result.all()]


@generations_router.get("/{job_id}", response_model=VideoGenerationOut)
async def get_video_generation(
    job_id: int,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VideoGenerationOut:
    job = await session.get(VideoGeneration, job_id)
    if job is None or job.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video generation not found")
    return _job_to_out(job)


@videos_router.get("", response_model=VideoListResponse)
async def list_videos(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    mode: Optional[VideoMode] = None,
    category_id: Optional[int] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=100),
) -> VideoListResponse:
    filters = [Video.user_id == user.id]
    if mode is not None:
        filters.append(Video.mode == mode)
    if category_id is not None:
        filters.append(Video.category_id == category_id)

    count_q = select(func.count()).select_from(Video).where(*filters)
    total = (await session.exec(count_q)).one()

    result = await session.exec(
        select(Video)
        .where(*filters)
        .order_by(Video.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = [_video_to_out(v) for v in result.all()]
    return VideoListResponse(items=items, total=total, page=page, page_size=page_size)


@videos_router.get("/{video_id}", response_model=VideoOut)
async def get_video(
    video_id: int,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VideoOut:
    v = await session.get(Video, video_id)
    if v is None or v.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    return _video_to_out(v)


@videos_router.patch("/{video_id}", response_model=VideoOut)
async def update_video(
    video_id: int,
    body: VideoUpdate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VideoOut:
    v = await session.get(Video, video_id)
    if v is None or v.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    if body.category_id is not None:
        if body.category_id == 0:
            v.category_id = None
        else:
            cat = await session.get(Category, body.category_id)
            if cat is None or cat.user_id != user.id:
                raise HTTPException(status_code=400, detail="Invalid category_id")
            v.category_id = body.category_id
    session.add(v)
    await session.commit()
    await session.refresh(v)
    return _video_to_out(v)


@videos_router.delete("/{video_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_video(
    video_id: int,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    v = await session.get(Video, video_id)
    if v is None or v.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    video_service.delete_video_file(v.path, settings)
    await session.delete(v)
    await session.commit()


@videos_router.get("/{video_id}/file")
async def get_video_file(
    video_id: int,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FileResponse:
    v = await session.get(Video, video_id)
    if v is None or v.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    path = video_service.resolve_video_path(v.path, settings)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File missing")
    return FileResponse(path, media_type="video/mp4")
