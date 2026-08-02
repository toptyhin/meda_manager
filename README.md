# Media Manager

Лёгкий медиа-менеджер с генерацией изображений и видео через [Agnes AI](https://www.agnes-ai.com/).

- **Backend:** FastAPI + SQLite + uv (один процесс uvicorn, бюджет ~150 МБ RAM)
- **Frontend:** React + Vite + Tailwind v4 + yarn
- **Модели:** `agnes-image-2.1-flash` (изображения), `agnes-video-v2.0` (видео), `agnes-2.5-flash` (улучшение промптов)

## Возможности

- Закрытая регистрация по инвайт-коду (первый пользователь — admin)
- Загрузка референсных изображений
- Категории и версии промптов
- Кнопка «Улучшить промпт» (Agnes 2.5 Flash)
- Генерация и image-to-image редактирование (Agnes Image 2.1 Flash)
- Опциональный автопайплайн: генерация → оценка качества (Agnes 2.5 Flash vision) → i2i-правка или регенерация
- Медиа-грид: фильтры, сортировка, оценки 0–5
- Генерация видео (Agnes Video V2.0): Оживлятор (i2v), Режиссёр (t2v), Сторимейкер (keyframes)
- Пресеты для соцсетей, negative_prompt, seed, креативный ассистент для видео-промптов
- Отдельная библиотека видео на странице `/video`

## Быстрый старт

```bash
cp .env.example .env
# укажите AGNES_API_KEY и JWT_SECRET
```

### Backend

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

При первом запуске в логе появится **bootstrap invite** (или используется `BOOTSTRAP_INVITE` из `.env`).

### Frontend (dev)

```bash
cd frontend
yarn
yarn dev
```

Откройте http://localhost:5173 — проксирует `/api` на backend.

### Docker Compose (локально / без TLS)

Один контейнер: FastAPI + собранный SPA, SQLite на volume, лимит **180 МБ** RAM.

```bash
cp .env.example .env
# AGNES_API_KEY, JWT_SECRET, при желании BOOTSTRAP_INVITE
# для Docker: CORS_ORIGINS=*

docker compose up -d --build
```

Приложение: http://localhost:8080 (порт через `APP_PORT`).  
Данные: volume `mm-data` → `/data` (БД + изображения).  
Инвайт при старте — в `docker compose logs -f app`.

```bash
docker compose logs -f app
docker compose down
```

Образ: multi-stage (`node:22-alpine` → `python:3.12-slim-bookworm` + uv), без Redis/Postgres.

### Production (Traefik + Let's Encrypt)

Стек: **Traefik v3.7.8** (reverse proxy, HTTP→HTTPS) + приложение + Telegram Mini App.  
Сертификаты для `$DOMAIN` и `t.$DOMAIN` выпускаются и обновляются автоматически через ACME HTTP-01 (Let's Encrypt).

1. DNS `A`/`AAAA` для `DOMAIN` и `t.DOMAIN` указывает на сервер; порты **80** и **443** открыты.
2. В `.env` задайте:

```bash
DOMAIN=media.example.com
ACME_EMAIL=admin@example.com
CORS_ORIGINS=https://media.example.com,https://t.media.example.com
PUBLIC_BASE_URL=https://media.example.com
# AGNES_API_KEY, JWT_SECRET, …
```

`PUBLIC_BASE_URL` нужен для режимов видео с изображениями (i2v / keyframes): Agnes забирает исходники по подписанным ссылкам `/api/media-ingress/...`.

3. Запуск:

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f
```

- Media Manager: `https://$DOMAIN`
- Telegram Mini App: `https://t.$DOMAIN` (статика nginx, `/api` проксируется на backend)

Сертификаты хранятся в volume `letsencrypt`.  
Для тестовой выдачи без rate-limit LE задайте в `.env`:
`ACME_CA_SERVER=https://acme-staging-v02.api.letsencrypt.org/directory` (потом уберите и перевыпустите боевой сертификат).

В BotFather укажите Web App URL: `https://t.$DOMAIN`.

```bash
docker compose -f docker-compose.prod.yml down
```

### Production без Docker

```bash
cd frontend && yarn build
cd ../backend && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Статика из `frontend/dist` отдаётся самим FastAPI.

## Тесты

```bash
cd backend
uv run pytest
```

## API (кратко)

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/auth/register` | Регистрация + инвайт |
| POST | `/api/auth/login` | Логин → JWT |
| GET | `/api/auth/me` | Текущий пользователь |
| POST | `/api/invites` | Новый инвайт (admin) |
| CRUD | `/api/categories` | Категории промптов |
| CRUD | `/api/prompts` + `/versions` | Промпты и версии |
| POST | `/api/images/upload` | Загрузка референса |
| GET | `/api/images` | Список с фильтрами |
| POST | `/api/generations` | Старт генерации → job (`auto_review` включает автопайплайн) |
| GET | `/api/generations/{id}` | Статус job + шаги ревью (поллинг) |
| POST | `/api/video-generations` | Старт видео-генерации → async job |
| GET | `/api/video-generations/{id}` | Статус видео-job + progress (поллинг) |
| GET | `/api/videos` | Библиотека видео |
| GET | `/api/videos/{id}/file` | Скачать mp4 (auth) |
| GET | `/api/media-ingress/{id}` | Публичная HMAC-ссылка на изображение (для Agnes) |
| POST | `/api/assistant/improve` | Улучшение image-промпта |
| POST | `/api/assistant/video-improve` | Улучшение video-промпта |

### Автопайплайн качества

При `auto_review: true` джоба выполняет цикл:

1. Генерация изображения (`agnes-image-2.1-flash`)
2. Vision-ревью (`agnes-2.5-flash`): score 0–10, список дефектов, `fix_mode` (`i2i` / `regen`)
3. Если score ниже порога — правка (i2i) или регенерация, затем снова ревью
4. Пользователю выдаётся принятая или лучшая по score попытка; промежуточные кадры хранятся как `draft` и не показываются в медиа-гриде

Лимиты: `AUTO_REVIEW_MAX_FIXES` (число исправлений поверх первой попытки), `AUTO_REVIEW_PASS_SCORE` (минимальный score для приёмки). При сбое ревью картинка принимается как есть (fail-open).

## Переменные окружения

См. [`.env.example`](.env.example).
