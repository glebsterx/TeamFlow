# Changelog

---

## v0.8.4 — UX Polish (2026-03-02)

### Web UI
- Фон карточек задач окрашивается по статусу (TODO белый, DOING голубой, DONE зелёный, BLOCKED красный)
- Priority badge в шапке карточки — только эмоджи, tooltip с текстом
- Parent badge в карточке — `↳ #id название` с эмоджи проекта, без переполнения
- DONE-задачи отображаются внизу списка при сортировке по приоритету
- Мобильный двойной тап: `[@media(hover:hover)]:hover` — тень только на устройствах с мышью
- Модалка задачи: компактный layout — Проект+Исполнитель в одну строку, кнопки приоритета/статуса в ряд
- Кнопки архива и удаления в модалке переработаны (светлый архив, красное удаление с 🗑️)
- Подзадачи теперь доступны для задач любого уровня вложенности
- В секции подзадач — вкладка «↗ Привязать» для привязки существующей задачи
- В Проектах: hover-кнопки смены статуса и «Взять» прямо в строке задачи
- Сортировка задач в Проектах: приоритет слева от исполнителя

### Backend
- Фикс `ResponseValidationError` в `/api/archive` и `/api/deleted` — добавлен `selectinload(subtasks)`
- `invalidate()` теперь инвалидирует кэш `['archive']` и `['deleted']`

### Prev: v0.8.3 — Docs & Scripts Refactor (2026-03-02)
- Документация: 24 файла из `docs/` → 6 файлов (ARCHITECTURE, TELEGRAM, DEPLOYMENT, DEVELOPMENT, ROADMAP, CHANGELOG)
- Удалены лишние shell-скрипты и docker-compose файлы
- `.gitattributes` — принудительный LF для всех текстовых файлов
- Фикс изоляции фильтра статуса между разделами Задачи и Проекты
- Кнопка «+ Задача» внутри проекта с предзаполнением project_id/parent_task_id

---

## v0.8.2 — Navigation Gestures & UX (2026-03-02)

- Жесты навигации: кнопки мыши 3/4, Alt+←/→ (back/forward)
- Мобильный UI: фильтры в grid 2 колонки вместо горизонтального скролла
- Фикс дублей при быстром двойном клике на "Создать"
- Выбор родительской задачи при создании
- Фильтр по проекту теперь работает через parent_task_id (effectiveProjectId)

---

## v0.8.1 — Project Directory Navigation (2026-02-28)

- #13 Directory navigation в проектах: Проекты → Задача → Подзадачи (стек)
- #12 Контекст проекта: "+ Задача" внутри проекта создаёт задачу с предзаполненным проектом
- Хлебные крошки с кликабельными сегментами
- Браузерная история (popstate sentinel)

---

## v0.8.0 — Subtasks & Priorities (2026-02-25)

- #7 Подзадачи произвольной глубины (`parent_task_id`, relationship subtasks)
- #20 Приоритеты задач: URGENT / HIGH / NORMAL / LOW
- Сортировка по приоритету в репозитории
- API: `/tasks/{id}/subtasks`, `priority` в create/update
- Фильтр по приоритету в UI
- Бейджи дедлайна (overdue / today / soon / upcoming)

---

## v0.7.x — Deadlines, Archive, Soft Delete (2026-02-20)

- #25 Дедлайны задач (`due_date`) — date picker в UI
- Мягкое удаление (`deleted: bool`), архив (`archived: bool`)
- API: `/tasks/{id}/archive`, `/tasks/{id}/restore`, `/archive`, `/deleted`
- Дайджест с учётом дедлайнов и топ исполнителей
- #10 Переносы строк в Markdown описаниях

---

## v0.6.x — Markdown, Digest UI, Timestamps (2026-02)

- v0.6.7 — #33 Markdown в описаниях (react-markdown + remark-gfm)
- v0.6.8 — #9 Дайджест в Web UI (отдельная страница /digest)
- v0.6.9 — #11 Архив задач в Web UI
- v0.6.6 — #32 Временны́е метки: created_at, started_at, completed_at в карточке

---

## v0.5.x — Projects & Mobile UI (2026-01)

- #5 Разделение задач по проектам (project_id, фильтрация)
- #4 Мобильный вид веб-интерфейса (адаптивный layout)
- CRUD для проектов и встреч в UI

---

## v0.3.0 — Production-Ready (2025)

- Исправлена ошибка aiosqlite (`sqlite+aiosqlite://`)
- SQLite WAL mode + PRAGMA оптимизации
- Telegram Auth для Web UI (JWT, `/login`)
- Команда `/help` с inline кнопками, `/menu`
- NullPool для SQLite (решён deadlock)
- Обновлены зависимости: aiogram 3.4.1, FastAPI 0.110, SQLAlchemy 2.0.27

---

## v0.2.0 — Bot Commands & VPS Deploy (2025)

- `/meeting` — фиксация встреч, `/meetings` — история
- `/digest` — еженедельный дайджест (статистика, блокеры, исполнители)
- `/overdue` — просроченные задачи
- MessageParsingService — автопарсинг @mentions и дат из сообщений
- `deploy-vps.sh` — автоматический деплой на VPS за 5 минут
- docker-compose.prod.yml + Nginx + health checks

---

## v0.1.0 — Initial Release (2025)

- Telegram Bot: `/task` (FSM диалог), `/week` (доска)
- Inline кнопки: Start, Done, Block + причина блокировки
- FastAPI + SQLAlchemy async + SQLite
- React 18 + TypeScript read-only Dashboard
- Docker Compose dev окружение
