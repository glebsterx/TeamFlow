# TeamFlow

**Telegram-first управление задачами для малых команд (2–5 человек)**

Создавайте задачи прямо в Telegram-чате, отслеживайте статусы через Web UI, получайте еженедельные дайджесты.

---

## Быстрый старт

```bash
git clone https://github.com/glebsterx/TeamFlow.git
cd TeamFlow
./deploy.sh
```

Скрипт запросит URL сервера и Telegram Bot Token — и запустит всё сам.
Подробнее: [DEPLOYMENT.md](DEPLOYMENT.md)

---

## Возможности

### Telegram Bot
- `/task` — создать задачу через диалог
- `/week` — недельная доска задач
- `/meeting` — зафиксировать встречу
- `/digest` — еженедельный дайджест
- Автопарсинг: напишите `"@john проверить API до пятницы"` — бот предложит создать задачу

### Web UI
- Kanban-карточки с приоритетами и дедлайнами
- Подзадачи произвольной глубины
- Directory navigation по проектам
- Фильтры: проект, исполнитель, приоритет, статус
- Архив и корзина (soft delete)
- Адаптивный дизайн + тёмная тема
- **Вебхуки** — POST на внешний URL при смене статуса
- **API-ключи** — для внешнего доступа к API
- **Учёт времени** — таймер и ручной ввод по задаче
- **Спринты** — планирование и отслеживание прогресса
- **Встречи v2** — с участниками, повесткой, автопарсинг action items
- **Telegram Mini App** — встроенный интерфейс в боте

### Авторизация
- **Локальный вход** — логин/пароль
- **Telegram** — deep link login через бота
- **Google/Yandex OAuth** — привязка и вход (настраивается через UI)
- **Invite-only режим** — регистрация только по приглашениям
- **System roles** — admin/user для доступа к настройкам

---

## Технологии

| Backend | Frontend | Infrastructure |
|---------|----------|----------------|
| Python 3.11, FastAPI | React 18, TypeScript | Docker Compose |
| aiogram 3.4 (Telegram) | Vite 5, Tailwind CSS | SQLite (WAL mode) |
| SQLAlchemy 2.0 async | TanStack Query | MemoryStorage (FSM) |

---

## Документация

| Файл | Содержание |
|------|-----------|
| [DEPLOYMENT.md](DEPLOYMENT.md) | Установка, конфигурация, Nginx, SSL, бэкапы, troubleshooting |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Стек, структура пакетов, модель данных, репозитории |
| [TELEGRAM.md](TELEGRAM.md) | Команды бота, FSM, callback протокол, автопарсинг |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Стандарты кода, работа с контейнерами, типичные ловушки |
| [ROADMAP.md](ROADMAP.md) | Текущий спринт, планы, беклог |
| [CHANGELOG.md](CHANGELOG.md) | История версий |

---

## Управление

```bash
docker-compose logs -f          # Логи
docker restart teamflow-backend # Перезапуск бэкенда
docker-compose down             # Остановка
git pull && ./deploy.sh         # Обновление
docker cp teamflow-backend:/app/data/teamflow.db ./backup.db  # Бэкап
```

---

## FAQ

**Где хранятся данные?**
`backend/data/teamflow.db` — SQLite файл, монтируется как Docker volume.

**Как сделать бэкап?**
`docker cp teamflow-backend:/app/data/teamflow.db ./backup.db`

**Нужна авторизация?**
Да — локальный логин/пароль, Telegram через бота, или Google/Yandex OAuth.
Администратор может включить invite-only режим для закрытой регистрации.

**Порты по умолчанию?**
Backend: 8180, Frontend: 5180. Меняются через `.env`.

---

## Текущая версия: v0.8.21

[История изменений →](CHANGELOG.md) · [Планы →](ROADMAP.md)

---

*MIT License · Made for small teams*
