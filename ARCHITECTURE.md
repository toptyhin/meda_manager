# Архитектура

## Обзор

Три деплой-единицы + инфраструктура: **backend** (FastAPI, единственный владелец БД и файлов), **frontend** (React SPA — proof of concept, целевое состояние: админка проекта; собирается в статику, отдаётся backend'ом), **telegram-app** (React Mini App — пользовательский клиент, отдаётся nginx на `t.$DOMAIN`). Данные — Postgres 17; файлы (изображения, превью, видео) — на volume `/data`. Внешние зависимости — ИИ-провайдеры за интерфейсами `providers/base.py`: сейчас Agnes AI (медиа + чат, первый этап) и OpenAI-совместимые чат-провайдеры (Atlas, CrazyRouter, NordRouter); набор расширяется.

## Компоненты

### Backend (`backend/app/`)

- `main.py` — FastAPI app, lifespan (init_db → reap stale jobs → bootstrap invite → сид prompt-gen интентов), SPA-раздача из `frontend/dist`, `/api/health`.
- `config.py` — `Settings` (pydantic-settings, `.env` в корне репо); валидатор Postgres-only.
- `db.py` — async engine + session factory; `init_db()` = `create_all` + создание каталогов данных.
- `models.py` — SQLModel-модели: пользователи/инвайты/Telegram-аккаунты, категории/промпты/версии, изображения (`ImageKind`: reference/generated/draft), генерации и шаги ревью, видео и видео-джобы, стилевые пресеты, кэш моделей провайдеров, креды провайдеров, тарифы/подписки/кредитные транзакции, глобальные шаблоны prompt-gen (`AppPromptTemplate`) и их интенты (`PromptGenIntent`), сценарии экономики продаж (`SalesPlanScenario`).
- `api/` — REST-роутеры под префиксом `/api`: auth, invites, categories, prompts, styles, images, generations, video-generations, videos, media-ingress, assistant, providers, settings, limits, sales-scenarios, admin (tariffs, tg-users).
- `services/` — `jobs.py` (in-process воркеры генераций + reaper), `imaging.py`, `video.py`, `media_links.py` (HMAC-ссылки), `limits.py` (тарифы/квоты/кредиты), `provider_runtime.py`, `prompt_gen.py` («Придумай промпт»: шаблон + интенты), `telegram_auth.py` (initData HMAC), `catalog.py`.
- `providers/` — точка расширения под любые ИИ-модели: `base.py` (интерфейсы Chat/Image/VideoProvider), `agnes.py` (первый провайдер: медиа + чат + каталог), `openai_compat.py` (Atlas/CrazyRouter/NordRouter), `registry.py` (lazy-загрузка по id).

### Frontend (`frontend/src/`) — PoC → админка

- Статус: **proof of concept**; целевое состояние — админка проекта (пользователи, тарифы, провайдеры, контент). Админские страницы: Users, Tariffs, Models, Settings, Invites, PromptGen. SalesPlan (`/sales-plan`) — для всех авторизованных.
- `pages/` — Generate, Media, Video, Prompts, Styles, Models, Settings, PromptGen (шаблон «Придумай промпт»: версии, интенты, плейграунд), Invites, Users, Tariffs, SalesPlan (калькулятор воронки), Login/Register.
- `lib/salesPlan.ts` — дефолтный справочник цен моделей и чистая функция `computeSalesPlan` (unit-экономика на клиенте).
- `api/` — клиенты REST (react-query), auth-токен в `auth/`, состояние — zustand, тема — `theme/`.
- Авторизованная загрузка медиа — `AuthedImage`/`AuthedVideo` (fetch с JWT → blob).

### Telegram Mini App (`telegram-app/src/`)

- Упрощённый клиент: Create / Home / MediaLibrary / Profile; `twa/` — интеграция Telegram WebApp SDK, auth через initData.
- Прод: статика nginx (`telegram-app/nginx.conf`), `/api` проксируется на backend.

### Инфраструктура

- `Dockerfile` — multi-stage: сборка frontend (node:22-alpine, yarn) и telegram-app (npm) → runtime `python:3.12-slim` + uv; отдельный target `telegram-runtime` (nginx).
- `docker-compose.yml` — локально: app (512m) + postgres (256m, порт 5432 наружу для pytest).
- `docker-compose.prod.yml` — Traefik v3.7 (ACME HTTP-01, volume `letsencrypt`) перед app (180m), telegram (32m), postgres; сеть `media_manager_proxy`.
- `scripts/` — миграция SQLite→Postgres (`migrate-to-postgres*.sh`), `postgres-init/` (создание тестовой БД при первом init volume).

## Потоки данных

### Генерация изображения (с auto-review)

Клиент → `POST /api/generations` → запись `Generation(pending)` + `asyncio.create_task(run_generation)` → ответ `job_id`; дальше клиент поллит `GET /api/generations/{id}`. Воркер: Agnes image → файл в `/data/images` → при `auto_review` vision-ревю (Agnes 2.5 Flash) → i2i-правка/регенерация (не более `AUTO_REVIEW_MAX_FIXES`) → итоговый `Image(generated)`, промежуточные — `draft`. Шаги пишутся в `GenerationStep` для отображения прогресса.

### Генерация видео

Клиент → `POST /api/video-generations` → `VideoGeneration(pending)` + asyncio-task. Для режимов с исходниками (i2v, keyframes) backend строит подписанные HMAC-ссылки `/api/media-ingress/{id}` (требуется `PUBLIC_BASE_URL`, доступный серверам Agnes) → Agnes забирает картинки сам. Воркер поллит Agnes (`VIDEO_POLL_INTERVAL`/`VIDEO_POLL_TIMEOUT`), результат скачивается в `/data/videos`, запись `Video` появляется в библиотеке `/api/videos`.

### Аутентификация

- SPA: register (по инвайту) / login → JWT (72ч) → header `Authorization: Bearer`.
- Mini App: Telegram initData → `POST /api/auth/telegram` → HMAC-проверка по `TELEGRAM_BOT_TOKEN` → JWT; Telegram-аккаунт привязывается к пользователю, лимиты/кредиты считаются по telegram_id.

### Лимиты и тарифы

Платная операция → `limits.enforce` → эффективный план (подписка/дефолт) → проверка квоты за период и/или списание кредита (`CreditTransaction`) → исполнение; `GET /api/limits` отдаёт снапшот квот клиенту.

### «Придумай промпт»

Клиент (Mini App / админка) → `POST /api/assistant/suggest` (hint, mode, intent) → `prompt_gen.suggest_prompt`: последняя версия шаблона из `app_prompt_templates` (или код-дефолт) + инструкция интента из `prompt_gen_intents` → chat-провайдер → текст промпта. Админ управляет шаблоном (версии, restore append-only) и интентами (CRUD, сид дефолтов при пустой таблице) через `/api/settings/prompt-template*` и `/api/settings/prompt-gen-intents`; активные интенты для селекторов — `GET /api/assistant/suggest-intents`.

### Экономика продаж (sales-plan)

Страница `/sales-plan` (любой авторизованный пользователь) держит именованные сценарии в `sales_plan_scenarios` через CRUD `/api/sales-scenarios` (payload = JSON blob). Пересчёт unit-экономики на клиенте (`lib/salesPlan.ts`): микс тарифов (доли → ARPPU, COGS от max-модели тарифа), free-tier модели (COGS = max среди выбранных), реферальный %, воронка/маржа/break-even + SVG-графики. Backend не участвует в формулах. Не связан с runtime `limits.enforce`.

## Сквозные concerns

- **Файлы vs БД:** метаданные в Postgres, бинарники на `/data` (volume `mm-data`); превью генерируются Pillow при загрузке (отсюда повышенный лимит RAM в local compose).
- **CORS** — явный список из `CORS_ORIGINS` (в Docker по умолчанию `*`, в проде — оба домена).
- **Безопасность периметра** — на Traefik: HSTS, nosniff, frameDeny для SPA; для `t.$DOMAIN` вместо frameDeny — CSP `frame-ancestors` (WebApp в iframe).
- **Стойкость к рестартам:** джобы не персистентны — reaper помечает зависшие `interrupted`, состояние восстановлению не подлежит.

## Change log

### 2026-08-03 — начальная фиксация

- Задокументировано текущее состояние: Postgres-only runtime (миграция со SQLite завершена, см. `scripts/migrate-to-postgres.sh`), мульти-провайдерный чат, тарифы/кредиты, Telegram Mini App, прод на Traefik.

### 2026-08-03 — позиционирование

- Проект переформулирован: медиа-менеджер для **любых ИИ-моделей**, Agnes — первый этап; инвариант провайдер-агностики зафиксирован в `project.mdc` → «Провайдеры LLM».
- `frontend/` объявлен proof of concept, целевое состояние — админка проекта; пользовательский клиент — `telegram-app/`.

### 2026-08-03 — prompt-gen: версии и интенты

- «Придумай промпт» получил версионируемый глобальный шаблон (`app_prompt_templates`, restore append-only) и админ-управляемые интенты (`prompt_gen_intents`, сид дефолтов при старте); выбор интента — в админке и Mini App. Инварианты — `project.mdc` → «Придумай промпт (prompt-gen)».

### 2026-08-04 — экономика продаж

- Страница `/sales-plan` для всех авторизованных: CRUD сценариев (`SalesPlanScenario` / `/api/sales-scenarios`), клиентский калькулятор воронки (free tier, реферальный %, конверсии, справочник цен моделей). Инварианты — `project.mdc` → «Экономика продаж (sales-plan)».
