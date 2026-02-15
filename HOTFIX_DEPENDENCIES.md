# Исправление конфликтов зависимостей

## Проблемы при сборке

### 1. Конфликт pydantic
```
ERROR: Cannot install aiogram 3.4.1 and pydantic==2.6.1
aiogram 3.4.1 depends on pydantic<2.6
```

### 2. Конфликт pytest
```
ERROR: Cannot install pytest==8.0.0 and pytest-asyncio 0.23.4
pytest-asyncio 0.23.4 depends on pytest<8
```

## Решение

Откройте `backend/requirements.txt` и измените:

**Строка 15 - Было:**
```
pydantic==2.6.1
```
**Должно быть:**
```
pydantic==2.5.3
```

**Строка 29 - Было:**
```
pytest==8.0.0
```
**Должно быть:**
```
pytest==7.4.4
```

## Быстрое применение патча

```bash
cd backend
sed -i 's/pydantic==2.6.1/pydantic==2.5.3/' requirements.txt
sed -i 's/pytest==8.0.0/pytest==7.4.4/' requirements.txt
```

Или скачайте **стабильный архив** где всё уже исправлено:
`taskflow-production-v0.3.0-stable.tar.gz`

## Пересборка

```bash
docker-compose build --no-cache
docker-compose up -d
```

## Проверка

```bash
docker-compose ps
# Все контейнеры должны быть Up (healthy)

docker-compose logs backend | tail -20
# Должно быть: "bot_starting" и "api_server_started"
```

---

**Совместимые версии:**
- Python 3.11
- aiogram 3.4.1
- pydantic 2.5.3 ✅
- pytest 7.4.4 ✅
- FastAPI 0.110.0
- SQLAlchemy 2.0.27
