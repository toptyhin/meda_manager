# --- frontend build (alpine) ---
FROM node:22-alpine AS frontend
WORKDIR /src
COPY frontend/package.json frontend/yarn.lock ./
RUN yarn install --frozen-lockfile --network-timeout 120000
COPY frontend/ ./
RUN yarn build

# --- python deps (uv + slim) ---
FROM python:3.12-slim-bookworm AS deps
COPY --from=ghcr.io/astral-sh/uv:0.9.15 /uv /usr/local/bin/uv
WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock ./
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv
RUN uv sync --frozen --no-dev --no-install-project

# --- runtime ---
FROM python:3.12-slim-bookworm AS runtime

RUN useradd --create-home --uid 10001 --shell /usr/sbin/nologin app \
    && mkdir -p /data /app/frontend/dist \
    && chown -R app:app /data /app

WORKDIR /app

COPY --from=deps /app/.venv /app/.venv
COPY --chown=app:app backend/app ./backend/app
COPY --from=frontend --chown=app:app /src/dist ./frontend/dist

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app/backend \
    DATA_DIR=/data \
    FRONTEND_DIST=/app/frontend/dist \
    CORS_ORIGINS=*

USER app
EXPOSE 8000
VOLUME ["/data"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--proxy-headers", "--forwarded-allow-ips", "*"]
