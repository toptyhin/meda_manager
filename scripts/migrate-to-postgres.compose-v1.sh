#!/usr/bin/env bash
# Ручной перенос данных из SQLite (файл /data/app.db в volume) в PostgreSQL.
#
# Версия для старого docker-compose v1 (бинарь `docker-compose`, не `docker compose`).
# Запускается ТОЛЬКО вручную: не вызывается из entrypoint, compose или CMD.
#
# Использование (из корня репозитория):
#   ./scripts/migrate-to-postgres.compose-v1.sh [--force] [-y|--yes]
#
#   --force    очистить целевые таблицы в Postgres перед копированием
#              (по умолчанию непустые таблицы пропускаются — скрипт идемпотентен)
#   -y, --yes  не спрашивать подтверждение
#
# Переменные окружения:
#   COMPOSE_FILE  compose-файл стека (по умолчанию docker-compose.prod.yml)
#   APP_SERVICE   имя сервиса приложения (по умолчанию app)
#   PG_SERVICE    имя сервиса postgres (по умолчанию postgres)
#   DOCKER_COMPOSE  путь к бинарю (по умолчанию docker-compose)
#
# Что делает:
#   1. Проверяет, что postgres запущен и отвечает pg_isready.
#   2. Делает резервную копию /data/app.db внутри volume (app.db.bak-<timestamp>).
#   3. В одноразовом контейнере из образа app запускает
#      backend/scripts/migrate_sqlite_to_pg.py — окружение сервиса (DATABASE_URL)
#      и volume с данными подставляются compose-файлом автоматически.
#
# Для docker compose v2 см. scripts/migrate-to-postgres.sh

set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
APP_SERVICE="${APP_SERVICE:-app}"
PG_SERVICE="${PG_SERVICE:-postgres}"
DOCKER_COMPOSE="${DOCKER_COMPOSE:-docker-compose}"

FORCE=0
ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    -y|--yes) ASSUME_YES=1 ;;
    -h|--help) sed -n '2,32p' "$0"; exit 0 ;;
    *) echo "Неизвестный аргумент: $arg (см. --help)" >&2; exit 2 ;;
  esac
done

if ! command -v "$DOCKER_COMPOSE" >/dev/null 2>&1; then
  echo "Ошибка: бинарь '$DOCKER_COMPOSE' не найден в PATH." >&2
  echo "Установите docker-compose v1 или укажите путь: DOCKER_COMPOSE=/path/to/docker-compose $0" >&2
  echo "Для docker compose v2 используйте: ./scripts/migrate-to-postgres.sh" >&2
  exit 1
fi

DC=("$DOCKER_COMPOSE" -f "$COMPOSE_FILE")

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Ошибка: compose-файл не найден: $COMPOSE_FILE" >&2
  exit 1
fi

# --- 1. postgres должен быть запущен и healthy ---
# В docker-compose v1 нет `ps --status running --services`; берём container id
# сервиса и проверяем State.Running через docker inspect.
pg_cid="$("${DC[@]}" ps -q "$PG_SERVICE" 2>/dev/null || true)"
if [[ -z "$pg_cid" ]]; then
  echo "Ошибка: сервис '$PG_SERVICE' не запущен (нет контейнера)." >&2
  echo "Сначала поднимите стек:  ${DC[*]} up -d" >&2
  exit 1
fi
if [[ "$(docker inspect -f '{{.State.Running}}' "$pg_cid" 2>/dev/null || echo false)" != "true" ]]; then
  echo "Ошибка: контейнер сервиса '$PG_SERVICE' ($pg_cid) не в состоянии Running." >&2
  echo "Сначала поднимите стек:  ${DC[*]} up -d" >&2
  exit 1
fi

echo "Ожидаю готовность postgres…"
ready=0
for _ in $(seq 1 30); do
  if "${DC[@]}" exec -T "$PG_SERVICE" pg_isready -q >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done
if [[ "$ready" -ne 1 ]]; then
  echo "Ошибка: postgres не отвечает pg_isready в течение 60 секунд." >&2
  exit 1
fi

# --- 2. файл SQLite должен существовать в volume ---
if ! "${DC[@]}" run --rm --no-deps -T "$APP_SERVICE" \
    sh -c 'test -f /data/app.db' 2>/dev/null; then
  echo "Ошибка: /data/app.db не найден в volume — мигрировать нечего." >&2
  exit 1
fi

echo
echo "Источник:  SQLite  /data/app.db (volume ${APP_SERVICE})"
echo "Приёмник:  Postgres из DATABASE_URL сервиса ${APP_SERVICE} (${COMPOSE_FILE})"
echo "Compose:   ${DOCKER_COMPOSE} (v1)"
[[ "$FORCE" -eq 1 ]] && echo "Режим:     --force (целевые таблицы будут очищены!)"
echo

if [[ "$ASSUME_YES" -ne 1 ]]; then
  read -r -p "Продолжить? [y/N] " answer
  case "$answer" in
    y|Y|yes|YES) ;;
    *) echo "Отменено."; exit 0 ;;
  esac
fi

# --- 3. резервная копия SQLite внутри volume ---
echo "Создаю резервную копию SQLite…"
"${DC[@]}" run --rm --no-deps -T "$APP_SERVICE" sh -c \
  'cp /data/app.db "/data/app.db.bak-$(date +%Y%m%d-%H%M%S)" && ls -la /data/app.db.bak-* | tail -3'

# --- 4. миграция ---
MIGRATE_ARGS=()
[[ "$FORCE" -eq 1 ]] && MIGRATE_ARGS+=(--force)

echo
echo "Запускаю миграцию…"
"${DC[@]}" run --rm --no-deps -T "$APP_SERVICE" \
  python -m scripts.migrate_sqlite_to_pg "${MIGRATE_ARGS[@]}"

echo
echo "Готово. Проверьте вывод выше: все таблицы должны быть OK."
echo "Приложение уже работает на Postgres (DATABASE_URL), перезапуск не обязателен,"
echo "но при желании: ${DC[*]} restart ${APP_SERVICE}"
