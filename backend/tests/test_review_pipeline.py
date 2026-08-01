import asyncio
import io
import json
from contextlib import contextmanager
from typing import Iterator, Optional
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from PIL import Image as PILImage
from sqlmodel import select

from app.config import get_settings
from app.db import async_session_factory
from app.models import Generation, GenerationMode, GenerationStatus, GenerationStep, Image, ImageKind
from app.providers.base import GenerationError, ImageReview
from app.services.jobs import run_generation


def _make_png(color: tuple[int, int, int] = (20, 40, 80), w: int = 64, h: int = 64) -> bytes:
    buf = io.BytesIO()
    PILImage.new("RGB", (w, h), color=color).save(buf, format="PNG")
    return buf.getvalue()


PNG_A = _make_png((10, 20, 30))
PNG_B = _make_png((200, 100, 50))
PNG_C = _make_png((80, 160, 40))


async def _create_job(
    auth_client: AsyncClient,
    *,
    auto_review: bool = True,
    text: str = "a cinematic test scene",
) -> int:
    """Insert a generation job directly (no background task)."""
    me = await auth_client.get("/api/auth/me")
    assert me.status_code == 200
    user_id = me.json()["id"]
    params = {
        "text": text,
        "size": "1K",
        "ratio": "1:1",
        "reference_image_ids": [],
        "parent_image_id": None,
        "category_id": None,
        "mode": "generate",
        "auto_review": auto_review,
    }
    async with async_session_factory() as session:
        job = Generation(
            user_id=user_id,
            mode=GenerationMode.generate,
            params=json.dumps(params, ensure_ascii=False),
            auto_review=auto_review,
        )
        session.add(job)
        await session.commit()
        await session.refresh(job)
        return job.id  # type: ignore[return-value]


def _pass_review(score: int = 9) -> ImageReview:
    return ImageReview(score=score, passed=True, issues=[], fix_mode="i2i", fix_instructions="")


def _fail_review(
    *,
    score: int = 4,
    fix_mode: str = "i2i",
    fix_instructions: str = "Fix the hands while preserving the pose",
    issues: Optional[list[dict]] = None,
) -> ImageReview:
    return ImageReview(
        score=score,
        passed=False,
        issues=issues
        or [{"type": "anatomy", "description": "distorted hands", "severity": "major"}],
        fix_mode=fix_mode,
        fix_instructions=fix_instructions,
    )


@contextmanager
def _mock_provider(generate: AsyncMock, review: AsyncMock) -> Iterator[None]:
    with (
        patch("app.services.jobs.AgnesProvider.generate", generate),
        patch("app.services.jobs.AgnesProvider.review_image", review),
        patch("app.services.jobs.AgnesProvider.aclose", AsyncMock()),
    ):
        yield


@pytest.mark.asyncio
async def test_auto_review_pass_first_attempt(auth_client: AsyncClient) -> None:
    job_id = await _create_job(auth_client)

    generate = AsyncMock(return_value=PNG_A)
    review = AsyncMock(return_value=_pass_review(8))

    with _mock_provider(generate, review):
        await run_generation(job_id)

    async with async_session_factory() as session:
        job = await session.get(Generation, job_id)
        assert job is not None
        assert job.status == GenerationStatus.done
        assert job.review_passed is True
        assert job.review_score == 8
        assert job.result_image_id is not None
        img = await session.get(Image, job.result_image_id)
        assert img is not None
        assert img.kind == ImageKind.generated
        steps = list(
            (
                await session.exec(
                    select(GenerationStep)
                    .where(GenerationStep.generation_id == job_id)
                    .order_by(GenerationStep.attempt)
                )
            ).all()
        )
        assert len(steps) == 1
        assert steps[0].action == "initial"
        assert steps[0].review_score == 8

    assert generate.await_count == 1
    assert review.await_count == 1
    review_url = review.await_args.args[1]
    assert review_url.startswith("http://test/api/media-ingress/")

    resp = await auth_client.get("/api/images")
    assert resp.status_code == 200
    kinds = {i["kind"] for i in resp.json()["items"]}
    assert "draft" not in kinds
    assert "generated" in kinds


@pytest.mark.asyncio
async def test_auto_review_fail_i2i_then_pass(auth_client: AsyncClient) -> None:
    job_id = await _create_job(auth_client)

    generate = AsyncMock(side_effect=[PNG_A, PNG_B])
    review = AsyncMock(side_effect=[_fail_review(fix_mode="i2i"), _pass_review(9)])

    with _mock_provider(generate, review):
        await run_generation(job_id)

    async with async_session_factory() as session:
        job = await session.get(Generation, job_id)
        assert job is not None
        assert job.status == GenerationStatus.done
        assert job.review_passed is True
        assert job.review_score == 9
        steps = list(
            (
                await session.exec(
                    select(GenerationStep)
                    .where(GenerationStep.generation_id == job_id)
                    .order_by(GenerationStep.attempt)
                )
            ).all()
        )
        assert len(steps) == 2
        assert steps[0].action == "initial"
        assert steps[1].action == "fix_i2i"
        assert steps[1].prompt_used == "Fix the hands while preserving the pose"

    assert generate.await_args_list[1].kwargs.get("images") == [PNG_A]


@pytest.mark.asyncio
async def test_auto_review_fail_regen_then_pass(auth_client: AsyncClient) -> None:
    job_id = await _create_job(auth_client, text="a red sports car at night")

    generate = AsyncMock(side_effect=[PNG_A, PNG_B])
    review = AsyncMock(
        side_effect=[
            _fail_review(
                fix_mode="regen",
                fix_instructions="A red sports car at night, neon reflections, no watermarks",
                issues=[
                    {
                        "type": "prompt_mismatch",
                        "description": "car is blue",
                        "severity": "major",
                    }
                ],
            ),
            _pass_review(8),
        ]
    )

    with _mock_provider(generate, review):
        await run_generation(job_id)

    async with async_session_factory() as session:
        job = await session.get(Generation, job_id)
        assert job is not None
        assert job.status == GenerationStatus.done
        assert job.review_passed is True
        steps = list(
            (
                await session.exec(
                    select(GenerationStep)
                    .where(GenerationStep.generation_id == job_id)
                    .order_by(GenerationStep.attempt)
                )
            ).all()
        )
        assert len(steps) == 2
        assert steps[1].action == "fix_regen"
        assert "red sports car" in steps[1].prompt_used.lower()

    assert generate.await_args_list[1].kwargs.get("images") == []


@pytest.mark.asyncio
async def test_auto_review_exhausted_returns_best(auth_client: AsyncClient) -> None:
    job_id = await _create_job(auth_client)

    generate = AsyncMock(side_effect=[PNG_A, PNG_B, PNG_C])
    review = AsyncMock(
        side_effect=[
            _fail_review(score=3, fix_mode="i2i"),
            _fail_review(score=6, fix_mode="i2i", fix_instructions="Improve lighting"),
            _fail_review(score=5, fix_mode="regen"),
        ]
    )

    with _mock_provider(generate, review):
        await run_generation(job_id)

    async with async_session_factory() as session:
        job = await session.get(Generation, job_id)
        assert job is not None
        assert job.status == GenerationStatus.done
        assert job.review_passed is False
        assert job.review_score == 6
        steps = list(
            (
                await session.exec(
                    select(GenerationStep)
                    .where(GenerationStep.generation_id == job_id)
                    .order_by(GenerationStep.attempt)
                )
            ).all()
        )
        assert len(steps) == 3
        assert job.result_image_id == steps[1].image_id
        img = await session.get(Image, job.result_image_id)
        assert img is not None
        assert img.kind == ImageKind.generated

    assert generate.await_count == 3


@pytest.mark.asyncio
async def test_auto_review_fail_open_on_review_error(auth_client: AsyncClient) -> None:
    job_id = await _create_job(auth_client)

    generate = AsyncMock(return_value=PNG_A)
    review = AsyncMock(side_effect=GenerationError("review exploded"))

    with _mock_provider(generate, review):
        await run_generation(job_id)

    async with async_session_factory() as session:
        job = await session.get(Generation, job_id)
        assert job is not None
        assert job.status == GenerationStatus.done
        assert job.result_image_id is not None
        assert job.review_passed is None
        steps = list(
            (
                await session.exec(
                    select(GenerationStep).where(GenerationStep.generation_id == job_id)
                )
            ).all()
        )
        assert len(steps) == 1
        assert steps[0].error is not None
        assert "review failed" in steps[0].error

    assert generate.await_count == 1


@pytest.mark.asyncio
async def test_auto_review_disabled_legacy_behavior(auth_client: AsyncClient) -> None:
    job_id = await _create_job(auth_client, auto_review=False)

    generate = AsyncMock(return_value=PNG_A)
    review = AsyncMock(return_value=_pass_review())

    with _mock_provider(generate, review):
        await run_generation(job_id)

    async with async_session_factory() as session:
        job = await session.get(Generation, job_id)
        assert job is not None
        assert job.status == GenerationStatus.done
        assert job.auto_review is False
        assert job.review_score is None
        steps = list(
            (
                await session.exec(
                    select(GenerationStep).where(GenerationStep.generation_id == job_id)
                )
            ).all()
        )
        assert steps == []

    assert generate.await_count == 1
    assert review.await_count == 0


@pytest.mark.asyncio
async def test_get_generation_includes_steps(auth_client: AsyncClient) -> None:
    job_id = await _create_job(auth_client)
    generate = AsyncMock(return_value=PNG_A)
    review = AsyncMock(
        return_value=_fail_review(
            score=4,
            issues=[{"type": "blur", "description": "soft focus", "severity": "minor"}],
        )
    )
    settings = get_settings()
    original = settings.auto_review_max_fixes
    settings.auto_review_max_fixes = 0
    try:
        with _mock_provider(generate, review):
            await run_generation(job_id)
    finally:
        settings.auto_review_max_fixes = original

    resp = await auth_client.get(f"/api/generations/{job_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["auto_review"] is True
    assert data["review_passed"] is False
    assert len(data["steps"]) == 1
    assert data["steps"][0]["review_issues"][0]["type"] == "blur"
    assert data["steps"][0]["thumb_url"]
    assert data["steps"][0]["file_url"]


@pytest.mark.asyncio
async def test_create_generation_api_accepts_auto_review(auth_client: AsyncClient) -> None:
    generate = AsyncMock(return_value=PNG_A)
    review = AsyncMock(return_value=_pass_review(9))

    with _mock_provider(generate, review):
        resp = await auth_client.post(
            "/api/generations",
            json={"text": "test auto review flag", "auto_review": True},
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["auto_review"] is True
        job_id = resp.json()["id"]
        for _ in range(20):
            g = await auth_client.get(f"/api/generations/{job_id}")
            if g.json()["status"] in ("done", "error"):
                break
            await asyncio.sleep(0.1)
        g = await auth_client.get(f"/api/generations/{job_id}")
        assert g.json()["status"] == "done"
        assert g.json()["review_passed"] is True
