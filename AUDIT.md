# Аудит TeamFlow — 2026-06-13

Версия в `config.py`: **0.8.25**. ROADMAP актуален до v0.8.22, последние коммиты — v0.8.23 (AI suggest-tags, тесты), v0.8.24 (Идеи, База знаний). В рабочем дереве — незакоммиченная фича **«Корзина базы знаний»** (soft-delete folders/pages) + рефактор `/remind` и OAuth redirect URL.

---

## 🔴 Критичные (блокеры — чинить до коммита)

- [x] **AUD-1 — `/remind` падает при срабатывании.**
  `backend/app/telegram/handlers/remind_handler.py` в `_send_reminder()`:
  `from app.config import TELEGRAM_BOT_TOKEN` — такого модульного экспорта **нет** (только `settings.TELEGRAM_BOT_TOKEN`). При срабатывании напоминания → `ImportError`, пользователь напоминание не получает.
  **Fix:** `from app.config import settings` → `Bot(token=settings.TELEGRAM_BOT_TOKEN)`, либо переиспользовать `from app.telegram.bot import bot`.

- [x] **AUD-2 — Нет миграции для `deleted_at`.**
  В `models.py` добавлены `KnowledgeFolder.deleted_at` и `KnowledgePage.deleted_at`, но ALTER TABLE нет. На SQLite-проде запросы к базе знаний упадут с `no such column: deleted_at`.
  **Fix:** добавлены идемпотентные записи в `backend/migrate.py` (применятся при деплое). Локальный dev-БД пуст (таблиц БЗ нет). На проде убедиться, что `migrate.py` отработал.

- [x] **AUD-3 — Отладочные `print()` в проде.**
  `routes.py` `restore_knowledge_item()` — два `print(f"RESTORE: ...", flush=True)`. Нарушает конвенцию «не оставлять print()». Удалить (или заменить на `logger.debug`).

---

## 🟠 Баги / регрессии

- [x] **AUD-4 — `/remind 18:00` теперь в UTC, а не MSK.**
  Старый код считал `HH:MM` в UTC+3 (MSK); новый — `datetime.now(timezone.utc)` без сдвига. `/remind 42 18:00` сработает в 21:00 MSK. Из хелпа убрана пометка «(UTC+3)».
  Связано с запланированным #319 (рефактор TZ). Либо вернуть сдвиг, либо явно зафиксировать переход на UTC.

- [x] **AUD-5 — Утечка Bot-сессии в `/remind`.**
  `_send_reminder()` создаёт новый `Bot(token=...)` на каждое напоминание и не закрывает сессию. Переиспользовать singleton `from app.telegram.bot import bot`.

- [x] **AUD-6 — Первый ответ `/remind` без `parse_mode`.**
  `await message.answer(f"✅ Напомню ... *#{task_id}* ...")` — без `parse_mode="Markdown"`, звёздочки покажутся буквально (остальные ответы — с Markdown).

- [x] **AUD-7 — Мёртвые импорты (ruff F401).**
  `remind_handler.py`: `Clock`, `settings`; `web/app.py`: `RequestValidationError`, `Clock`. Удалить.

## 🟡 Архитектурное (не ново, но усугублено)

- [ ] **AUD-8 — Напоминания на `asyncio.create_task` теряются при рестарте.**
  Срок до 30 дней живёт только в памяти процесса; ссылка на task не хранится (риск GC). Для долгих сроков — persistence (таблица + восстановление при старте) или APScheduler.

---

## ✅ Что сделано хорошо (в этом диффе)
- Soft-delete + корзина + рекурсивное восстановление родительского пути в базе знаний.
- OAuth-редиректы переведены с статичного `settings.web_url` на `get_web_url_async()` (URL из БД) — корректно для конфигурации через UI.
- Фикс бага в `/digest`: убран мёртвый `elif task: name = task` (присваивал объект Task как имя исполнителя).

---

## 📋 Незакрытое из ROADMAP (что ещё стоит реализовать)

**Ближайшее (заявлено TODO):**
- #317 — Умные push: только свои задачи / все для админа / настройки в аккаунте.
- #319 — Рефактор часовых поясов: TZ в аккаунте, `Clock.now()` вместо `utcnow`, UI выбора (закроет AUD-4).
- v0.9.1 — Тестовый фреймворк: backend pytest + frontend Vitest. Частично начато в v0.8.23 — довести покрытие (auth, tasks, projects, sprints, meetings; TaskCard/Modal/login/Dashboard).

**Технический долг (ROADMAP):**
- Web UI всё ещё доступен без авторизации в части эндпоинтов — провести аудит защиты записи API-ключом/JWT.
- #310 streaming JSON export, #313 единый стиль routes.py, #314 импорты на уровень модуля (99 мест).

**Backlog-фичи (по ценности):**
- #47 Чеклисты внутри задачи · #81 Дерево-view задач · #30 Файлы/фото + OCR · #28/#19 Голосовой ввод · #29 Мобильное приложение · #22 Алиса.

**Долгосрочные идеи:**
- Интеграции GitHub Issues / Jira / Google Calendar / Slack.
- Аналитика: burndown, velocity, time-in-status.
- AI: умная приоритизация, автокатегоризация, генерация отчётов.

---

## Порядок действий
1. AUD-1, AUD-2, AUD-3 (блокеры) → 2. AUD-4…AUD-7 (быстрые фиксы) → 3. прогнать `ruff check` и тесты → 4. закоммитить фичу «Корзина БЗ» → 5. взять #319 (закроет AUD-4) и #317.
