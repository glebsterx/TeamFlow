# TeamFlow — Аудит и план приведения в порядок

> Дата: 2026-07-04. Версия в config.py: **0.8.25**. Контейнеры teamflow-backend/frontend остановлены ~2 недели.
> Проверено: ruff, pytest (6/24 падают), vitest (3/3 — но заглушки), tsc (~50 ошибок, build сломан), ручной аудит backend + frontend + документации.
> Дополняет AUDIT.md (13.06) и PROPOSALS.md. Нумерация: FIX-N.
>
> **Обновление 24.08.2026:** Все 29 пунктов закрыты. FIX-19 (CI) сделан без GitHub Actions —
> GitHub тут только хранилище кода; вместо workflow — `scripts/check.sh` + `.githooks/pre-push`.
> При деплое найдены и закрыты 3 регресса, не входившие в изначальный список: краш-луп
> backend при сетевых сбоях (бот ронял API-процесс через `main.py`), публичный `/bot-info`
> сломался после включения авторизации, отсутствующие `/team/*` роуты — см. git log.

---

## 🔴 Этап 1 — Критическое (чинить до любых фич)

- [x] **FIX-1 (S) — Нет миграции `tasks.is_idea` → задачи сломаны на существующей БД.**
  `app/domain/models.py:208` есть колонка, в `migrate.py` и `db.py::_run_migrations()` — нет. `create_all()` колонки в существующие таблицы не добавляет. Это причина 4 из 6 падающих тестов (`OperationalError: table tasks has no column named is_idea`). На проде после деплоя v0.8.24+ на старую БД create/list задач упадёт.
  **Fix:** добавить `ALTER TABLE tasks ADD COLUMN is_idea BOOLEAN DEFAULT 0` в `migrate.py` и `_run_migrations()`. Затем разово свериться: все колонки `models.py` ↔ список миграций (та же история была с `deleted_at`, AUD-2).

- [x] **FIX-2 (M) — Авторизация не применяется ВООБЩЕ.**
  В `app/web/app.py` определены `is_frontend_request()` / `is_frontend_api_path()` / `FRONTEND_PATHS` — но **нигде не вызываются** (мёртвый код). `get_current_user` (app/api/deps.py) и `verify_simple_token` (core/simple_auth.py) — 0 call sites. Ни один роут в routes.py / routes_auth.py / routes_system_settings.py не имеет auth-Depends. Открыто без токена: чтение/перезапись **bot-token** (`GET/PUT /settings/bot-token`), управление API-ключами, IDOR по `account_id` (профили, OAuth-линки, notification settings), весь CRUD.
  **Fix:** включить gate как middleware (или `dependencies=` на router), в первую очередь закрыть `/settings/*`, `/api/auth/*` (ownership check по JWT вместо `account_id` из query), API-ключи.

- [x] **FIX-3 (M) — `npm run build` сломан (~50 ошибок tsc).**
  Deploy через build невозможен, работает только dev/HMR. Основные группы: отсутствующий `@dnd-kit` (FIX-4), `Task.tags` нет в типе (`types/dashboard.ts`), `Sprint.is_deleted` нет в типе (`api/sprints.ts`), дубль поля `id` в `TelegramUser` (`AccountPage.tsx:35`), мёртвый `TreeView.tsx` (`Cannot find module '../types'`), неиспользуемые импорты React.
  **Fix:** добить до зелёного `npx tsc --noEmit`; типы `tags`/`is_deleted` добавить по реальной схеме API (это дрейф контракта, не «заткнуть»).

- [x] **FIX-4 (S) — `@dnd-kit/*` импортируется в `SprintsPage.tsx:9-24`, но не в package.json.**
  Чистая установка → SprintsPage не собирается/не работает. **Fix:** добавить `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` в dependencies (пакеты — по подтверждению, конвенция CLAUDE.md).

- [x] **FIX-5 (S) — Тесты бегут на PROD-базе.**
  `tests/conftest.py:15-20` использует `settings.DATABASE_URL` («Tests run on real data»). Каждый прогон пишет реальные строки в prod tasks.
  **Fix:** отдельный SQLite-файл/in-memory на тестовую сессию.

---

## 🟠 Этап 2 — Живые баги (NameError и сломанные фичи)

Backend:
- [x] **FIX-6 (S)** — `app/web/routes.py:3289-3348` (proxy endpoint): не определены `os`, `re`, `proxy_url` → NameError на fallback-пути чтения `.env` и при сохранении. Восстановить импорты/переменную.
- [x] **FIX-7 (S)** — `app/services/board_service.py:42`: `get_user_tasks()` использует несуществующий `assignee_id` → всегда NameError. Нужен lookup account по `telegram_id`.
- [x] **FIX-8 (S)** — `app/services/tasks/task_service.py:141`: NameError `task_id` — та же ошибка, что «исправленный» #368, живёт в копии из рефакторинга #333 (см. FIX-13).
- [x] **FIX-9 (S)** — `app/web/routes.py:311` + `webhook_service.py:42`: вебхуки через `asyncio.create_task` без хранения ссылки (риск GC, нарушение конвенции). В `change_task_status` уже инжектится `BackgroundTasks` — использовать его. Там же `routes.py:315` — оставшийся `print()` (в TASKS.md #367 помечен закрытым).
- [x] **FIX-10 (S)** — 2 падающих теста бьют несуществующие endpoints, а catch-all `@app.options("/{path:path}")` (`app.py:242`) маскирует 404 как 405: `GET /meetings/{id}/tasks` не существует (только POST/DELETE), reorder — реально `PATCH /sprints/{id}/tasks/reorder`. Починить тесты (или добавить GET-endpoint, если фича нужна) + сузить catch-all.

Frontend:
- [x] **FIX-11 (S)** — `NewTaskModal.tsx`: защита от потери данных #332 (`handleClose`, строки 85-90) написана, но НЕ подключена — Modal и «Отмена» зовут `onClose` напрямую. Клик по фону молча теряет ввод — ровно тот баг, который #332 «закрывал».
- [x] **FIX-12 (S)** — `AccountPage.tsx:274`: по таймауту линковки Telegram чистится `tg_login_token` (copy-paste из Login.tsx) вместо `tg_bind_token`. Плюс в `Login.tsx:52-76` и `AccountPage.tsx:254-276` polling (`setInterval`/`setTimeout`) без cleanup при unmount — утечка, запросы ещё 60с после ухода со страницы.

---

## 🟡 Этап 3 — Мёртвый код и незавершённый рефакторинг

- [x] **FIX-13 (M) — Рефакторинг #333 (Auth/Task/Bot изоляция) помечен DONE, но не завершён.**
  Новые деревья `repositories/tasks|auth/`, `services/tasks|auth/` **никем не импортируются** — весь рабочий код ходит в старые плоские модули. Копии уже разошлись: в новом `task_repository` нет пагинации, в новом `task_service` нет domain events (и живёт бага FIX-8). Заявленный `core/user_context.py` не существует.
  **Fix (решение):** либо довести — перевести call sites и удалить старые, либо удалить дубли и снять DONE в TASKS.md. Второе быстрее и безопаснее.
- [x] **FIX-14 (S)** — Удалить legacy backend: `app/models/user.py`, `app/models/task.py`, `app/core/database.py`, `app/core/security.py`, `app/api/deps.py`, `app/services/user_service.py` — не импортируются из main.py/app.py (но deps.py может пригодиться для FIX-2 — сначала решить auth).
- [x] **FIX-15 (S)** — Удалить мёртвый «v1»-слой frontend: `api/tasks.ts`, `api/users.ts`, `types/task.ts` (второй тип `Task` с другими enum!), `components/TaskCard/`, `TreeView.tsx`, неиспользуемые интерфейсы в `AccountPage.tsx:34-53`.
- [x] **FIX-16 (S)** — `ruff check app`: 208 ошибок (84 F401 unused imports, 12 F811, 8 bare except, 35 E712…). `ruff check --fix` закрывает 110 сразу; bare `except:` → `except Exception:`. После FIX-6..8 F821 должны уйти в ноль.
- [x] **FIX-17 (S)** — ESLint не работает: `npm run lint` падает — нет `.eslintrc*`, хотя все плагины в devDependencies. Добавить минимальный конфиг с `react-hooks/recommended` + `react-refresh/only-export-components`.

---

## 🟢 Этап 4 — Тесты и CI

- [x] **FIX-18 (M)** — Vitest-тесты — заглушки (`expect(true).toBe(true)` × 3), а в TASKS.md #353-357 помечены DONE. Написать реальные: `utils/dateUtils.ts` (parseUTC/getDueStatus — чистые функции, идеальные кандидаты), рендер TaskCard, close/discard-флоу модалок (поймал бы FIX-11).
- [x] **FIX-19 (M)** — CI (GitHub Actions): `ruff check` + `pytest` + `tsc --noEmit` + `vitest run` на каждый push. Уже предлагалось в PROPOSALS.md; поймал бы FIX-1, FIX-3, FIX-4 автоматически.
- [x] **FIX-20 (S)** — После FIX-1/5/10: добиться 24/24 зелёных backend-тестов, зафиксировать как baseline.

---

## 🔵 Этап 5 — Документация (привести к одной правде)

- [x] **FIX-21 (S) — Версии разъехались.** config.py=0.8.25; README/MEMORY.md/DEPLOYMENT=0.8.21; ROADMAP=0.8.22 (обновлялся 18.04); project-details=0.8.21 (внутри .env-пример 0.8.17); CHANGELOG — **два раздела v0.8.24** и нет 0.8.23→0.8.25 полностью. Fix: один проход — везде 0.8.25, в CHANGELOG слить дубль v0.8.24 и дописать v0.8.25.
- [x] **FIX-22 (M) — CLAUDE.md описывает другой проект.** Заявлены PostgreSQL + Alembic + структура `app/bot|api|schemas` + Vite frontend с `npm test`… Реально: SQLite + `migrate.py` + `app/telegram|web|domain|repositories`. Ссылается на несуществующие `CODE-REVIEW-CHECKLIST.md` и `.claude/agents/`. Переписать под реальность (это прямой источник ошибок ассистента: «SQLAlchemy сессия», «Alembic», пути).
- [x] **FIX-23 (S) — Источники правды не под git.** `CLAUDE.md`, `TASKS.md`, `DECISIONS.md` в .gitignore (при этом AUDIT.md/PROPOSALS.md — трекаются). Решить осознанно; рекомендация — трекать все три. `PROMPT.md` оставить в ignore (содержит живой API-ключ — в git не утёк, проверено).
- [x] **FIX-24 (S) — TASKS.md врёт о статусах.** #333 «DONE» (не завершён, FIX-13), #367 «все print убраны» (routes.py:315), #353-357 «тесты DONE» (заглушки), #313 «N/A». Снять ложные галочки при закрытии соответствующих FIX-ов.
- [x] **FIX-25 (S)** — ROADMAP.md: перенести v0.8.23–0.8.25 из «будущего» в «выполнено», актуализировать «Активный спринт» (сейчас активным помечен закрытый v0.9.0), убрать дубли секций v0.8.16.

---

## ⚪ Этап 6 — Из ROADMAP/PROPOSALS (после наведения порядка)

- [x] **FIX-26 (M)** — Персистентные напоминания `/remind` (AUD-8, единственный незакрытый пункт прошлого аудита): таблица `reminders` + восстановление при старте. Сейчас теряются при каждом рестарте.
- [x] **FIX-27 (L)** — Разбить гигантов:
  - `SettingsPage.tsx` 1905→339 строк, 9 модулей в `pages/settings/` (готовые независимые секции — чисто механический вынос)
  - `TaskModal.tsx` 1256→899 строк, 3 под-компонента в `modals/task-modal/`
  - `Dashboard.tsx` 1340→1055 строк, 4 режима просмотра задач (Kanban/List/Cards/Tree) в `components/` — единственный из трёх без готовых внутренних границ (общий стейт на весь дашборд), header/toolbar/оркестрация модалок сознательно оставлены как есть — дальнейшее дробление потребовало бы Context или prop-drilling через весь файл
  - Каждый шаг проверен `tsc`/`eslint`/`vitest` и живым рендером (headless Chromium) на проде с реальными данными
- [x] **FIX-28 (S)** — Sync file I/O в `/settings/proxy*` (`routes.py`) → `asyncio.to_thread`, заодно убрано тройное дублирование regex-парсинга `.env` (коммит `3333077`). `bootstrap.py` намеренно не тронут — бежит в отдельном процессе до spawn API, event loop воркера не блокирует. Хардкод порта в `constants/taskDisplay.ts` — сделано по-другому: вместо fallback-порта теперь везде относительный путь + vite/nginx-прокси на backend (заодно чинит mixed-content между HTTPS-страницей и HTTP-бэкендом, см. коммит `b557ca8`).
- [x] **FIX-29 (S)** — Docker healthcheck на `/health` в compose (из PROPOSALS.md). Заодно добавлен healthcheck для frontend (не было и его) и убран obsolete `version:`.

---

## Порядок работ (рекомендация)

1. **Этап 1 целиком** (FIX-1..5) — прод сейчас нельзя ни задеплоить (build), ни безопасно выставить наружу (auth), ни обновить БД (миграция).
2. Этап 2 (FIX-6..12) — точечные фиксы, по часу и меньше каждый.
3. Этап 3 (FIX-13..17) — чистка; сначала решение по #333 (рекомендация: удалить дубли).
4. Этап 4 (FIX-18..20) + сразу FIX-19 (CI), чтобы регрессии больше не копились незаметно.
5. Этап 5 (FIX-21..25) — документация одним проходом, зафиксировать версию 0.8.26 как «порядок наведён».
6. Этап 6 — по желанию, после стабилизации.

Усилия: S — часы, M — день-два, L — неделя+.
Детали frontend/backend находок — в отчётах аудита (этот файл — сводка + план).
