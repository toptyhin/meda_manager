import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.auth import (
    create_access_token,
    get_current_user,
    get_user_by_username,
    hash_password,
    verify_password,
)
from app.config import get_settings
from app.db import get_session
from app.models import (
    Category,
    Invite,
    Prompt,
    PromptMode,
    PromptSource,
    PromptVersion,
    TelegramAccount,
    User,
    utcnow,
)
from app.schemas import LoginRequest, RegisterRequest, TelegramAuthRequest, TokenResponse, UserOut
from app.services.referrals import attach_referrer, parse_referral_start_param
from app.services.telegram_auth import InitDataError, validate_init_data

router = APIRouter()
settings = get_settings()

DEFAULT_CATEGORY_NAMES = ("Семья", "Отпуск", "Мода")

# Preset prompts seeded for new accounts, structured per the Agnes Image 2.1 Flash
# prompting guide: t2i = [Subject] + [Scene] + [Style] + [Lighting] + [Composition] + [Quality];
# i2i = [Change Request] + [New Style/Scene] + [Add/Remove] + [Elements to Preserve].
# (category_name, title, mode, text)
DEFAULT_PROMPT_PRESETS: tuple[tuple[str, str, PromptMode, str], ...] = (
    (
        "Семья",
        "Семейный портрет в парке",
        PromptMode.t2i,
        "A warm lifestyle family portrait of four — two parents and their young children — "
        "sitting close together on a plaid picnic blanket in a sunlit autumn park, golden "
        "maple leaves drifting through the air, a wicker picnic basket and a golden retriever "
        "puppy beside them, candid laughter and natural relaxed poses, lifestyle photography "
        "style, soft golden-hour backlight with gentle rim light in their hair, 85mm f/1.8 "
        "shallow depth of field, medium-wide composition with the family slightly off-center, "
        "warm rich color palette, high visual density, photorealistic detail",
    ),
    (
        "Семья",
        "Зимний уют (по референсу)",
        PromptMode.i2i,
        "Transform this family photo into a cozy winter holiday scene: dress everyone in soft "
        "knitted sweaters in cream and deep red tones, add a decorated Christmas tree with "
        "warm glowing lights, a crackling fireplace in the background and a few wrapped gifts, "
        "while preserving the faces, identities, hairstyles and poses of every person, the "
        "original composition and the camera angle, soft warm indoor lighting, photorealistic, "
        "high detail",
    ),
    (
        "Отпуск",
        "Закат на побережье",
        PromptMode.t2i,
        "A breathtaking tropical beach at sunset, a lone traveler walking along wet mirror-like "
        "sand, turquoise waves with soft white foam, a few leaning palm trees and a small "
        "sailing boat on the horizon, dramatic sky in gradients of orange, pink and violet, "
        "cinematic travel photography, warm golden-hour light with long soft shadows, "
        "wide-angle composition with the horizon on the upper third line, vivid saturated "
        "colors, high visual density, ultra-detailed",
    ),
    (
        "Отпуск",
        "Кинематографичный закат (по референсу)",
        PromptMode.i2i,
        "Relight this travel photo into a dramatic golden-hour scene: replace the sky with a "
        "vivid sunset in orange and magenta tones, add warm directional sunlight, long soft "
        "shadows and a subtle lens flare, enrich the colors for a cinematic travel-magazine "
        "look, while preserving every person, their faces and poses, the main subject, the "
        "original composition and the camera angle, photorealistic, high detail",
    ),
    (
        "Мода",
        "Fashion editorial в студии",
        PromptMode.t2i,
        "A high-fashion editorial portrait of an elegant woman in an oversized structured "
        "beige trench coat and dark sunglasses, standing confidently with one hand in the "
        "pocket against a seamless terracotta studio backdrop, a leather handbag resting at "
        "her side, Vogue magazine style, soft diffused studio lighting with a warm key light "
        "and gentle shadow falloff, 85mm medium-shot composition centered with generous "
        "negative space, muted earthy color palette, crisp fabric texture, high visual "
        "density, photorealistic",
    ),
    (
        "Мода",
        "Вечерний образ (по референсу)",
        PromptMode.i2i,
        "Restyle the outfit in this fashion photo into an elegant evening look: change the "
        "clothing to a tailored black suit with a silk blouse, keep accessories minimal, shift "
        "the background to a deep charcoal studio backdrop with a soft spotlight, while "
        "preserving the person's face, identity, hairstyle, pose and body proportions, the "
        "original composition and the camera framing, editorial photography style, "
        "photorealistic, high detail",
    ),
)


async def _seed_default_content(session: AsyncSession, user: User) -> None:
    """Starter categories and prompt presets for a new account."""
    categories: dict[str, Category] = {}
    for name in DEFAULT_CATEGORY_NAMES:
        category = Category(user_id=user.id, name=name)  # type: ignore[arg-type]
        session.add(category)
        categories[name] = category
    await session.flush()

    for category_name, title, mode, text in DEFAULT_PROMPT_PRESETS:
        prompt = Prompt(
            user_id=user.id,  # type: ignore[arg-type]
            category_id=categories[category_name].id,  # type: ignore[arg-type]
            title=title,
            mode=mode,
        )
        session.add(prompt)
        await session.flush()
        session.add(
            PromptVersion(
                prompt_id=prompt.id,  # type: ignore[arg-type]
                version=1,
                text=text,
                source=PromptSource.manual,
            )
        )


@router.post("/register", response_model=TokenResponse)
async def register(
    body: RegisterRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TokenResponse:
    existing = await get_user_by_username(session, body.username)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username taken")

    invite_result = await session.exec(select(Invite).where(Invite.code == body.invite_code))
    invite = invite_result.first()
    if invite is None or invite.used_by is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid invite code")
    if invite.is_blocked:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invite code is blocked")

    user_count = (await session.exec(select(func.count()).select_from(User))).one()
    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        is_admin=user_count == 0,
    )
    session.add(user)
    await session.flush()

    invite.used_by = user.id
    session.add(invite)
    await _seed_default_content(session, user)
    await session.commit()

    token = create_access_token(user.id, user.username)
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TokenResponse:
    user = await get_user_by_username(session, body.username)
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return TokenResponse(access_token=create_access_token(user.id, user.username))


@router.post("/telegram", response_model=TokenResponse)
async def login_telegram(
    body: TelegramAuthRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TokenResponse:
    """Mini App login: validate initData, upsert the Telegram account and its
    shadow web user, return a regular JWT."""
    if not settings.telegram_bot_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Telegram auth is not configured",
        )
    try:
        identity = validate_init_data(
            body.init_data,
            settings.telegram_bot_token,
            settings.telegram_init_data_max_age,
        )
    except InitDataError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    account = await session.get(TelegramAccount, identity.telegram_id)
    if account is not None and account.is_blocked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is blocked")

    is_new = account is None
    if is_new:
        account = TelegramAccount(telegram_id=identity.telegram_id)
    account.username = identity.username
    account.first_name = identity.first_name
    account.last_name = identity.last_name
    account.photo_url = identity.photo_url
    account.language_code = identity.language_code
    account.is_premium = identity.is_premium
    account.last_seen_at = utcnow()

    user = None
    if account.linked_user_id is not None:
        user = await session.get(User, account.linked_user_id)
    if user is None:
        # Shadow web user owns the content; password is random and unknown —
        # login happens only via initData (or a future web-account link).
        user = User(
            username=f"tg_{identity.telegram_id}",
            password_hash=hash_password(secrets.token_urlsafe(32)),
            is_admin=False,
        )
        session.add(user)
        await session.flush()
        account.linked_user_id = user.id
        await _seed_default_content(session, user)

    # Referral attribution: only on first account creation, never rewritten.
    if is_new:
        referrer_id = parse_referral_start_param(identity.start_param)
        if referrer_id is not None:
            await attach_referrer(session, account, referrer_id)

    session.add(account)
    await session.commit()
    return TokenResponse(access_token=create_access_token(user.id, user.username))  # type: ignore[arg-type]


@router.get("/me", response_model=UserOut)
async def me(user: Annotated[User, Depends(get_current_user)]) -> User:
    return user
