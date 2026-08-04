"""Referral attribution and multi-level stats (L1/L2/L3).

Attribution is Telegram-only via deep-link start_param ``ref_<telegram_id>``.
The link is written once on first Mini App login and never changed. No payouts —
accounting/stats only.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import TelegramAccount, utcnow

REFERRAL_START_PARAM_RE = re.compile(r"^ref_(\d+)$")
LEVEL_LIST_CAP = 50


@dataclass
class ReferralUserBrief:
    telegram_id: int
    username: Optional[str]
    first_name: str
    referred_at: Optional[datetime]


@dataclass
class ReferralCounts:
    l1: int = 0
    l2: int = 0
    l3: int = 0

    @property
    def total(self) -> int:
        return self.l1 + self.l2 + self.l3


@dataclass
class ReferralStats:
    counts: ReferralCounts = field(default_factory=ReferralCounts)
    levels: dict[str, list[ReferralUserBrief]] = field(
        default_factory=lambda: {"l1": [], "l2": [], "l3": []}
    )
    referred_by: Optional[ReferralUserBrief] = None


def parse_referral_start_param(start_param: str | None) -> int | None:
    """Return referrer telegram_id from ``ref_<digits>``, or None if invalid."""
    if not start_param:
        return None
    match = REFERRAL_START_PARAM_RE.fullmatch(start_param.strip())
    if match is None:
        return None
    return int(match.group(1))


def referral_code(telegram_id: int) -> str:
    return f"ref_{telegram_id}"


def build_referral_link(telegram_app_url: str, telegram_id: int) -> str | None:
    base = telegram_app_url.strip().rstrip("/")
    if not base:
        return None
    return f"{base}?startapp={referral_code(telegram_id)}"


async def attach_referrer(
    session: AsyncSession,
    account: TelegramAccount,
    referrer_tg_id: int,
) -> bool:
    """Attach referrer on first attribution. Returns True if written.

    No-op when already attributed, self-referral, or referrer does not exist.
    """
    if account.referred_by_telegram_id is not None:
        return False
    if referrer_tg_id == account.telegram_id:
        return False
    referrer = await session.get(TelegramAccount, referrer_tg_id)
    if referrer is None:
        return False
    account.referred_by_telegram_id = referrer_tg_id
    account.referred_at = utcnow()
    return True


def _brief(account: TelegramAccount) -> ReferralUserBrief:
    return ReferralUserBrief(
        telegram_id=account.telegram_id,
        username=account.username,
        first_name=account.first_name,
        referred_at=account.referred_at,
    )


async def _list_referred_by(
    session: AsyncSession, parent_ids: list[int], *, limit: int = LEVEL_LIST_CAP
) -> list[TelegramAccount]:
    if not parent_ids:
        return []
    result = await session.exec(
        select(TelegramAccount)
        .where(TelegramAccount.referred_by_telegram_id.in_(parent_ids))  # type: ignore[union-attr]
        .order_by(TelegramAccount.referred_at.desc(), TelegramAccount.telegram_id.desc())
        .limit(limit)
    )
    return list(result.all())


async def _ids_referred_by(session: AsyncSession, parent_ids: list[int]) -> list[int]:
    if not parent_ids:
        return []
    result = await session.exec(
        select(TelegramAccount.telegram_id).where(
            TelegramAccount.referred_by_telegram_id.in_(parent_ids)  # type: ignore[union-attr]
        )
    )
    return list(result.all())


async def get_referral_stats(
    session: AsyncSession,
    telegram_id: int,
    *,
    include_referred_by: bool = False,
    include_levels: bool = True,
) -> ReferralStats:
    """Compute L1/L2/L3 referral counts (and optionally capped lists)."""
    stats = ReferralStats()

    if include_referred_by:
        account = await session.get(TelegramAccount, telegram_id)
        if account is not None and account.referred_by_telegram_id is not None:
            referrer = await session.get(TelegramAccount, account.referred_by_telegram_id)
            if referrer is not None:
                stats.referred_by = ReferralUserBrief(
                    telegram_id=referrer.telegram_id,
                    username=referrer.username,
                    first_name=referrer.first_name,
                    referred_at=account.referred_at,
                )

    l1_ids = await _ids_referred_by(session, [telegram_id])
    stats.counts.l1 = len(l1_ids)
    if include_levels:
        stats.levels["l1"] = [_brief(a) for a in await _list_referred_by(session, [telegram_id])]

    l2_ids = await _ids_referred_by(session, l1_ids)
    stats.counts.l2 = len(l2_ids)
    if include_levels:
        stats.levels["l2"] = [_brief(a) for a in await _list_referred_by(session, l1_ids)]

    l3_ids = await _ids_referred_by(session, l2_ids)
    stats.counts.l3 = len(l3_ids)
    if include_levels:
        stats.levels["l3"] = [_brief(a) for a in await _list_referred_by(session, l2_ids)]

    return stats
