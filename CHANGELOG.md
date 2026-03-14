# Changelog

---

## v0.8.9 — Защита от потери данных при удалении проекта (2026-03-14)

### #63 — Project Deletion Protection
- **Backend:** Soft delete для проектов (поле `deleted`)
- **Backend:** Валидация при удалении — проверка подпроектов и задач
- **Backend:** API `/projects/{id}/can-delete` — проверка возможности удаления
- **Backend:** API `/projects/{id}/archive` — архивация проекта
- **Backend:** API `/projects/{id}/restore` — восстановление из архива
- **Backend:** API `/projects/archived` — список архивных проектов
- **Frontend:** ConfirmDeleteModal с проверкой зависимостей
- **Frontend:** Показ подпроектов и задач при невозможности удаления
- **Frontend:** Кнопка "Архивировать" вместо удаления для проектов с зависимостями
- **Frontend:** Кнопка "↩️ Восстановить" для архивных проектов
- **Frontend:** Кнопка "🗄️ Архив" в ProjectModal

### #64 — Авто-архивация DONE задач
- **Docs:** Документация в DEPLOYMENT.md по авто-архивации
- **Migration:** completed_at = updated_at для старых DONE задач
- **Cron:** Настройка `0 3 * * *` для ежедневной авто-архивации
- **Endpoint:** `/tasks/auto-archive` — архивирует DONE задачи старше 7 дней

---

## v0.8.8 — Markdown 2 и защита от concurrent editing (2026-03-14)

### #39 — Markdown 2 Editor
- **Frontend (TaskModal):** Toolbar с кнопками (жирный, курсив, код, списки, ссылки)
- **Frontend (NewTaskModal):** Markdown editor при создании задачи
- **Frontend (ProjectModal):** Markdown editor для описания проекта
- **Frontend (MeetingModal):** Markdown editor для встреч
- **Frontend (NewMeetingModal):** Markdown editor при создании встречи
- **Keyboard shortcuts:** Ctrl+B/I/E/K работают с любой раскладкой (через e.code)
- **Toggle:** Повторное нажатие удаляет форматирование
- **Preview:** Вкладка просмотра отрендеренного Markdown
- **Font-mono:** Моноширинный шрифт в textarea для удобства

### #60 — Concurrent Edit Protection
- **Backend:** Optimistic locking через `expected_updated_at` в PATCH /tasks/{id}
- **Backend:** Возврат 409 Conflict с деталями при несовпадении updated_at
- **Frontend:** Отправка `task.updated_at` при сохранении задачи
- **Frontend:** Conflict modal при обнаружении конфликта
- **Frontend:** Выбор: "Отменить и обновить" или "Перезаписать"

---

## v0.8.7 — Структура проектов и Markdown 2 (2026-03-14)

### #53 — Структура проектов
- **Backend:** Добавлено поле `parent_project_id` в модель Project
- **Backend:** API `/projects` поддерживает создание подпроектов
- **Frontend:** ProjectNavPage — древовидное отображение проектов (родительские + подпроекты)
- **Frontend:** NewProjectModal — выбор родительского проекта при создании
- Подпроекты отображаются вложенными в карточку родительского проекта

### #39 — Markdown 2
- **Frontend (TaskModal):** Toolbar для форматирования Markdown (жирный, курсив, код, списки, ссылки)
- **Frontend (TaskModal):** Keyboard shortcuts: Ctrl+B (жирный), Ctrl+I (курсив), Ctrl+E (код), Ctrl+K (ссылка)
- **Frontend (TaskModal):** Font-mono шрифт в редакторе для удобства работы с Markdown

---

## v0.8.6 — Управление статусами и история блокеров (2026-03-14)

### #57 — Управление статусами
- **Backend:** Валидация — нельзя завершить задачу (DONE), если есть незавершённые подзадачи
- **Frontend (TaskModal):** Кнопка DONE заблокирована, показывается предупреждение при клике
- **Frontend (Dashboard, ProjectNavPage):** Toast warning при попытке завершить задачу с незавершёнными подзадачами
- **Frontend (TaskModal):** Авто-предложение DONE, когда все подзадачи завершены (зелёная плашка)
- Правильное склонение: "1 подзадача не завершена", "2-4 подзадачи не завершены", "5+ подзадач не завершено"

### #59 — История блокеров
- **Database:** Добавлено поле `resolved_at` в таблицу `blockers`
- **Backend:** При смене статуса с BLOCKED на другой — все блокеры помечаются как разрешённые (`resolved_at`)
- **Frontend (TaskModal):** Блокер показывается только если статус BLOCKED
- **Frontend (TaskModal):** Секция "📜 История блокеров" — показывает все блокеры с датами блокировки/разблокировки
- Разрешённые блокеры показываются зачёркнутыми с датой разблокировки

### Исправления
- **Backlog:** Задачи из бэклога больше не показываются в общем списке задач (`/api/tasks` фильтрует `backlog == False`)
- **Frontend (TaskModal):** Кнопка 📦 для переключения бэклога с toast уведомлением

---

## v0.8.5 — Backlog, Export/Import, Views, Frontend Refactor (2026-03-14)

### #21 — Бэклог
- Новая вкладка **📦 Бэклог** — агрегированный вид задач в бэклоге, сгруппированных по проектам
- Секция бэклога внутри каждого проекта (`<details>` — свёрнута по умолчанию)
- `BacklogTaskRow` — строка с кнопкой «→ В работу» (снимает флаг `backlog`)
- **TaskModal**: кнопка 📦 — тогл бэклога, подсвечивается янтарным когда активен
- **NewTaskModal**: чекбокс «📦 В бэклог» + `initialBacklog` из контекста
- БД: колонки `tasks.backlog` (bool) и `tasks.backlog_added_at` (datetime)
- Автосброс `backlog=False` при любой смене статуса (`change_status`, `block_task`)
- `GET /api/backlog?project_id=N&no_project=true` — новый эндпоинт

### #48 — Экспорт / Импорт
- `GET /api/export?project_id=N&include=tasks,projects,meetings,comments` — скачивает JSON с заголовком `Content-Disposition`
- `POST /api/import` `{ mode: "merge"|"full", data }` — импорт с двумя режимами
  - `merge`: добавляет только записи, которых нет по ID
  - `full`: очищает задачи/проекты (soft delete) и встречи/комментарии (hard delete), затем вставляет из файла
- Поддержка `backlog`, `backlog_added_at` и всех полей задачи при импорте

### #15 — Настройки
- Новая вкладка **⚙️ Настройки** в навигации
- Панель **Экспорт**: фильтр по проекту + чекбоксы включаемых сущностей + кнопка «Скачать JSON»
- Панель **Импорт**: выбор режима (merge/full) + загрузка JSON файла + отображение результата/ошибки

### #42 — Виды списка задач
- Переключатель видов: **🃏 Карточки** / **☰ Список** / **⬛ Канбан**
- Выбор сохраняется в `localStorage`
- **Список**: компактные строки — статус, приоритет, ID, название, проект, исполнитель, дедлайн
- **Канбан**: 4 колонки (TODO/DOING/BLOCKED/DONE), скролл внутри колонок, горизонтальный скролл на мобиле

### Рефакторинг фронтенда (2026-03-14)
- `Dashboard.tsx` (~3300 строк) разбит на изолированные модули
- `src/pages/`: `BacklogPage`, `SettingsPage`, `ArchivePage`, `DigestPage`, `ProjectNavPage`
- `src/modals/`: `TaskModal`, `NewTaskModal`, `ProjectModal`, `MeetingModal`, `NewProjectModal`, `NewMeetingModal`, `ConfirmDeleteModal`
- `src/components/`: `Modal`, `MarkdownContent`, `CommentsSection`, `SearchPanel`, `Toast`, `TaskCard`
- `src/hooks/`: `useTaskChangeDetector`, `usePushNotifications`
- `src/constants/taskDisplay.ts` — цвета, эмоджи, порядок статусов/приоритетов
- `src/utils/`: `dateUtils`, `taskUtils`, `toast`
- `src/types/dashboard.ts` — все интерфейсы

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
