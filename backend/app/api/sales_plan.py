"""CRUD for sales-funnel economics scenarios.

Payload structure is owned by the frontend calculator; this module only
persists named JSON blobs. Available to any authenticated user.
"""

from __future__ import annotations

import json
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.auth import get_current_user
from app.db import get_session
from app.models import SalesPlanScenario, User, utcnow
from app.schemas import (
    SalesPlanScenarioIn,
    SalesPlanScenarioOut,
    SalesPlanScenarioUpdate,
)

router = APIRouter()


def _loads_payload(raw: str) -> dict[str, Any]:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def _to_out(row: SalesPlanScenario) -> SalesPlanScenarioOut:
    return SalesPlanScenarioOut(
        id=row.id,  # type: ignore[arg-type]
        name=row.name,
        payload=_loads_payload(row.payload),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=list[SalesPlanScenarioOut])
async def list_scenarios(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[SalesPlanScenarioOut]:
    result = await session.exec(select(SalesPlanScenario).order_by(SalesPlanScenario.id))
    return [_to_out(row) for row in result.all()]


@router.post("", response_model=SalesPlanScenarioOut, status_code=status.HTTP_201_CREATED)
async def create_scenario(
    body: SalesPlanScenarioIn,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SalesPlanScenarioOut:
    existing = await session.exec(
        select(SalesPlanScenario).where(SalesPlanScenario.name == body.name)
    )
    if existing.first() is not None:
        raise HTTPException(status_code=409, detail="Scenario name already exists")

    row = SalesPlanScenario(
        name=body.name,
        payload=json.dumps(body.payload, ensure_ascii=False),
        updated_by=user.id,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return _to_out(row)


@router.patch("/{scenario_id}", response_model=SalesPlanScenarioOut)
async def update_scenario(
    scenario_id: int,
    body: SalesPlanScenarioUpdate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SalesPlanScenarioOut:
    row = await session.get(SalesPlanScenario, scenario_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Scenario not found")

    if body.name is not None and body.name != row.name:
        existing = await session.exec(
            select(SalesPlanScenario).where(SalesPlanScenario.name == body.name)
        )
        if existing.first() is not None:
            raise HTTPException(status_code=409, detail="Scenario name already exists")
        row.name = body.name
    if body.payload is not None:
        row.payload = json.dumps(body.payload, ensure_ascii=False)

    row.updated_by = user.id
    row.updated_at = utcnow()
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return _to_out(row)


@router.delete("/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scenario(
    scenario_id: int,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    row = await session.get(SalesPlanScenario, scenario_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Scenario not found")
    await session.delete(row)
    await session.commit()
