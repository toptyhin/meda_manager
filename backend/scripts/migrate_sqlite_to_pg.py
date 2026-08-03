"""One-off data migration: copy all rows from the SQLite database to PostgreSQL.

Run from the backend/ directory (so `app` is importable):

    python -m scripts.migrate_sqlite_to_pg \
        --sqlite /path/to/data/app.db \
        --pg postgresql+asyncpg://user:pass@host:5432/dbname

Defaults: --sqlite falls back to $SQLITE_PATH, then <data_dir>/app.db from app
settings; --pg falls back to $DATABASE_URL.

The script is idempotent: tables that already contain rows in the target are
skipped unless --force is given (which deletes target rows first, in reverse
FK order). Primary keys are preserved and Postgres sequences are reset to
MAX(id) afterwards. Back up the SQLite file before running against production.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

from sqlalchemy import MetaData, Table, func, select, text
from sqlalchemy.ext.asyncio import create_async_engine

# Insertion order respects FK dependencies between tables.
TABLES: list[str] = [
    "users",
    "invites",
    "categories",
    "prompts",
    "prompt_versions",
    "images",
    "generations",
    "generation_steps",
    "videos",
    "video_generations",
    "improve_prompt_versions",
    "style_presets",
    "provider_model_cache",
    "provider_credentials",
    "user_chat_preferences",
]

# Tables whose primary key is a serial/identity column named "id".
SERIAL_PK_TABLES: list[str] = [
    "users",
    "invites",
    "categories",
    "prompts",
    "prompt_versions",
    "images",
    "generations",
    "generation_steps",
    "videos",
    "video_generations",
    "improve_prompt_versions",
    "style_presets",
]

BATCH_SIZE = 500


async def _count(conn, table: Table) -> int:
    result = await conn.execute(select(func.count()).select_from(table))
    return int(result.scalar_one())


async def _reset_sequence(conn, table: str) -> None:
    row = await conn.execute(text("SELECT pg_get_serial_sequence(:tbl, 'id')"), {"tbl": table})
    seq = row.scalar_one_or_none()
    if seq is None:
        return
    await conn.execute(
        text(
            f"SELECT setval('{seq}', COALESCE((SELECT MAX(id) FROM {table}), 1), "
            f"(SELECT MAX(id) IS NOT NULL FROM {table}))"
        )
    )


async def migrate(sqlite_path: str, pg_url: str, force: bool) -> int:
    if not Path(sqlite_path).is_file():
        print(f"ERROR: source SQLite file not found: {sqlite_path}")
        return 1

    src_engine = create_async_engine(f"sqlite+aiosqlite:///{sqlite_path}", echo=False)
    dst_engine = create_async_engine(pg_url, echo=False)

    src_meta = MetaData()
    async with src_engine.connect() as conn:
        await conn.run_sync(src_meta.reflect)
    missing = [t for t in TABLES if t not in src_meta.tables]
    if missing:
        print(f"NOTE: tables absent in source, skipped: {', '.join(missing)}")

    # Target schema from the app's own metadata; create_all is idempotent.
    from app.models import SQLModel  # noqa: PLC0415

    dst_meta = SQLModel.metadata
    async with dst_engine.begin() as conn:
        await conn.run_sync(dst_meta.create_all)

    mismatches: list[str] = []
    async with dst_engine.begin() as dst:
        if force:
            for name in reversed(TABLES):
                table = dst_meta.tables.get(name)
                if table is not None:
                    await dst.execute(table.delete())
            print("FORCE: target tables wiped")

        for name in TABLES:
            src_table = src_meta.tables.get(name)
            dst_table = dst_meta.tables.get(name)
            if src_table is None or dst_table is None:
                continue

            target_count = await _count(dst, dst_table)
            if target_count > 0 and not force:
                print(f"SKIP {name}: target already has {target_count} rows")
                continue

            async with src_engine.connect() as src:
                src_count = await _count(src, src_table)
                copied = 0
                offset = 0
                while True:
                    result = await src.execute(
                        src_table.select().order_by(*src_table.primary_key.columns)
                        .limit(BATCH_SIZE)
                        .offset(offset)
                    )
                    batch = [dict(row) for row in result.mappings().all()]
                    if not batch:
                        break
                    await dst.execute(dst_table.insert(), batch)
                    copied += len(batch)
                    offset += len(batch)
                    if len(batch) < BATCH_SIZE:
                        break

            if copied != src_count:
                mismatches.append(f"{name}: source {src_count} != copied {copied}")
            else:
                print(f"OK {name}: {copied} rows")

        for name in SERIAL_PK_TABLES:
            if dst_meta.tables.get(name) is not None:
                await _reset_sequence(dst, name)
        print("Sequences reset")

    await src_engine.dispose()
    await dst_engine.dispose()

    if mismatches:
        print("MISMATCHES:")
        for m in mismatches:
            print(f"  {m}")
        return 1
    print("Migration complete")
    return 0


def main() -> int:
    from app.config import get_settings  # noqa: PLC0415

    settings = get_settings()
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--sqlite",
        default=os.environ.get("SQLITE_PATH", str(settings.data_dir / "app.db")),
        help="Path to the SQLite database file",
    )
    parser.add_argument(
        "--pg",
        default=settings.database_url,
        help="PostgreSQL async URL (or $DATABASE_URL)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Delete existing target rows before copying",
    )
    args = parser.parse_args()

    if not args.pg.startswith("postgresql"):
        print("ERROR: --pg/$DATABASE_URL must be a postgresql+asyncpg:// URL")
        return 1

    return asyncio.run(migrate(args.sqlite, args.pg, args.force))


if __name__ == "__main__":
    sys.exit(main())
