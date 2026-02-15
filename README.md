# TeamFlow - Production-Ready Task Management

**Version:** 0.3.0  
**GitHub:** https://github.com/glebsterx/TeamFlow

Telegram-first инструмент управления задачами для малых команд.

## 🚀 Быстрый старт

```bash
git clone https://github.com/glebsterx/TeamFlow.git
cd TeamFlow
cp backend/.env.example backend/.env
nano backend/.env  # Добавьте токены
docker-compose up --build -d
```

**Доступ:**
- Web UI: http://localhost:5180
- Backend API: http://localhost:8180

## 📱 Порты

| Сервис | Внешний | Внутренний |
|--------|---------|------------|
| Backend | 8180 | 8000 |
| Frontend | 5180 | 5173 |

## 🔧 Исправление ошибки ContainerConfig

```bash
./cleanup.sh
docker-compose up --build -d
```

## 🤖 Telegram команды

- `/start` - Главное меню
- `/help` - Справка  
- `/task` - Создать задачу
- `/week` - Недельная доска
- `/meeting` - Встреча
- `/digest` - Дайджест

## 📦 Технологии

- Python 3.11, aiogram 3.4.1, FastAPI 0.110.0
- React 18.2, TypeScript, Vite
- SQLite (async), Docker

## 📖 Документация

См. полную документацию в репозитории.

---

**MIT License** | Made with ❤️
