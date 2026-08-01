import json
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.config import Settings, get_settings
from app.db import async_session_factory
from app.models import (
    Generation,
    GenerationStatus,
    GenerationStep,
    Image,
    ImageKind,
)
from app.providers.agnes import AgnesProvider
from app.providers.base import GenerationError, ImageProvider, ImageReview
from app.services import imaging

logger = logging.getLogger(__name__)


async def reap_stale_jobs() -> int:
    async with async_session_factory() as session:
        result = await session.exec(
            select(Generation).where(
                Generation.status.in_([GenerationStatus.pending, GenerationStatus.running])
            )
        )
        jobs = list(result.all())
        for job in jobs:
            job.status = GenerationStatus.error
            job.error = "interrupted"
            job.finished_at = datetime.now(timezone.utc)
            session.add(job)
        if jobs:
            await session.commit()
        return len(jobs)


async def _load_reference_bytes(
    session: AsyncSession,
    user_id: int,
    ref_ids: list[int],
    parent_id: Optional[int],
    settings: Settings,
) -> list[bytes]:
    image_bytes: list[bytes] = []
    if parent_id:
        parent = await session.get(Image, parent_id)
        if parent and parent.user_id == user_id:
            image_bytes.append(imaging.read_image_bytes(parent.path, settings))

    for rid in ref_ids:
        if parent_id and rid == parent_id:
            continue
        img = await session.get(Image, rid)
        if img and img.user_id == user_id:
            image_bytes.append(imaging.read_image_bytes(img.path, settings))
    return image_bytes


async def _save_attempt_image(
    session: AsyncSession,
    *,
    user_id: int,
    data: bytes,
    settings: Settings,
    kind: ImageKind,
    prompt_version_id: Optional[int],
    parent_image_id: Optional[int],
    category_id: Optional[int],
    size: str,
    ratio: str,
) -> Image:
    saved = imaging.save_image(data, settings, prefix="gen" if kind == ImageKind.generated else "draft")
    image = Image(
        user_id=user_id,
        kind=kind,
        path=saved.path,
        thumb_path=saved.thumb_path,
        width=saved.width,
        height=saved.height,
        prompt_version_id=prompt_version_id,
        parent_image_id=parent_image_id,
        category_id=category_id,
        size=size,
        ratio=ratio,
    )
    session.add(image)
    await session.commit()
    await session.refresh(image)
    return image


def _passed(review: ImageReview, pass_score: int) -> bool:
    return bool(review.passed) and review.score >= pass_score


def _issues_summary(issues: list[dict]) -> str:
    parts: list[str] = []
    for item in issues:
        desc = str(item.get("description") or item.get("type") or "").strip()
        if desc:
            parts.append(desc)
    return "; ".join(parts)


async def _finish_job(
    session: AsyncSession,
    job: Generation,
    *,
    image: Image,
    review: Optional[ImageReview],
    review_error: Optional[str] = None,
) -> None:
    image.kind = ImageKind.generated
    image.prompt_version_id = job.prompt_version_id
    session.add(image)

    job.status = GenerationStatus.done
    job.result_image_id = image.id
    job.finished_at = datetime.now(timezone.utc)
    job.error = None
    if review is not None:
        job.review_score = review.score
        job.review_passed = review.passed
    elif review_error:
        # Fail-open: accepted without a successful review
        job.review_score = None
        job.review_passed = None
    session.add(job)
    await session.commit()


async def run_generation(job_id: int) -> None:
    settings = get_settings()
    provider: ImageProvider = AgnesProvider(settings=settings)
    try:
        async with async_session_factory() as session:
            job = await session.get(Generation, job_id)
            if job is None:
                return
            job.status = GenerationStatus.running
            session.add(job)
            await session.commit()

            params = json.loads(job.params or "{}")
            prompt_text = params.get("text") or ""
            size = params.get("size", "1K")
            ratio = params.get("ratio", "1:1")
            ref_ids: list[int] = params.get("reference_image_ids") or []
            parent_id = params.get("parent_image_id")
            category_id = params.get("category_id")
            auto_review = bool(job.auto_review or params.get("auto_review"))

            base_images = await _load_reference_bytes(
                session, job.user_id, ref_ids, parent_id, settings
            )

            if not auto_review:
                try:
                    result_bytes = await provider.generate(
                        prompt=prompt_text,
                        images=base_images,
                        size=size,
                        ratio=ratio,
                    )
                except GenerationError as exc:
                    job.status = GenerationStatus.error
                    job.error = exc.message
                    job.finished_at = datetime.now(timezone.utc)
                    session.add(job)
                    await session.commit()
                    return

                image = await _save_attempt_image(
                    session,
                    user_id=job.user_id,
                    data=result_bytes,
                    settings=settings,
                    kind=ImageKind.generated,
                    prompt_version_id=job.prompt_version_id,
                    parent_image_id=parent_id,
                    category_id=category_id,
                    size=size,
                    ratio=ratio,
                )
                job.status = GenerationStatus.done
                job.result_image_id = image.id
                job.finished_at = datetime.now(timezone.utc)
                job.error = None
                session.add(job)
                await session.commit()
                return

            # --- auto-review pipeline ---
            max_attempts = max(1, settings.auto_review_max_fixes + 1)
            pass_score = settings.auto_review_pass_score

            current_prompt = prompt_text
            current_images = list(base_images)
            action = "initial"

            best_image: Optional[Image] = None
            best_review: Optional[ImageReview] = None
            best_score = -1
            last_review_error: Optional[str] = None

            for attempt in range(1, max_attempts + 1):
                step = GenerationStep(
                    generation_id=job_id,
                    attempt=attempt,
                    action=action,
                    prompt_used=current_prompt,
                )
                session.add(step)
                await session.commit()
                await session.refresh(step)

                try:
                    result_bytes = await provider.generate(
                        prompt=current_prompt,
                        images=current_images,
                        size=size,
                        ratio=ratio,
                    )
                except GenerationError as exc:
                    step.error = exc.message
                    step.finished_at = datetime.now(timezone.utc)
                    session.add(step)
                    await session.commit()
                    if best_image is not None:
                        # Keep best previous attempt
                        await _finish_job(
                            session,
                            job,
                            image=best_image,
                            review=best_review,
                        )
                        return
                    job.status = GenerationStatus.error
                    job.error = exc.message
                    job.finished_at = datetime.now(timezone.utc)
                    session.add(job)
                    await session.commit()
                    return

                image = await _save_attempt_image(
                    session,
                    user_id=job.user_id,
                    data=result_bytes,
                    settings=settings,
                    kind=ImageKind.draft,
                    prompt_version_id=job.prompt_version_id,
                    parent_image_id=parent_id,
                    category_id=category_id,
                    size=size,
                    ratio=ratio,
                )
                step.image_id = image.id
                session.add(step)
                await session.commit()

                review: Optional[ImageReview] = None
                try:
                    review = await provider.review_image(prompt_text, result_bytes)
                    last_review_error = None
                except GenerationError as exc:
                    # Fail-open: accept current image without further fixes
                    last_review_error = exc.message
                    step.error = f"review failed: {exc.message}"
                    step.finished_at = datetime.now(timezone.utc)
                    session.add(step)
                    await session.commit()
                    await _finish_job(
                        session,
                        job,
                        image=image,
                        review=None,
                        review_error=exc.message,
                    )
                    return

                step.review_score = review.score
                step.review_passed = review.passed
                step.review_issues = json.dumps(review.issues, ensure_ascii=False)
                step.review_fix_mode = review.fix_mode
                step.finished_at = datetime.now(timezone.utc)
                session.add(step)
                await session.commit()

                if review.score > best_score:
                    best_score = review.score
                    best_image = image
                    best_review = review

                if _passed(review, pass_score):
                    await _finish_job(session, job, image=image, review=review)
                    return

                if attempt >= max_attempts:
                    break

                # Prepare next attempt
                if review.fix_mode == "regen":
                    summary = _issues_summary(review.issues)
                    if review.fix_instructions:
                        current_prompt = review.fix_instructions
                    else:
                        current_prompt = prompt_text
                        if summary:
                            current_prompt = (
                                f"{prompt_text}\n\nAvoid these issues: {summary}"
                            )
                    current_images = list(base_images)
                    action = "fix_regen"
                else:
                    # i2i fix
                    current_prompt = (
                        review.fix_instructions
                        or "Fix the visual defects while preserving composition, subject identity, and style."
                    )
                    current_images = [result_bytes]
                    action = "fix_i2i"

            # Exhausted attempts — promote best
            if best_image is None:
                job.status = GenerationStatus.error
                job.error = last_review_error or "no successful attempt"
                job.finished_at = datetime.now(timezone.utc)
                session.add(job)
                await session.commit()
                return

            if best_review is not None:
                # Mark as not passed if we exhausted retries
                best_review = ImageReview(
                    score=best_review.score,
                    passed=False,
                    issues=best_review.issues,
                    fix_mode=best_review.fix_mode,
                    fix_instructions=best_review.fix_instructions,
                )
            await _finish_job(session, job, image=best_image, review=best_review)

    except Exception:
        logger.exception("Generation job %s failed", job_id)
        async with async_session_factory() as session:
            job = await session.get(Generation, job_id)
            if job and job.status != GenerationStatus.done:
                job.status = GenerationStatus.error
                job.error = "internal error"
                job.finished_at = datetime.now(timezone.utc)
                session.add(job)
                await session.commit()
    finally:
        await provider.aclose()
