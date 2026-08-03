"""Quota enforcement for metered operations (image/video generations).

Policies (kept deliberately simple to retune without schema changes):
- Resource kinds: LimitResourceKind (image, video; extend to meter more).
- Periods: daily/weekly/monthly calendar windows in UTC, or total (all-time).
- Usage is counted from the generations/video_generations rows themselves
  (COUNT within the period window) — no separate counters, so usage can never
  diverge from reality. Atomicity comes from running the check in the same
  transaction as the job insert; on Postgres the account row is additionally
  locked with SELECT ... FOR UPDATE (silently omitted on SQLite).
- Consumption order: periodic quota first; once ANY quota row for the
  resource is exhausted, one generation costs max(credit_cost) of the
  violated rows from the credit balance. If the balance cannot cover it —
  HTTP 429 with a structured detail payload.
- Enforcement is fail-open: users without a Telegram account (pure web
  accounts), plans without a limit row for the resource, and accounts whose
  effective plan is absent (no subscription and no default plan) are not
  metered. Admins are always exempt.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import or_
from sqlmodel import func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import (
    CreditKind,
    CreditTransaction,
    Generation,
    LimitPeriod,
    LimitResourceKind,
    TariffLimit,
    TariffPlan,
    TelegramAccount,
    User,
    UserSubscription,
    VideoGeneration,
    utcnow,
)

_USAGE_TABLE = {
    LimitResourceKind.image: Generation,
    LimitResourceKind.video: VideoGeneration,
}


def period_window(period: LimitPeriod, now: datetime) -> tuple[datetime | None, datetime | None]:
    """(start, reset_at) of the current calendar window (naive UTC)."""
    if period == LimitPeriod.daily:
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return start, start + timedelta(days=1)
    if period == LimitPeriod.weekly:
        start = (now - timedelta(days=now.weekday())).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        return start, start + timedelta(days=7)
    if period == LimitPeriod.monthly:
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if start.month == 12:
            return start, start.replace(year=start.year + 1, month=1)
        return start, start.replace(month=start.month + 1)
    return None, None  # total


async def get_account_for_user(session: AsyncSession, user_id: int) -> TelegramAccount | None:
    result = await session.exec(
        select(TelegramAccount).where(TelegramAccount.linked_user_id == user_id)
    )
    return result.first()


async def get_effective_plan(
    session: AsyncSession, telegram_id: int, now: datetime | None = None
) -> tuple[TariffPlan | None, UserSubscription | None]:
    """Latest non-expired subscription's active plan, else the default plan."""
    now = now or utcnow()
    result = await session.exec(
        select(UserSubscription)
        .where(UserSubscription.telegram_id == telegram_id)
        .where(
            or_(
                UserSubscription.expires_at.is_(None),  # type: ignore[union-attr]
                UserSubscription.expires_at > now,
            )
        )
        .order_by(UserSubscription.created_at.desc(), UserSubscription.id.desc())  # type: ignore[union-attr]
    )
    sub = result.first()
    if sub is not None:
        plan = await session.get(TariffPlan, sub.plan_id)
        if plan is not None and plan.is_active:
            return plan, sub

    result = await session.exec(
        select(TariffPlan).where(TariffPlan.is_default == True, TariffPlan.is_active == True)  # noqa: E712
    )
    return result.first(), None


async def get_usage(
    session: AsyncSession,
    user_id: int,
    resource_kind: LimitResourceKind,
    period: LimitPeriod,
    now: datetime | None = None,
) -> int:
    now = now or utcnow()
    start, _ = period_window(period, now)
    model = _USAGE_TABLE[resource_kind]
    query = select(func.count()).select_from(model).where(model.user_id == user_id)
    if start is not None:
        query = query.where(model.created_at >= start)
    return int((await session.exec(query)).one())


async def get_balance(session: AsyncSession, telegram_id: int) -> int:
    result = await session.exec(
        select(func.coalesce(func.sum(CreditTransaction.amount), 0)).where(
            CreditTransaction.telegram_id == telegram_id
        )
    )
    return int(result.one())


async def enforce(
    session: AsyncSession,
    user: User,
    resource_kind: LimitResourceKind,
    now: datetime | None = None,
) -> None:
    """Raise 403/429 if the user may not start another generation, else return.

    When the periodic quota is exhausted, consumes credits instead (writes a
    negative ledger row in the caller's transaction).
    """
    if user.is_admin:
        return
    now = now or utcnow()

    # Row lock serializes concurrent requests on Postgres; SQLite ignores it.
    account = (
        await session.exec(
            select(TelegramAccount)
            .where(TelegramAccount.linked_user_id == user.id)
            .with_for_update()
        )
    ).first()
    if account is None:
        return  # pure web account — not metered
    if account.is_blocked:
        raise HTTPException(status_code=403, detail="Account is blocked")

    plan, _sub = await get_effective_plan(session, account.telegram_id, now)
    if plan is None:
        return  # enforcement not configured yet

    result = await session.exec(
        select(TariffLimit)
        .where(TariffLimit.plan_id == plan.id)
        .where(TariffLimit.resource_kind == resource_kind)
    )
    rows = list(result.all())

    violated: list[tuple[TariffLimit, int, datetime | None]] = []
    for row in rows:
        if row.max_count is None:
            continue  # unlimited
        used = await get_usage(session, user.id, resource_kind, row.period, now)  # type: ignore[arg-type]
        if used >= row.max_count:
            _, reset_at = period_window(row.period, now)
            violated.append((row, used, reset_at))

    if not violated:
        return

    cost = max(row.credit_cost for row, _used, _reset in violated)
    balance = await get_balance(session, account.telegram_id)
    if balance >= cost:
        session.add(
            CreditTransaction(
                telegram_id=account.telegram_id,
                amount=-cost,
                kind=CreditKind.consume,
                reason=f"{resource_kind.value} generation beyond quota",
            )
        )
        return

    row, used, reset_at = min(
        violated,
        key=lambda item: item[2] or datetime.max,
    )
    raise HTTPException(
        status_code=429,
        detail={
            "code": "quota_exceeded",
            "message": "Лимит генераций исчерпан",
            "resource_kind": resource_kind.value,
            "period": row.period.value,
            "limit": row.max_count,
            "used": used,
            "remaining": 0,
            "reset_at": reset_at.isoformat() if reset_at else None,
            "balance": balance,
            "credit_cost": cost,
        },
    )


async def quota_snapshot(
    session: AsyncSession, user: User, now: datetime | None = None
):
    """Read model for GET /api/limits/me: effective plan, per-resource
    remaining quota and credit balance."""
    from app.schemas import (  # noqa: PLC0415  (avoid circular import at module load)
        QuotaPlanOut,
        QuotaResourceOut,
        QuotaSnapshot,
    )

    now = now or utcnow()
    account = await get_account_for_user(session, user.id)  # type: ignore[arg-type]
    if account is None:
        return QuotaSnapshot(plan=None, resources=[], credits=0, enforcement_enabled=False)

    plan, sub = await get_effective_plan(session, account.telegram_id, now)
    balance = await get_balance(session, account.telegram_id)
    if plan is None:
        return QuotaSnapshot(plan=None, resources=[], credits=balance, enforcement_enabled=False)

    result = await session.exec(
        select(TariffLimit).where(TariffLimit.plan_id == plan.id)
    )
    resources: list[QuotaResourceOut] = []
    for row in result.all():
        used = await get_usage(session, user.id, row.resource_kind, row.period, now)  # type: ignore[arg-type]
        _, reset_at = period_window(row.period, now)
        remaining = None if row.max_count is None else max(0, row.max_count - used)
        resources.append(
            QuotaResourceOut(
                resource_kind=row.resource_kind,
                period=row.period,
                limit=row.max_count,
                used=used,
                remaining=remaining,
                reset_at=reset_at,
                credit_cost=row.credit_cost,
            )
        )

    return QuotaSnapshot(
        plan=QuotaPlanOut(
            id=plan.id,  # type: ignore[arg-type]
            name=plan.name,
            expires_at=sub.expires_at if sub else None,
        ),
        resources=resources,
        credits=balance,
        enforcement_enabled=True,
    )
