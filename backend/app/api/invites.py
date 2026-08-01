import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.auth import get_current_user
from app.db import get_session
from app.models import Invite, User
from app.schemas import InviteOut, InviteUpdate

router = APIRouter()


def _to_out(invite: Invite, usernames: dict[int, str]) -> InviteOut:
    return InviteOut(
        id=invite.id,
        code=invite.code,
        is_blocked=invite.is_blocked,
        created_by=invite.created_by,
        used_by=invite.used_by,
        created_at=invite.created_at,
        created_by_username=usernames.get(invite.created_by) if invite.created_by else None,
        used_by_username=usernames.get(invite.used_by) if invite.used_by else None,
    )


@router.get("", response_model=list[InviteOut])
async def list_invites(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[InviteOut]:
    result = await session.exec(select(Invite).order_by(Invite.created_at.desc()))
    invites = result.all()

    user_ids = {
        uid for inv in invites for uid in (inv.created_by, inv.used_by) if uid is not None
    }
    usernames: dict[int, str] = {}
    if user_ids:
        users_result = await session.exec(select(User).where(User.id.in_(user_ids)))
        usernames = {u.id: u.username for u in users_result.all() if u.id is not None}

    return [_to_out(inv, usernames) for inv in invites]


@router.post("", response_model=InviteOut)
async def create_invite(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> InviteOut:
    invite = Invite(code=secrets.token_urlsafe(12), created_by=user.id)
    session.add(invite)
    await session.commit()
    await session.refresh(invite)
    return _to_out(invite, {user.id: user.username} if user.id is not None else {})


@router.patch("/{invite_id}", response_model=InviteOut)
async def update_invite(
    invite_id: int,
    body: InviteUpdate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Invite:
    invite = await session.get(Invite, invite_id)
    if invite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")
    invite.is_blocked = body.is_blocked
    session.add(invite)
    await session.commit()
    await session.refresh(invite)
    return invite


@router.delete("/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_invite(
    invite_id: int,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    invite = await session.get(Invite, invite_id)
    if invite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")
    await session.delete(invite)
    await session.commit()
