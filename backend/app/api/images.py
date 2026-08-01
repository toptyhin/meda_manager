from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.auth import get_current_user
from app.config import get_settings
from app.db import get_session
from app.models import Image, ImageKind, User
from app.schemas import ImageListResponse, ImageOut, ImageUpdate
from app.services import imaging

router = APIRouter()
settings = get_settings()


def _to_out(img: Image) -> ImageOut:
    return ImageOut(
        id=img.id,  # type: ignore[arg-type]
        kind=img.kind,
        width=img.width,
        height=img.height,
        rating=img.rating,
        prompt_version_id=img.prompt_version_id,
        prompt_text=img.prompt_text,
        parent_image_id=img.parent_image_id,
        category_id=img.category_id,
        size=img.size,
        ratio=img.ratio,
        created_at=img.created_at,
        thumb_url=f"/api/images/{img.id}/thumb",
        file_url=f"/api/images/{img.id}/file",
    )


@router.post("/upload", response_model=ImageOut, status_code=status.HTTP_201_CREATED)
async def upload_image(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    file: UploadFile = File(...),
    category_id: Optional[int] = None,
) -> ImageOut:
    data = await file.read()
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(data) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large (max {settings.max_upload_mb} MB)",
        )
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")

    try:
        saved = imaging.save_image(data, settings, prefix="ref")
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid image: {exc}",
        ) from exc

    img = Image(
        user_id=user.id,  # type: ignore[arg-type]
        kind=ImageKind.reference,
        path=saved.path,
        thumb_path=saved.thumb_path,
        width=saved.width,
        height=saved.height,
        category_id=category_id,
    )
    session.add(img)
    await session.commit()
    await session.refresh(img)
    return _to_out(img)


@router.get("", response_model=ImageListResponse)
async def list_images(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    kind: Optional[ImageKind] = None,
    category_id: Optional[int] = None,
    rating_min: Optional[int] = Query(default=None, ge=0, le=5),
    sort: str = Query(default="created_at", pattern="^(created_at|rating)$"),
    order: str = Query(default="desc", pattern="^(asc|desc)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=48, ge=1, le=200),
) -> ImageListResponse:
    filters = [Image.user_id == user.id]
    if kind is not None:
        filters.append(Image.kind == kind)
    else:
        filters.append(Image.kind != ImageKind.draft)
    if category_id is not None:
        filters.append(Image.category_id == category_id)
    if rating_min is not None:
        filters.append(Image.rating >= rating_min)

    count_q = select(func.count()).select_from(Image).where(*filters)
    total = (await session.exec(count_q)).one()

    sort_col = Image.created_at if sort == "created_at" else Image.rating
    sort_col = sort_col.desc() if order == "desc" else sort_col.asc()

    query = (
        select(Image)
        .where(*filters)
        .order_by(sort_col)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await session.exec(query)
    items = [_to_out(i) for i in result.all()]
    return ImageListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/{image_id}", response_model=ImageOut)
async def get_image(
    image_id: int,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ImageOut:
    img = await session.get(Image, image_id)
    if img is None or img.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")
    return _to_out(img)


@router.patch("/{image_id}", response_model=ImageOut)
async def update_image(
    image_id: int,
    body: ImageUpdate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ImageOut:
    img = await session.get(Image, image_id)
    if img is None or img.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")
    if body.rating is not None:
        img.rating = body.rating
    if body.category_id is not None:
        img.category_id = body.category_id
    session.add(img)
    await session.commit()
    await session.refresh(img)
    return _to_out(img)


@router.delete("/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_image(
    image_id: int,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    img = await session.get(Image, image_id)
    if img is None or img.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")
    imaging.delete_image_files(img.path, img.thumb_path, settings)
    await session.delete(img)
    await session.commit()


@router.get("/{image_id}/file")
async def get_file(
    image_id: int,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FileResponse:
    img = await session.get(Image, image_id)
    if img is None or img.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")
    path = imaging.resolve_path(img.path, settings)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File missing")
    return FileResponse(path)


@router.get("/{image_id}/thumb")
async def get_thumb(
    image_id: int,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FileResponse:
    img = await session.get(Image, image_id)
    if img is None or img.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")
    path = imaging.resolve_path(img.thumb_path, settings)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thumb missing")
    return FileResponse(path, media_type="image/jpeg")
