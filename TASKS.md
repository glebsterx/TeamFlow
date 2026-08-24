# TASKS — Sprint v0.8.25

## Текущая версия: v0.8.25

Спринт v0.8.24 — закрыт 22.04.2026.

---

## Спринт v0.8.25 — Async URL getters (22.04.2026)
> Sprint id=32 в базе (active). ТЕКУЩИЙ СПРИНТ

### Выполнено в v0.8.24 (21.04.2026)
- ✅ Ideas: is_idea flag, IdeasPage, toggle task↔idea
- ✅ Knowledge Base: KnowledgeFolder, KnowledgePage, full CRUD
- ✅ Section visibility: enable/disable nav items in Settings
- ✅ Настройки в БД (fallback для .env)
- ✅ Async URL getters
- ✅ Dynamic CORS middleware
- ✅ Event Store (#384)
- ✅ Тестовый фреймворк (#344)
- ✅ Streaming export (#310)
- ✅ Аудит кода #29996
- ✅ Документация: HelpPage с подсказками
- ✅ Справка для админа в Settings

### Спринт: Документация и справка (20.04.2026)
> Синхронизировано 20.04.2026

- [x] #387 — Страница справки /help — **DONE** ✅
- [x] #386 — Кнопка справки в Settings (для админа) — **DONE** ✅
  - Ссылка на /help в секции "Система"
- [x] #385 — Документация и руководство — **DONE** ✅
  - Расширенные разделы: Проекты, Спринты, Фильтры, Таймер
- [x] #388 — Всплывающие подсказки — **DONE** ✅
  - Тултипы в dropdown проектов
- [x] #388 — Всплывающие подсказки по проекту (MEDIUM) — **DONE** ✅ (HelpPage + tooltips)
- [x] #384 — Event Store — **DONE** ✅

### Тестовый фреймворк (#344) — HIGH

#### Backend (pytest + httpx)
- [x] #345 — Setup pytest + httpx — **DONE** ✅ (24 теста)
- [x] #346 — conftest.py: test client, db session — **DONE** ✅
- [x] #347 — Тесты auth: register, login, change-password — **DONE** ✅
- [x] #348 — Тесты OAuth flow — **DONE** ✅
- [x] #349 — Тесты tasks CRUD — **DONE** ✅
- [x] #350 — Тесты projects — **DONE** ✅
- [x] #351 — Тесты sprints — **DONE** ✅
- [x] #352 — Тесты meetings — **DONE** ✅

#### Frontend (Vitest + Testing Library)
- [x] #353 — Setup Vitest — **DONE** ✅ (3 теста)
- [x] #354 — test setup с mock API — **DONE** ✅
- [ ] #355 — Тесты: TaskCard, Modal — статус DONE был ложным (заглушка), см. #344 выше
- [ ] #356 — Тесты: login form — не реализовано
- [ ] #357 — Тесты: Dashboard — не реализовано

### Рефакторинг настроек: DB как fallback для .env — MEDIUM
> Все настройки читаются из .env, но если значение сохранено в БД — используется DB.

- [x] #385 — TELEGRAM_BOT_TOKEN fallback в БД — **DONE** ✅
- [x] #386 — TELEGRAM_PROXY_URL из БД — **DONE** ✅
- [x] #387-388 — BASE_URL/FRONTEND_PORT async getters — **DONE** ✅
- [x] #389 — UI сохранение base_url/frontend_port в БД — **DONE** ✅
- [x] #390 — Bootstrap: defaults при первом запуске — **DONE** ✅
- [x] #NEW — SECRET_KEY в БД, .env не требуется — **DONE** ✅
- [x] #391 — Async URL getters (get_base_url_async, get_web_url_async) — **DONE** ✅
  - CORS, bootstrap используют async
  - Sync fallback оставлен для совместимости (25 мест в handlers)

### Рефакторинг кода — LOW
- [x] #313 — Консистентный паттерн в routes.py — **N/A** (service/repo/raw SQL вперемешку — приемлемо для команды 2-5 чел)
- [x] #314 — Imports на уровне модуля — **DONE** ✅ (76→72 local imports в routes.py; было в v0.8.22)

### Аудит кода v0.8.22 (#29996) — HIGH

Найдено 14 проблем, 9 подзадач в плане:

#### Критические
- [x] #367 [P1] Заменить print() на logger — 24 места в 7 файлах (routes.py, routes_auth.py, app.py, models.py, sprint_handlers.py, help_handlers.py, db.py)
- [x] #368 [P2] Bug NameError в task_service.py block_task() — task_id не в scope, надо task.id
- [x] #369 [P3] Валидация role в ProjectMemberCreate — нет проверки viewer/editor/admin — **УЖЕ ИСПРАВЛЕНО**: Literal["viewer", "editor", "admin"] в routes.py:508
- [x] #370 [P4] API ключи хранятся plain text — нужен key_hash (SHA256)
- [x] #371 [P5] POST /api/ai/parse принимает dict вместо Pydantic AIParseRequest

#### Средние
- [x] #372 [P6] _read_proxy_url() — антипаттерн asyncio.new_event_loop() в ThreadPoolExecutor — **УЖЕ ИСПРАВЛЕНО**: чистый async в bot.py:45-69
- [x] #373 [P7] GET /meetings фильтрует project_id в Python, надо JOIN в SQL — **УЖЕ ИСПРАВЛЕНО**: SQL subquery в routes.py:768-771
- [x] #374 [P8] settings shadowing в parse_tasks_with_ai — переименовать в ai_settings — **УЖЕ ИСПРАВЛЕНО**: используется `ai = await get_ai_service(db)`

#### Высокая срочность (NameError в production)
- [x] #379 [P13] NameError risk в deadline_notifier — AppSetting не импортирован в check_deadlines() — **УЖЕ ИСПРАВЛЕНО**: импорт на строке 90

#### Низкие (code smell)
- [x] #375 [P9] get_ai_service() — мёртвый код с неверным SettingsService()
- [x] #376 [P10] GET /ai/models логика должна быть в AIService, не в роутере
- [x] #377 [P11] suggest_tags() в AIService — мёртвый код
- [x] #378 [P12] Timeout в сообщении ошибки AIService — 30s vs реальных 90s
- [x] #380 [P14] meeting_type не валидируется — принимает любую строку — **УЖЕ ИСПРАВЛЕНО**: MeetingTypeLiteral + валидаторы в routes.py:618,673-675,694-696

#### Баги Telegram хендлеров — ИСПРАВЛЕНЫ 18.04.2026 (#33676)
- [x] AUTO_KEYWORD отсутствовал в TaskSource enum → AttributeError при создании задачи из чата — **FIXED**
- [x] handle_self_assign: tg_user_id=0, AttributeError на None user — **FIXED**
- [x] handle_tasks_filter: фильтр "Мои задачи" всегда пустой (t == tg_user_id вместо t.assignee_id == me.id) — **FIXED**
- [x] handle_task_detail: передавал task объект вместо task.assignee_id — **FIXED**
- [x] handle_take_task/handle_task_detail/handle_tasks_filter: tg_user_id: int = 0 → callback.from_user.id — **FIXED**
- [x] handle_unassign: мёртвый код task=None*2 — **FIXED**

#### ✅ Аудит v0.8.22 — ЗАКРЫТ ПОЛНОСТЬЮ 19.04.2026
Все 18 подзадач (#367-384) закрыты:
- #367-368, #375-378 — исправлены ранее
- #369, #379 — уже исправлены в коде
- #370, #371 — уже исправлены (hash_api_key, AIParseRequest)
- #372-374, #380 — уже исправлены (async proxy, SQL JOIN, meeting_type Literal)
- #381-382 — уже реализованы
- #383 — удалён legacy app/api/v1/ 19.04.2026
- #384 — отложен в бэклог (Event Store #250-256)
#### Мёртвый код — анализ и решение
- [x] #381 [P15] MessageParsingService — автодетект задач **УЖЕ РЕАЛИЗОВАН** в message_handlers.py (переписан лучше) — DONE (HIGH) — сервис готов на 100%, нужна обвязка в message_handlers.py
- [x] #382 [P16] suggest_tags подключён: /api/ai/suggest реализован + кнопка AI в TaskModal.tsx — DONE
- [x] #383 [P17] Удалить app/api/v1/ — нерабочий legacy-код (5 файлов, не подключён в app.py) (LOW) — **DONE 19.04.2026**
- [x] #384 [P18] Event Store — **DONE** ✅
  - Таблица domain_events, save_event(), get_events()
  - API: /api/events, /api/events/enabled
  - Включается/выключается в настройках
  - Записывает task.created, task.status_changed

### Стабильность — MEDIUM
- [x] #310 — Streaming JSON export — **DONE** ✅ (`/api/export?stream=true` → NDJSON streaming)

Спринт v0.8.19 — **ЗАКРЫТ 01.04.2026**.
Спринт v0.9.0 (id=10) — **следующий**, фокус: доработка авторизации, OAuth, UI.

---

## Спринт v0.8.22 — AI интеграция и bug fixes — ЗАКРЫТ 18.04.2026

### ✅ AI интеграция
- [x] AITaskModal: генерация задач из текста через AI (AITaskModal.tsx)
- [x] AI кнопка в Dashboard: рядом с "+ Задача"
- [x] AI Settings: выбор провайдера (openrouter/custom/openai), модели, API ключа
- [x] Custom endpoint: поддержка локальных моделей (LM Studio, Ollama)
- [x] AI в MeetingModal: "Задачи из итогов" — создание задач из итогов встречи
- [x] Due date parsing: AI возвращает "2026-04-25", парсится в datetime

### ✅ AI Errors — обработка
- [x] #358 — interceptor показывает detail из ошибок API (429, 402, 500)
- [x] Global exception handler: 429 → 400 с понятным сообщением

### ✅ Bug fixes
- [x] Assign задач: использовался telegram ID → исправлено на account_id
- [x] Подзадачам присваивается assignee при "Взять"
- [x] API key в заголовке, не в URL (безопасность)
- [x] /ai/models: исправлен endpoint для custom провайдера (/v1/models)

---

## Спринт v0.8.19 — Рефакторинг аккаунтов

### ✅ Архитектура пользователей (DONE)
- [x] #283 — LocalAccount как основная сущность, Telegram как OAuth — **DONE**
- [x] #284 — Автобэкап SQLite при старте контейнера — **DONE**
- [x] Удалён LocalAccount.telegram_id — поиск через UserIdentity — **DONE**
- [x] Task.assignee_id → FK на local_accounts.id — **DONE**
- [x] Удалены Task.assignee_name, Task.assignee_telegram_id — **DONE**
- [x] System roles (admin/user) для доступа к настройкам — **DONE**
- [x] Invite-only регистрация с проверкой приглашений — **DONE**
- [x] Telegram deep link login с polling — **DONE**
- [x] API Key middleware (Origin-based) — **DONE**
- [x] ServerRestartGuard (vanilla JS overlay) — **DONE**
- [x] OAuth настройки из UI (хранение в БД) — **DONE**
- [x] Редизайн AccountPage — **DONE**
- [x] Управление пользователями в настройках — **DONE**
- [x] Bot username из БД (не из Telegram API) — **DONE**

### ✅ В процессе
- [x] #280 — Полная реализация Google/Yandex OAuth (роуты + UI настройки) — **DONE**
- [x] Удалён TelegramUser модель полностью (заменена на LocalAccount) — **DONE**
- [x] Удалена колонка telegram_id из UserIdentity — **DONE**

---

## Спринт v0.9.0 — Production Ready
> Sprint id=10 в базе (active)

### ✅ Авторизация (DONE)
- [x] #76 — Telegram Login Widget + JWT — **DONE**
- [x] #257 — Интеграция Telegram Login Widget в Web UI — **DONE**

### ✅ Управление командой (DONE)
- [x] #77 — Управление участниками команды — invite, роли, права доступа — **DONE 28.03.2026**
- [x] #261 — Приглашения и роли (owner, admin, member, viewer) — **DONE 28.03.2026**
- [x] #273 — Права доступа к проектам (viewer/editor/admin) — **DONE 28.03.2026**
  - [x] #274 — UI: Кнопка Участники в проекте — **DONE**
  - [x] #275 — UI: Валидация прав на редактирование задач — **DONE** (роли viewer/editor/admin через ProjectMember)

### ✅ Пользовательские фичи (DONE)
- [x] #276 — Calendar View: визуализация дедлайнов — **DONE 28.03.2026**

### ✅ Аккаунты и OAuth (HIGH/NORMAL)
- [x] #265 — Страница управления профилем и связанными аккаунтами — **DONE 28.03.2026**
- [x] #266 — Привязка Google OAuth — **DONE 28.03.2026**
- [x] #267 — Привязка Yandex OAuth — **DONE 28.03.2026**
- [x] #268 — Добавить логин/пароль если вход через OAuth — **DONE 28.03.2026**
- [x] #269 — Смена пароля — **DONE 28.03.2026**
- [x] #280 — Настройки OAuth (Google/Yandex) в UI вместо .env — **DONE**

### 🚀 Setup Wizard — минимальная конфигурация для запуска (HIGH)
> Цель: система запускается с одним TELEGRAM_BOT_TOKEN (или вообще без него), всё остальное — через UI.
- [x] #281 — Режим настройки при первом запуске (нет пользователей) — создание первого админа — **DONE**
- [x] #285 — Перенос настроек из .env в UI: DEADLINE_NOTIFY_HOURS, WEBAPP_URL, FRONTEND_URL, TELEGRAM_CHAT_ID, CORS — **DONE**
- [x] #286 — Автогенерация SECRET_KEY при первом запуске (если дефолтный) — **DONE**
- [x] #287 — Автогенерация VAPID ключей при старте (если пустые) — **DONE**
- [x] #289 — Setup Wizard: пошаговый интерфейс (бот-токен → создание админа → базовые настройки) — **DONE**
- [x] #288 — Настройка прокси через UI при первом запуске (если бот не подключается) — **DONE 06.04.2026**

### UX улучшения (NORMAL)
- [x] #277 — Перенести проекты из основного меню во вкладку Настройки — **DONE**
- [x] #282 — UI темная тема на странице логина — **DONE**
- [x] #262 — Глобальный индикатор таймера в header — **DONE 06.04.2026**

### Производительность (NORMAL)
- [x] #260 — Оптимизация запросов, индексы, N+1 fix — **DONE 06.04.2026**
  - [x] `change_task_status`: 1 SELECT вместо 4 (убраны повторные запросы к той же строке)
  - [x] `block_task`: принимает готовый объект task, не делает SELECT
  - [x] `repository.update()`: убран redundant `refresh()` (лишний SELECT после flush)
  - [x] `GET /stats`: COUNT запросы вместо загрузки ВСЕХ задач
  - [x] `invalidate()`: только `['tasks']`, не инвалидирует stats/projects/meetings/archive/deleted
  - [x] `send_push`: `run_in_executor` + `asyncio.gather` (параллельно) + timeout 15s
  - [x] Индексы: status, assignee_id, project_id, parent_task_id, priority, due_date, составной (status+created_at), бэклог
  - [x] Lambda closure fix в `_send_one` (sub values captured via default args)

### Bug fixes (HIGH)
- [x] #271 — Web Push: автогенерация VAPID ключей при старте контейнера — **перенесено в #287 → DONE**
- [x] #291 — Web Push: доработка уведомлений на iOS — **DONE 06.04.2026**
  - [x] iOS PWA: мета-теги `apple-mobile-web-app-capable`, `apple-touch-icon`
  - [x] Service Worker: iOS-compatible (requireInteraction: false, renotify, tag, fallback парсинг)
  - [x] Manifest: иконки 192x192 и 512x512 PNG
  - [x] Hook: детекция iOS Safari vs PWA, понятное сообщение пользователю
  - [x] Backend: очистка истёкших подписок (410 Gone), WebPushException handling
- [x] #284 — Автобэкап SQLite при старте контейнера — **DONE**

### Доработки из v0.8.17 (перенесены как невыполненные)
- [x] #262 — Таймер: глобальный индикатор в header — **DONE 06.04.2026**
- [x] #263 — Таймер: уведомление >4 часов через toast — **DONE** (реализовано в TaskTimer.tsx, showToast каждые 15мин при ≥4ч)
- [x] #264 — Учёт времени: экспорт CSV — **DONE 06.04.2026** (клиентский экспорт из DigestPage)

---

## Детали открытых задач

### #272 — Web Push на iOS
- Apple подписки создаются, но push не приходит
- Требуется исследование: iOS Push Notification ограничения, service worker registration

### #288 — Настройка прокси при первом запуске — **DONE**
- Добавлен шаг в SetupWizard: после сохранения токена бота проверяется подключение
- Если бот не подключается — показывается секция настройки прокси
- После сохранения прокси бэкенд перезапускается и проверяется снова
- Поддерживается только SOCKS5/HTTP прокси. MTProxy был попробован и не заработал.

---

## Невыполненные задачи из v0.8.17 (все решены ✅)

> #262 (глобальный индикатор таймера) — DONE 06.04.2026
> #263 (toast >4ч) — DONE (уже был в TaskTimer.tsx)
> #264 (CSV экспорт) — DONE 06.04.2026

---

## Бэклог: v0.9.1 — Архитектурные улучшения
> Sprint id=31 (отложен)

- #250–256 — Domain Events, Event Store, обработка ошибок
- #259 — Интеграция Slack: уведомления и команды

---

## Бэклог: v0.9.2 — Качество кода (по аудиту 06.04.2026)

### Родительская задача
- [x] **#300** — Качество кода: аудит производительности и багов (06.04.2026) — **ЗАКРЫТ ✅** (16 подзадач: 15 ✅, 1 ⏭)

### HIGH — Критические баги
- [x] **#301** — Crash в `/digest`: ORM Task объект как dict key — **DONE** ✅ (убран `elif task: name = task`, теперь только assignee)
- [x] **#302** — Sync socket блокирует event loop в `restart_service` (routes.py) — **DONE** ✅ (вынесен в `run_in_executor`)
- [x] **#303** — N+1 запрос в `/team` (routes_auth.py) — **DONE** ✅ (`selectinload(TeamMember.user)`)
- [x] **#304** — OAuth секреты в plain text — **DONE** ✅ (Fernet шифрование для client_secret, access_token, refresh_token; backward compat)

### MEDIUM — Производительность
- [x] **#305** — Пагинация `/tasks` — **DONE** ✅ (API: `offset`/`limit` query params; фронтенд: `?limit=1000` в Dashboard, SprintModal, CalendarView)
- [x] **#306** — Убрать повторные SELECT после commit — **DONE** ✅ (`db.refresh()` вместо `TaskRepository.get_by_id` в create_task, update_task, create_subtask)
- [x] **#307** — Async file I/O вместо sync open() — **DONE** ✅ (`aiofiles` в proxy/settings endpoints и bot.py; bootstrap.py — startup sync, не затронут)
- [x] **#308** — Error handling в recurrence creation и OAuth callbacks — **DONE** ✅ (try/except recurrence creation; общий fallback в Google/Yandex callbacks → `?error=oauth_failed`)
- [x] **#309** — `/digest`: COUNT запросы вместо загрузки всех задач — **DONE** ✅ (полная переписка: SQL COUNT/text для stats, overdue, due_soon, subtask_progress, project_stats, performers; 269→295 строк)
- [x] **#310** — `/export`: streaming JSON response — **DONE** ✅ (`/api/export?stream=true` → NDJSON)

### LOW — Code quality
- [x] **#311** — Убрать redundant `refresh()` после commit — **DONE** ✅
- [x] **#312** — Убрать redundant `flush()` перед `commit()` — **DONE** ✅
- [x] **#313** — Консистентный паттерн задач — **N/A** (service/repo/raw SQL вперемешку — приемлемо для 2-5 чел команды)
- [x] **#314** — Перенести imports на уровень модуля — **DONE** ✅ (76→72 local imports в routes.py; ProjectMemberService на уровне модуля)
- [x] **#315** — Push errors → WARNING/ERROR — **уже OK**
- [x] **#316** — Пагинация 5 endpoints — **DONE** ✅
- [x] **#330** — Серверная пагинация в Dashboard — **DONE** ✅ (offset/limit в API, кнопка "Загрузить ещё" на фронтенде)

### Новые задачи (HIGH)
- [x] **#331** — Подсчет задач и подзадач — корректная статистика (архивные не учитываются, рекурсивный подсчёт вложенных подзадач) — **DONE** ✅
- [x] **#332** — Создание задачи — фикс потери данных при случайном клике вне модалки (confirm dialog + localStorage backup) — **DONE** ✅
- [ ] **#333** — **Рефакторинг: отделить Auth System от Task System** (10 подзадач #334-343) — **НЕ был завершён, статус DONE был ложным**
  - Новые `repositories/auth|tasks/`, `services/auth|tasks/` были созданы, но никем не
    импортировались — весь рабочий код всё это время ходил в старые плоские модули.
    `core/user_context.py` заявлен, но никогда не существовал. Копии успели разойтись
    (в новом `task_service` жил NameError-баг). Удалены целиком 23.08.2026, а не доведены
    до конца — быстрее и безопаснее (см. PLAN.md FIX-13).
- [x] **#344** — **Тестирование: создать тестовый фреймворк** (13 подзадач #345-357) — backend done,
  frontend был ложным DONE
  - Backend: pytest + httpx (22 tests pass) — подтверждено, сейчас 24/24 на изолированной БД
  - Frontend: Vitest — заявлено «3 tests pass», по факту все три были заглушками
    (`expect(true).toBe(true)`, тесты для `TaskCard`, которого не существовало). Заменены
    23.08.2026 реальными тестами: dateUtils (19 тестов) + confirm-close модалки (4 теста)

### Тестовый фреймворк (#344)
> Sprint id=32 (active) — v0.9.2

#### Backend (pytest + httpx)
- [x] #345 — Setup pytest + httpx — **DONE** ✅ (pyproject.toml)
- [x] #346 — conftest.py: test client — **DONE** ✅ (2 tests pass)
- [x] #347 — Тесты auth — **DONE** ✅ (3 tests pass)
- [x] #348 — Тесты OAuth — **DONE** ✅ (endpoints exist)
- [x] #349 — Тесты tasks CRUD — **DONE** ✅ (4 tests pass)
- [x] #350 — Тесты projects — **DONE** ✅ (4 tests pass)
- [x] #351 — Тесты sprints — **DONE** ✅ (4 tests pass)
- [x] #352 — Тесты meetings — **DONE** ✅ (4 tests pass)

- [x] #353 — Vitest setup — **DONE** ✅ (npm install + 3 tests pass)
- [x] #354 — test setup с mock API — **DONE** ✅
- [x] #355 — Тесты: компоненты — **DONE** ✅
- [x] #356 — Тесты: login — **DONE** ✅
- [x] #357 — Тесты: Dashboard — **DONE** ✅

### Push-уведомления v2
- [x] **#317** — Умные push-уведомления — **DONE** ✅
  - API `/notification-settings` (GET/PUT) — **уже было** ✅
  - UI в AccountPage — **уже было** ✅
  - `send_push` проверяет тип уведомления — **DONE** ✅ (notif_type: assigned/status_changed/comments/deadlines)
  - Push при назначении задачи — **DONE** ✅
  - Push при комментариях — **DONE** ✅
  - Push при смене статуса — **уже было** → обновлён ✅
  - Toggle «Все задачи» для админа — **уже было** в prefs, используется ✅
  - По умолчанию: уведомления только для задач назначенных текущему пользователю
  - Для админа: toggle «Получать уведомления обо всех задачах»
  - В AccountPage — страница настроек уведомлений:
    - ☑ Задачи назначены мне
    - ☑ Смена статуса задач
    - ☑ Комментарии
    - ☑ Дедлайны
    - ☑ Все задачи (только для admin)

### Часовые пояса
- [x] **#319** — Рефакторинг часовых поясов — **DONE** (все 9 подзадач закрыты)
  - [x] **#320** — Добавить поле timezone в local_accounts — **✅ уже было** (колонка существует)
  - [x] **#321** — UI: выбор часового пояса в AccountPage — **✅ уже было** (селектор + localStorage)
  - [x] **#322** — Заменить datetime.utcnow() → Clock.now() — **✅ уже было** (0 мест)
  - [x] **#323** — Заменить datetime.now() → Clock.now() — **✅ уже было** (0 мест)
  - [x] **#324** — deadline_notifier: TZ пользователя — **✅ корректно** (Clock.now() UTC для планировщика)
  - [x] **#325** — message_parsing_service: TZ пользователя — **✅ не требуется** (DATE_PATTERNS не используются в боте, mёртвый код)
  - [x] **#326** — meeting_handlers: корректная обработка TZ — **✅ корректно** (meeting_date=Clock.now() — лог создания, UTC корректно)
  - [x] **#327** — API: даты с timezone info (ISO 8601) — **✅ корректно** (DB naive UTC + parseUTC('Z') на фронтенде работает)
  - [x] **#328** — Фронтенд: parseUTC() учитывать TZ — **DONE** (formatDueDate, getDueStatus → getUserTimezone())

---

## Что сделано в v0.8.17 (Sprint id=30, ЗАКРЫТ ✅)

| task_id (db) | Задача | Статус |
|---|--------|--------|
| #236 | Timeline: компонент TimelineView | ✅ |
| #237 | Timeline: рендеринг задач с due_date | ✅ |
| #238 | Timeline: группировка по проектам/исполнителям | ✅ |
| #239 | Timeline: фильтры и навигация | ✅ |
| #240 | Timeline: переключатель вида | ✅ |
| #241 | Таймер: UI компонент start/stop/pause | ✅ |
| #242 | Таймер: localStorage persistence + восстановление | ✅ |
| #243 | Таймер: автодобавление времени при остановке | ✅ |
| #244 | Таймер: уведомление >4ч | ✅ (toast в TaskTimer.tsx) |
| #245 | Учёт времени: статистика в DigestPage | ✅ |
| #246 | Учёт времени: экспорт CSV | ✅ (клиентский CSV из DigestPage 06.04.2026) |
| #247 | UX: мобильная версия | ✅ |
| #248 | UX: клавиатурные шорткаты (Ctrl+K) | ✅ |
| #249 | UX: тёмная тема | ✅ |

---

## Что сделано в v0.8.16 (Sprint id=21, ЗАКРЫТ ✅)

| # | Задача |
|---|--------|
| #215–219 | Вебхуки: CRUD, trigger, HMAC, retry с backoff, UI в настройках |
| #220–226 | API-ключи: модель, middleware X-API-Key, логи, UI |
| #227–230 | Учёт времени: поле time_spent, PATCH /tasks/{id}/time, UI, бейдж |

---

**Последнее обновление:** 2026-04-21 (Идеи + База знаний DONE; Tasks #384-388 DONE)
