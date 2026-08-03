import logging
import secrets
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import select

from app.api import api_router
from app.config import get_settings
from app.db import async_session_factory, init_db
from app.models import Invite
from app.services import prompt_gen
from app.services.jobs import reap_stale_jobs, reap_stale_video_jobs

logger = logging.getLogger(__name__)
settings = get_settings()

FRONTEND_DIST = Path(settings.frontend_dist).resolve()


def _frontend_file(relative: str) -> Path | None:
    """Return a file under FRONTEND_DIST, or None if missing / outside the dist root."""
    if not relative or relative.startswith("/") or ".." in Path(relative).parts:
        return None
    candidate = (FRONTEND_DIST / relative).resolve()
    try:
        candidate.relative_to(FRONTEND_DIST)
    except ValueError:
        return None
    return candidate if candidate.is_file() else None


def _looks_like_static_asset(path: str) -> bool:
    """Paths with a file extension are probes/assets — never fall back to index.html."""
    name = Path(path).name
    return bool(name) and "." in name


async def ensure_bootstrap_invite() -> None:
    async with async_session_factory() as session:
        result = await session.exec(select(Invite).where(Invite.used_by.is_(None)).limit(1))
        unused = result.first()
        if unused:
            logger.info("Unused invite available: %s", unused.code)
            return

        code = settings.bootstrap_invite or secrets.token_urlsafe(12)
        result = await session.exec(select(Invite).where(Invite.code == code).limit(1))
        if result.first():
            logger.warning("Bootstrap invite %s already used; no unused invites remain", code)
            return

        invite = Invite(code=code, created_by=None)
        session.add(invite)
        await session.commit()
        logger.warning("Bootstrap invite created: %s", code)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logging.basicConfig(level=logging.INFO)
    await init_db()
    n = await reap_stale_jobs()
    if n:
        logger.info("Reaped %s stale generation jobs", n)
    nv = await reap_stale_video_jobs()
    if nv:
        logger.info("Reaped %s stale video generation jobs", nv)
    await ensure_bootstrap_invite()
    async with async_session_factory() as session:
        seeded = await prompt_gen.seed_prompt_gen_intents(session)
    if seeded:
        logger.info("Seeded %d prompt-gen intents", seeded)
    yield


app = FastAPI(title="Media Manager", lifespan=lifespan)
_cors = settings.cors_origin_list
_allow_all = _cors == ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _allow_all else _cors,
    allow_credentials=not _allow_all,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router)


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}


if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def spa(full_path: str) -> FileResponse:
        # Existing built files (favicon.ico, robots.txt, …)
        file_path = _frontend_file(full_path)
        if file_path is not None:
            return FileResponse(file_path)
        # Scanners hit /.env, /var/.env, etc. — do not mask with SPA 200
        if _looks_like_static_asset(full_path):
            raise HTTPException(status_code=404, detail="Not found")
        return FileResponse(FRONTEND_DIST / "index.html")
