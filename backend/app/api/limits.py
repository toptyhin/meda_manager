from typing import Annotated

from fastapi import APIRouter, Depends
from sqlmodel.ext.asyncio.session import AsyncSession

from app.auth import get_current_user
from app.db import get_session
from app.models import User
from app.schemas import QuotaSnapshot
from app.services.limits import quota_snapshot

router = APIRouter()


@router.get("/me", response_model=QuotaSnapshot)
async def my_limits(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> QuotaSnapshot:
    return await quota_snapshot(session, user)
