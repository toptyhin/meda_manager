import json
import logging
from datetime import datetime, timezone

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.config import get_settings
from app.db import async_session_factory
from app.models import Generation, GenerationStatus, Image, ImageKind
from app.providers.agnes import AgnesProvider
from app.providers.base import GenerationError
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


async def run_generation(job_id: int) -> None:
    settings = get_settings()
    provider = AgnesProvider(settings=settings)
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

            image_bytes: list[bytes] = []
            if parent_id:
                parent = await session.get(Image, parent_id)
                if parent and parent.user_id == job.user_id:
                    image_bytes.append(imaging.read_image_bytes(parent.path, settings))

            for rid in ref_ids:
                if parent_id and rid == parent_id:
                    continue
                img = await session.get(Image, rid)
                if img and img.user_id == job.user_id:
                    image_bytes.append(imaging.read_image_bytes(img.path, settings))

            try:
                result_bytes = await provider.generate(
                    prompt=prompt_text,
                    images=image_bytes,
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

            saved = imaging.save_image(result_bytes, settings, prefix="gen")
            image = Image(
                user_id=job.user_id,
                kind=ImageKind.generated,
                path=saved.path,
                thumb_path=saved.thumb_path,
                width=saved.width,
                height=saved.height,
                prompt_version_id=job.prompt_version_id,
                parent_image_id=parent_id,
                category_id=category_id,
                size=size,
                ratio=ratio,
            )
            session.add(image)
            await session.commit()
            await session.refresh(image)

            job.status = GenerationStatus.done
            job.result_image_id = image.id
            job.finished_at = datetime.now(timezone.utc)
            job.error = None
            session.add(job)
            await session.commit()
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
