"""Admin-only management of tariff plans and Telegram users (limits, credits).

All routes require an admin JWT; the only consumer is the web frontend.
"""

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlmodel import func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.auth import get_admin_user
from app.db import get_session
from app.models import (
    CreditKind,
    CreditTransaction,
    Generation,
    LimitPeriod,
    TariffLimit,
    TariffPlan,
    TelegramAccount,
    User,
    UserSubscription,
    VideoGeneration,
    utcnow,
)
from app.schemas import (
    CreditIn,
    CreditTransactionOut,
    QuotaPlanOut,
    SubscriptionIn,
    SubscriptionOut,
    TariffLimitOut,
    TariffPlanIn,
    TariffPlanOut,
    TariffPlanUpdate,
    TgUserDetail,
    TgUserListItem,
    TgUserListResponse,
    TgUserUpdate,
)
from app.services.limits import (
    get_balance,
    get_effective_plan,
    period_window,
    quota_snapshot,
)

tariffs_router = APIRouter()
tg_users_router = APIRouter()


# --- helpers ---


def _validate_limits(limits) -> None:
    seen: set[tuple[str, str]] = set()
    for row in limits:
        key = (row.resource_kind.value, row.period.value)
        if key in seen:
            raise HTTPException(
                status_code=400,
                detail=f"Duplicate limit for {key[0]}/{key[1]}",
            )
        seen.add(key)


def _plan_to_out(plan: TariffPlan, limits: list[TariffLimit]) -> TariffPlanOut:
    return TariffPlanOut(
        id=plan.id,  # type: ignore[arg-type]
        name=plan.name,
        description=plan.description,
        is_default=plan.is_active and plan.is_default,
        is_active=plan.is_active,
        created_at=plan.created_at,
        updated_at=plan.updated_at,
        limits=[TariffLimitOut.model_validate(row) for row in limits],
    )


async def _load_limits(session: AsyncSession, plan_id: int) -> list[TariffLimit]:
    result = await session.exec(
        select(TariffLimit).where(TariffLimit.plan_id == plan_id).order_by(TariffLimit.id)
    )
    return list(result.all())


async def _clear_default_plan(session: AsyncSession, except_id: Optional[int] = None) -> None:
    result = await session.exec(select(TariffPlan).where(TariffPlan.is_default == True))  # noqa: E712
    for other in result.all():
        if except_id is not None and other.id == except_id:
            continue
        other.is_default = False
        session.add(other)


async def _used_since(session: AsyncSession, user_id: Optional[int], start) -> int:
    if user_id is None:
        return 0
    images = select(func.count()).select_from(Generation).where(
        Generation.user_id == user_id, Generation.created_at >= start
    )
    videos = select(func.count()).select_from(VideoGeneration).where(
        VideoGeneration.user_id == user_id, VideoGeneration.created_at >= start
    )
    return int((await session.exec(images)).one()) + int((await session.exec(videos)).one())


async def _list_item(session: AsyncSession, account: TelegramAccount) -> TgUserListItem:
    now = utcnow()
    plan, sub = await get_effective_plan(session, account.telegram_id, now)
    balance = await get_balance(session, account.telegram_id)
    day_start, _ = period_window(LimitPeriod.daily, now)
    month_start, _ = period_window(LimitPeriod.monthly, now)
    return TgUserListItem(
        telegram_id=account.telegram_id,
        username=account.username,
        first_name=account.first_name,
        last_name=account.last_name,
        photo_url=account.photo_url,
        is_premium=account.is_premium,
        is_blocked=account.is_blocked,
        linked_user_id=account.linked_user_id,
        plan=QuotaPlanOut(
            id=plan.id,  # type: ignore[arg-type]
            name=plan.name,
            expires_at=sub.expires_at if sub else None,
        )
        if plan
        else None,
        balance=balance,
        used_today=await _used_since(session, account.linked_user_id, day_start),
        used_month=await _used_since(session, account.linked_user_id, month_start),
        first_seen_at=account.first_seen_at,
        last_seen_at=account.last_seen_at,
    )


# --- tariff plans ---


@tariffs_router.get("", response_model=list[TariffPlanOut])
async def list_tariffs(
    admin: Annotated[User, Depends(get_admin_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[TariffPlanOut]:
    result = await session.exec(select(TariffPlan).order_by(TariffPlan.id))
    return [_plan_to_out(plan, await _load_limits(session, plan.id)) for plan in result.all()]  # type: ignore[arg-type]


@tariffs_router.post("", response_model=TariffPlanOut, status_code=status.HTTP_201_CREATED)
async def create_tariff(
    body: TariffPlanIn,
    admin: Annotated[User, Depends(get_admin_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TariffPlanOut:
    _validate_limits(body.limits)
    existing = await session.exec(select(TariffPlan).where(TariffPlan.name == body.name))
    if existing.first() is not None:
        raise HTTPException(status_code=409, detail="Tariff name already exists")

    plan = TariffPlan(
        name=body.name,
        description=body.description,
        is_default=body.is_default,
        is_active=body.is_active,
    )
    session.add(plan)
    await session.flush()
    if body.is_default:
        await _clear_default_plan(session, except_id=plan.id)
    for row in body.limits:
        session.add(
            TariffLimit(
                plan_id=plan.id,  # type: ignore[arg-type]
                resource_kind=row.resource_kind,
                period=row.period,
                max_count=row.max_count,
                credit_cost=row.credit_cost,
            )
        )
    await session.commit()
    await session.refresh(plan)
    return _plan_to_out(plan, await _load_limits(session, plan.id))  # type: ignore[arg-type]


@tariffs_router.patch("/{plan_id}", response_model=TariffPlanOut)
async def update_tariff(
    plan_id: int,
    body: TariffPlanUpdate,
    admin: Annotated[User, Depends(get_admin_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TariffPlanOut:
    plan = await session.get(TariffPlan, plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="Tariff not found")

    if body.name is not None and body.name != plan.name:
        existing = await session.exec(select(TariffPlan).where(TariffPlan.name == body.name))
        if existing.first() is not None:
            raise HTTPException(status_code=409, detail="Tariff name already exists")
        plan.name = body.name
    if body.clear_description:
        plan.description = None
    elif body.description is not None:
        plan.description = body.description
    if body.is_active is not None:
        plan.is_active = body.is_active
        if not body.is_active:
            plan.is_default = False
    if body.is_default is not None:
        plan.is_default = body.is_default and plan.is_active
        if body.is_default and plan.is_active:
            await _clear_default_plan(session, except_id=plan.id)

    if body.limits is not None:
        _validate_limits(body.limits)
        for row in await _load_limits(session, plan.id):  # type: ignore[arg-type]
            await session.delete(row)
        await session.flush()
        for row in body.limits:
            session.add(
                TariffLimit(
                    plan_id=plan.id,  # type: ignore[arg-type]
                    resource_kind=row.resource_kind,
                    period=row.period,
                    max_count=row.max_count,
                    credit_cost=row.credit_cost,
                )
            )

    plan.updated_at = utcnow()
    session.add(plan)
    await session.commit()
    await session.refresh(plan)
    return _plan_to_out(plan, await _load_limits(session, plan.id))  # type: ignore[arg-type]


@tariffs_router.delete("/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tariff(
    plan_id: int,
    admin: Annotated[User, Depends(get_admin_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    plan = await session.get(TariffPlan, plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="Tariff not found")

    subs = int(
        (
            await session.exec(
                select(func.count())
                .select_from(UserSubscription)
                .where(UserSubscription.plan_id == plan_id)
            )
        ).one()
    )
    if subs > 0:
        # Soft delete: keep the assignment history readable.
        plan.is_active = False
        plan.is_default = False
        plan.updated_at = utcnow()
        session.add(plan)
    else:
        for row in await _load_limits(session, plan.id):
            await session.delete(row)
        await session.delete(plan)
    await session.commit()


# --- telegram users ---


@tg_users_router.get("", response_model=TgUserListResponse)
async def list_tg_users(
    admin: Annotated[User, Depends(get_admin_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    q: Optional[str] = Query(default=None, max_length=128),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> TgUserListResponse:
    query = select(TelegramAccount)
    count_query = select(func.count()).select_from(TelegramAccount)
    if q and q.strip():
        term = q.strip()
        conds = [
            func.lower(TelegramAccount.username).contains(term.lower()),
            func.lower(TelegramAccount.first_name).contains(term.lower()),
        ]
        if term.isdigit():
            conds.append(TelegramAccount.telegram_id == int(term))
        query = query.where(or_(*conds))
        count_query = count_query.where(or_(*conds))

    total = int((await session.exec(count_query)).one())
    result = await session.exec(
        query.order_by(TelegramAccount.last_seen_at.desc()).offset(offset).limit(limit)
    )
    items = [await _list_item(session, account) for account in result.all()]
    return TgUserListResponse(items=items, total=total)


@tg_users_router.get("/{telegram_id}", response_model=TgUserDetail)
async def get_tg_user(
    telegram_id: int,
    admin: Annotated[User, Depends(get_admin_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TgUserDetail:
    account = await session.get(TelegramAccount, telegram_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Telegram user not found")

    base = await _list_item(session, account)
    now = utcnow()

    subs_result = await session.exec(
        select(UserSubscription)
        .where(UserSubscription.telegram_id == telegram_id)
        .order_by(UserSubscription.created_at.desc(), UserSubscription.id.desc())  # type: ignore[union-attr]
    )
    subscriptions: list[SubscriptionOut] = []
    for sub in subs_result.all():
        plan = await session.get(TariffPlan, sub.plan_id)
        active = sub.expires_at is None or sub.expires_at > now
        subscriptions.append(
            SubscriptionOut(
                id=sub.id,  # type: ignore[arg-type]
                plan_id=sub.plan_id,
                plan_name=plan.name if plan else "?",
                created_by=sub.created_by,
                expires_at=sub.expires_at,
                created_at=sub.created_at,
                active=active,
            )
        )

    tx_result = await session.exec(
        select(CreditTransaction)
        .where(CreditTransaction.telegram_id == telegram_id)
        .order_by(CreditTransaction.created_at.desc(), CreditTransaction.id.desc())  # type: ignore[union-attr]
        .limit(20)
    )
    transactions = [CreditTransactionOut.model_validate(row) for row in tx_result.all()]

    quota = None
    if account.linked_user_id is not None:
        user = await session.get(User, account.linked_user_id)
        if user is not None:
            quota = await quota_snapshot(session, user, now)

    return TgUserDetail(
        **base.model_dump(),
        subscriptions=subscriptions,
        transactions=transactions,
        quota=quota,
    )


@tg_users_router.post("/{telegram_id}/subscription", response_model=SubscriptionOut, status_code=status.HTTP_201_CREATED)
async def assign_subscription(
    telegram_id: int,
    body: SubscriptionIn,
    admin: Annotated[User, Depends(get_admin_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SubscriptionOut:
    account = await session.get(TelegramAccount, telegram_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Telegram user not found")
    plan = await session.get(TariffPlan, body.plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="Tariff not found")
    if not plan.is_active:
        raise HTTPException(status_code=400, detail="Tariff is inactive")

    sub = UserSubscription(
        telegram_id=telegram_id,
        plan_id=body.plan_id,
        created_by=admin.id,
        expires_at=body.expires_at,
    )
    session.add(sub)
    await session.commit()
    await session.refresh(sub)
    return SubscriptionOut(
        id=sub.id,  # type: ignore[arg-type]
        plan_id=sub.plan_id,
        plan_name=plan.name,
        created_by=sub.created_by,
        expires_at=sub.expires_at,
        created_at=sub.created_at,
        active=True,
    )


@tg_users_router.post("/{telegram_id}/credits", response_model=CreditTransactionOut, status_code=status.HTTP_201_CREATED)
async def grant_credits(
    telegram_id: int,
    body: CreditIn,
    admin: Annotated[User, Depends(get_admin_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> CreditTransaction:
    account = await session.get(TelegramAccount, telegram_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Telegram user not found")
    if body.amount == 0:
        raise HTTPException(status_code=400, detail="amount must be non-zero")
    if body.kind == CreditKind.consume:
        raise HTTPException(status_code=400, detail="consume is system-generated")

    tx = CreditTransaction(
        telegram_id=telegram_id,
        amount=body.amount,
        kind=body.kind,
        reason=body.reason,
        created_by=admin.id,
    )
    session.add(tx)
    await session.commit()
    await session.refresh(tx)
    return tx


@tg_users_router.patch("/{telegram_id}", response_model=TgUserListItem)
async def update_tg_user(
    telegram_id: int,
    body: TgUserUpdate,
    admin: Annotated[User, Depends(get_admin_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TgUserListItem:
    account = await session.get(TelegramAccount, telegram_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Telegram user not found")
    account.is_blocked = body.is_blocked
    session.add(account)
    await session.commit()
    await session.refresh(account)
    return await _list_item(session, account)
