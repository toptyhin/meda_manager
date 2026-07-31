from collections.abc import AsyncGenerator

from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.database_url,
    echo=False,
    connect_args={"check_same_thread": False},
)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


def _migrate(conn) -> None:
    # create_all does not alter existing tables; add missing columns here
    invites_cols = {c["name"] for c in inspect(conn).get_columns("invites")}
    if "is_blocked" not in invites_cols:
        conn.execute(
            text("ALTER TABLE invites ADD COLUMN is_blocked BOOLEAN NOT NULL DEFAULT 0")
        )

    prompts_cols = {c["name"] for c in inspect(conn).get_columns("prompts")}
    if "mode" not in prompts_cols:
        conn.execute(
            text("ALTER TABLE prompts ADD COLUMN mode VARCHAR(4) NOT NULL DEFAULT 't2i'")
        )


async def init_db() -> None:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.images_dir.mkdir(parents=True, exist_ok=True)
    settings.thumbs_dir.mkdir(parents=True, exist_ok=True)
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
        await conn.run_sync(_migrate)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        yield session
