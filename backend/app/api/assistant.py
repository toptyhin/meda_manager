from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user
from app.config import get_settings
from app.models import User
from app.providers.agnes import AgnesProvider
from app.providers.base import GenerationError
from app.schemas import ImproveRequest, ImproveResponse

router = APIRouter()


@router.post("/improve", response_model=ImproveResponse)
async def improve_prompt(
    body: ImproveRequest,
    user: Annotated[User, Depends(get_current_user)],
) -> ImproveResponse:
    _ = user
    provider = AgnesProvider(settings=get_settings())
    try:
        improved = await provider.improve_prompt(body.text, body.category_name, kind="image")
    except GenerationError as exc:
        raise HTTPException(status_code=502, detail=exc.message) from exc
    finally:
        await provider.aclose()
    return ImproveResponse(improved_text=improved)


@router.post("/video-improve", response_model=ImproveResponse)
async def improve_video_prompt(
    body: ImproveRequest,
    user: Annotated[User, Depends(get_current_user)],
) -> ImproveResponse:
    _ = user
    provider = AgnesProvider(settings=get_settings())
    try:
        improved = await provider.improve_prompt(body.text, body.category_name, kind="video")
    except GenerationError as exc:
        raise HTTPException(status_code=502, detail=exc.message) from exc
    finally:
        await provider.aclose()
    return ImproveResponse(improved_text=improved)
