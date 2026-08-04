"""Referral stats for the current Telegram-linked user."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.auth import get_current_user
from app.config import get_settings
from app.db import get_session
from app.models import TelegramAccount, User
from app.schemas import (
    ReferralCounts,
    ReferralLevels,
    ReferralMeResponse,
    ReferralUserBrief,
)
from app.services.referrals import (
    build_referral_link,
    get_referral_stats,
    referral_code,
)

router = APIRouter()
settings = get_settings()


@router.get("/me", response_model=ReferralMeResponse)
async def my_referrals(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ReferralMeResponse:
    result = await session.exec(
        select(TelegramAccount).where(TelegramAccount.linked_user_id == user.id)
    )
    account = result.first()
    if account is None:
        raise HTTPException(status_code=404, detail="Telegram account not linked")

    stats = await get_referral_stats(session, account.telegram_id, include_levels=True)
    return ReferralMeResponse(
        code=referral_code(account.telegram_id),
        link=build_referral_link(settings.telegram_app_url, account.telegram_id),
        counts=ReferralCounts(
            l1=stats.counts.l1,
            l2=stats.counts.l2,
            l3=stats.counts.l3,
            total=stats.counts.total,
        ),
        levels=ReferralLevels(
            l1=[
                ReferralUserBrief(
                    telegram_id=b.telegram_id,
                    username=b.username,
                    first_name=b.first_name,
                    referred_at=b.referred_at,
                )
                for b in stats.levels["l1"]
            ],
            l2=[
                ReferralUserBrief(
                    telegram_id=b.telegram_id,
                    username=b.username,
                    first_name=b.first_name,
                    referred_at=b.referred_at,
                )
                for b in stats.levels["l2"]
            ],
            l3=[
                ReferralUserBrief(
                    telegram_id=b.telegram_id,
                    username=b.username,
                    first_name=b.first_name,
                    referred_at=b.referred_at,
                )
                for b in stats.levels["l3"]
            ],
        ),
    )
