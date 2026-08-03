import os
import shutil
from collections.abc import AsyncGenerator
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

# Configure settings before importing app modules that cache settings
TEST_DATA = Path(__file__).resolve().parent / "_testdata"
if TEST_DATA.exists():
    shutil.rmtree(TEST_DATA)
TEST_DATA.mkdir(parents=True)
os.environ["DATA_DIR"] = str(TEST_DATA)
os.environ["JWT_SECRET"] = "test-secret-key-at-least-32-bytes-long"
os.environ["AGNES_API_KEY"] = "test-key"
os.environ["BOOTSTRAP_INVITE"] = "test-invite-code"
os.environ["CORS_ORIGINS"] = "http://localhost:5173"
os.environ["PUBLIC_BASE_URL"] = "http://test"
os.environ["TELEGRAM_BOT_TOKEN"] = "test-bot-token-123"
# Default test DB is SQLite under TEST_DATA. TEST_DATABASE_URL allows running
# the suite against Postgres (e.g. a throwaway docker container) to verify
# dialect compatibility. Guard against pointing it at a real database.
_test_db_url = os.environ.get("TEST_DATABASE_URL", "")
if _test_db_url:
    if "test" not in _test_db_url.rsplit("/", 1)[-1]:
        raise RuntimeError(
            "TEST_DATABASE_URL database name must contain 'test' "
            "(the suite drops and recreates all tables)"
        )
    os.environ["DATABASE_URL"] = _test_db_url

from app.config import get_settings

get_settings.cache_clear()

from app.db import async_session_factory, engine, get_session
from app.main import app


@pytest_asyncio.fixture(autouse=True)
async def setup_db() -> AsyncGenerator[None, None]:
    TEST_DATA.mkdir(parents=True, exist_ok=True)
    (TEST_DATA / "images").mkdir(exist_ok=True)
    (TEST_DATA / "thumbs").mkdir(exist_ok=True)
    (TEST_DATA / "videos").mkdir(exist_ok=True)

    await engine.dispose()
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
        await conn.run_sync(SQLModel.metadata.create_all)

    from app.models import Invite

    async with async_session_factory() as session:
        session.add(Invite(code="test-invite-code"))
        await session.commit()

    yield

    await engine.dispose()
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    async def _override() -> AsyncGenerator[AsyncSession, None]:
        async with async_session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = _override
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def auth_client(client: AsyncClient) -> AsyncClient:
    resp = await client.post(
        "/api/auth/register",
        json={
            "username": "alice",
            "password": "secret12",
            "invite_code": "test-invite-code",
        },
    )
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return client
