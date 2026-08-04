# AGENTS.md — инструкции для агента

## О проекте

**Media Manager** — лёгкий self-hosted медиа-менеджер для работы с **любыми ИИ-моделями**: генерация изображений и видео, чат-ассистенты, каталог промптов. Первый подключённый провайдер — [Agnes AI](https://www.agnes-ai.com/) (первый этап); архитектура рассчитана на добавление новых провайдеров через единые интерфейсы. Закрытый доступ по инвайтам, автопайплайн контроля качества генераций, тарифы/лимиты/кредиты, отдельный Telegram Mini App.

- **Backend** (`backend/`): FastAPI + SQLModel + **Postgres (asyncpg)**, Python ≥3.12, пакетный менеджер **uv**. Один процесс uvicorn, фоновые джобы — in-process asyncio.
- **Frontend** (`frontend/`): React 19 + Vite + Tailwind v4 + TypeScript, react-query + zustand, пакетный менеджер **yarn**. Пока **proof of concept**; целевое состояние — **админка проекта**. SPA отдаётся самим FastAPI из `frontend/dist`.
- **Telegram Mini App** (`telegram-app/`): отдельный Vite/React проект (**npm**), в проде — nginx-статика на `t.$DOMAIN`, auth через Telegram initData HMAC.
- **Деплой**: Docker Compose; прод — Traefik v3.7 + Let's Encrypt (`docker-compose.prod.yml`), локально — `docker-compose.yml` (app + postgres).
- **LLM**: цель — любые ИИ-модели за едиными интерфейсами провайдеров; Agnes — первый этап (медиа: `agnes-image-2.1-flash`, `agnes-video-v2.0`). Чат-ассистенты уже мульти-провайдерны (Agnes, Atlas, CrazyRouter, NordRouter).

## Ключевые требования

Полный текст инвариантов — в [`.cursor/rules/project.mdc`](.cursor/rules/project.mdc). Кратко:

1. **Postgres-only**: SQLite в runtime запрещён (валидатор в `app/config.py`); naive UTC через `utcnow()`; миграций нет — `create_all` при старте.
2. **Бюджет памяти**: app 180–512 МБ, postgres 256 МБ; никаких Redis/очередей/тяжёлых зависимостей.
3. **Джобы не переживают рестарт**: генерации — asyncio tasks с поллингом статуса клиентом; зависшие джобы reaper помечает `interrupted` при старте.
4. **Auto-review fail-open**: при сбое vision-ревю картинка принимается как есть; draft-кадры скрыты из медиа-грида.
5. **Платные операции** проходят через `app/services/limits.py::enforce` (тарифы/кредиты).
6. **Провайдер-агностика**: обращения к моделям — через интерфейсы `app/providers/base.py`, провайдеры подключаются через lazy-реестр `app/providers/registry.py`; специфика конкретного провайдера не выходит за пределы его модуля. Внешние HTTP-вызовы — через `httpx`, в тестах мокаются `respx`.
7. **Frontend — PoC → админка**: новый UI проектируется под сценарии администрирования; пользовательский клиент — Telegram Mini App.
8. **Пакетные менеджеры не смешивать**: backend = uv, frontend = yarn, telegram-app = npm.

## Чек-листы перед задачами

- **БД/модели:** перед изменением схемы читай `project.mdc` → «База данных». Дефолт: правишь `app/models.py`, существующие БД — ручной SQL, тесты только на БД с `test` в имени.
- **Новый API-эндпоинт:** роутер в `app/api/`, регистрация в `app/api/__init__.py`, auth через JWT-зависимости из `app/auth.py`; если операция платная — `limits.enforce`.
- **LLM/провайдеры:** перед новым провайдером или моделью читай `project.mdc` → «Провайдеры LLM». Дефолт: реализация интерфейса из `providers/base.py` + запись в реестре; Agnes-специфика живёт только в `providers/agnes.py`.
- **Генерации/джобы:** перед изменением пайплайна читай `project.mdc` → «Фоновые джобы». Не вводить долгоживущие задачи, требующие переживания рестарта.
- **Фронтенд:** PoC, перерастающий в админку — новый функционал проектируй под сценарии администрирования, а не массового пользователя. Страницы в `frontend/src/pages/`, запросы через react-query в `frontend/src/api/`; стили — Tailwind v4 (тема в `index.css`). Проверка: `yarn lint && yarn build`.
- **Экономика продаж (sales-plan):** доступна всем авторизованным; сценарии в БД, расчёт только на фронте — читай `project.mdc` → «Экономика продаж (sales-plan)». Не переносить формулы в backend; CRUD — `/api/sales-scenarios`; тарифы с долями → ARPPU, COGS от max-модели тарифа / max среди free-моделей — в `frontend/src/lib/salesPlan.ts`. Не смешивать с runtime-лимитами (`limits.enforce`).
- **Рефералы:** runtime-учёт только Telegram deep links — читай `project.mdc` → «Рефералы (runtime, Telegram)». Атрибуция один раз при первом логине (`start_param=ref_<tg_id>`), иммутабельна; L1/L2/L3 в `services/referrals.py`; API — `/api/referrals/me` и блок в админ-детали tg-user. Без выплат / без `CreditTransaction`. Не путать с веб-инвайтами и с плановым «реферальный %» в sales-plan. Для share-ссылок нужен `TELEGRAM_APP_URL`.
- **«Придумай промпт» (prompt-gen):** шаблон и интенты живут в БД и правятся из админки (`/prompt-gen`) — читай `project.mdc` → «Придумай промпт (prompt-gen)». Не хардкодить системные промпты suggest'а вне `services/prompt_gen.py`; новые плейсхолдеры — только с fallback в `render_prompt_gen_system`; сид интентов не должен затирать админские правки (вставка только в пустую таблицу).
- **Telegram Mini App:** не ломать HMAC-валидацию initData и CSP `frame-ancestors` в prod-роутере (`docker-compose.prod.yml`).
- **Деплой/env:** новые переменные окружения — сначала в `.env.example` с комментарием; CORS и `PUBLIC_BASE_URL` зависят от окружения (см. README).
- **Документация:** после существенных фич обновляй `project.mdc` (инварианты), этот файл (чек-листы) и `ARCHITECTURE.md` (структуру) одним проходом.

## Команды

```bash
# Backend (dev): требуется Postgres, см. DATABASE_URL в .env
cd backend && uv sync && uv run uvicorn app.main:app --reload --port 8000
cd backend && uv run pytest              # тесты (нужна БД *_test)

# Frontend (dev/proxy /api → :8000)
cd frontend && yarn && yarn dev

# Локальный стек целиком (app + postgres, http://localhost:8080)
docker compose up -d --build

# Прод (Traefik + LE, $DOMAIN и t.$DOMAIN)
docker compose -f docker-compose.prod.yml up -d --build
```
