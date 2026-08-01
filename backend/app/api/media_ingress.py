from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlmodel.ext.asyncio.session import AsyncSession

from app.config import get_settings
from app.db import get_session
from app.models import Image
from app.services import imaging
from app.services.media_links import verify_signed_image_link

router = APIRouter()
settings = get_settings()


@router.get("/{image_id}")
async def media_ingress(
    image_id: int,
    session: Annotated[AsyncSession, Depends(get_session)],
    exp: int = Query(...),
    sig: str = Query(...),
) -> FileResponse:
    """Public HMAC-signed image fetch for external providers (e.g. Agnes Video)."""
    if not verify_signed_image_link(image_id, exp, sig, settings):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or expired media link",
        )
    img = await session.get(Image, image_id)
    if img is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")
    path = imaging.resolve_path(img.path, settings)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File missing")
    return FileResponse(path)
