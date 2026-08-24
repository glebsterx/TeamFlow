# TeamFlow — Ключевые архитектурные решения

## Принятые решения

### Бот и API в разных процессах
**Решение:** `multiprocessing.Process` для бота и FastAPI.
**Причина:** aiogram polling блокирует event loop; разделение даёт независимые рестарты.
**Следствие:** Любой shared state — только через БД. In-memory dict между процессами не работает.

### SQLite вместо PostgreSQL
**Решение:** SQLite WAL mode.
**Причина:** Малые команды (2–5 чел.), нет конкурентной записи. Простота бэкапа (один файл).
**Следствие:** NullPool вместо connection pool — решает deadlock при async SQLite.

### Redis убран, FSM в MemoryStorage
**Решение:** aiogram FSM хранится в памяти процесса бота.
**Причина:** Меньше инфраструктуры. При рестарте бота FSM состояния сбрасываются — это приемлемо для диалогов создания задач.

### Прокси: AiohttpSession(proxy=url), не Bot(proxy=...)
**Решение:** `AiohttpSession(proxy=url)` в `start_bot()`, не на уровне модуля.
**Причина:** aiogram 3.4.1 принимает только `proxy=` строкой; ProxyConnector требует event loop — нельзя создавать при импорте модуля.

### ~~MTProxy через sidecar mtg~~ — НЕ РАБОТАЕТ
**Было:** `_ensure_mtg_container()` создаёт Docker-контейнер `teamflow-mtg` при mtproto://.
**Результат:** Не заработало. Функция `_ensure_mtg_container()` удалена из кода.
**Текущее:** Только SOCKS5/HTTP прокси поддерживается.

### GET/POST /api/settings/proxy читает .env напрямую
**Решение:** Файл `/app/.env` читается и пишется напрямую, минуя pydantic-settings.
**Причина:** `settings` закэширован через `@lru_cache` при старте — изменения через API не отражаются в объекте settings без рестарта. Чтение из файла всегда актуально.

### extra = "ignore" в Settings
**Решение:** `class Config: extra = "ignore"` в pydantic-settings.
**Причина:** `.env` может содержать переменные не объявленные в Settings (старые поля). Без ignore бэкенд падает при старте.

### Soft delete везде
**Решение:** `deleted=True` + `archived=True` вместо физического удаления.
**Причина:** Восстановление данных, аудит, защита от случайного удаления.
**Ограничение:** Нет физического удаления через API — только через прямой доступ к БД.

### Heartbeat через БД
**Решение:** Бот пишет heartbeat в таблицу `bot_heartbeat` (id=1) каждые 30с.
**Причина:** Бот и API в разных процессах — in-memory флаг не шарится. API читает из БД.

### Версионирование
- `0.x.y` — фичи: `x++`, фиксы: `y++`
- `1.0.0` — только после SSL + Telegram авторизации
- Числа > 9 норма: 0.9.x → 0.10.x

---

## Решения v0.8.19

### LocalAccount как основная сущность
**Решение:** Telegram, Google, Yandex — OAuth-провайдеры через UserIdentity, привязанные к LocalAccount.
**Причина:** Система должна работать без Telegram. Пользователи могут входить через логин/пароль или любой OAuth.
**Следствие:** `LocalAccount.telegram_id` удалён. Поиск через `UserIdentity(provider='telegram')`. `Task.assignee_id` → FK на `local_accounts.id`.

### System roles vs Team roles
**Решение:** `system_role` (admin/user) в LocalAccount отдельно от `TeamMember.role` (owner/admin/member/viewer).
**Причина:** Доступ к настройкам системы ≠ роль в команде. Админ может не быть владельцем команды.

### Invite-only регистрация
**Решение:** Переключатель в настройках. При включении — регистрация только с кодом приглашения или email из приглашения.
**Причина:** Защита от несанкционированной регистрации в публичных инсталляциях.

### API Key middleware
**Решение:** Проверка `Origin` header для фронтенда, `X-API-Key` для внешних клиентов.
**Причина:** Защита API от прямых запросов. Фронтенд проходит автоматически по Origin.

### OAuth настройки из UI
**Решение:** Client ID/Secret хранятся в `app_settings`, не в `.env`.
**Причина:** Удобство настройки без перезапуска контейнеров. Безопасность через RBAC (только admin).

### ServerRestartGuard
**Решение:** Vanilla JS в `index.html` перехватывает 502 и показывает оверлей.
**Причина:** React не загружается при 502. Vanilla JS работает до загрузки React.

### Telegram deep link login
**Решение:** `/start weblogin_{token}` → бот сохраняет JWT в БД → фронтенд поллит → вход.
**Причина:** Без кнопки "Открыть TeamFlow" в боте. Автоматический вход при возврате в браузер.

---

## Решения v0.9.x — Планируемые

### Модульная архитектура: Auth / Task / Bot (#333)
**Задача:** Структурно отделить систему авторизации от задач и бота.

**Целевая структура:**
```
backend/app/
├── auth/                    # Auth Module (Isolation)
│   ├── repositories/        # account, identity, team, invite
│   ├── services/            # auth_service, team_service, invite_service
│   └── routes/              # routes_auth (auth/*, users/*)
├── tasks/                   # Task Module (Isolation)
│   ├── repositories/        # task, project, sprint, meeting, tag
│   ├── services/            # task_service, project_service, sprint_service
│   └── routes/              # routes (tasks, projects, sprints)
├── bot/                     # Bot Module
│   ├── handlers/            # FSM handlers
│   └── services/            # bot-specific logic
└── core/                    # Shared: db, config, dependencies
```

**Зачем:**
1. **Тестируемость** — можно тестировать Auth без Bot и наоборот
2. **Масштабируемость** — разные команды могут развивать модули независимо
3. **Повторное использование** — Auth можно вынести в отдельный микросервис
4. **Чистота** — убрать coupling между системами

**UserContext:** Общий интерфейс для user lookup, используется всеми модулями.
