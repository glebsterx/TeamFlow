# TeamFlow - Быстрый деплой

## 🚀 Установка (5 минут)

### 1. Клонируйте репозиторий

```bash
git clone https://github.com/glebsterx/TeamFlow.git
cd TeamFlow
```

### 2. Настройте .env

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

**Обязательные параметры:**
```env
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...  # От @BotFather
TELEGRAM_CHAT_ID=-1001234567890       # Отрицательное число
TELEGRAM_BOT_USERNAME=your_bot        # Без @
```

### 3. Запустите

```bash
docker-compose up --build -d
```

### 4. Проверьте

```bash
docker-compose ps
# Оба контейнера должны быть Up (healthy)
```

## 🔧 Исправление ошибки ContainerConfig

Если видите ошибку `KeyError: 'ContainerConfig'`:

```bash
# Вариант 1: Скрипт очистки
./cleanup.sh
docker-compose up --build -d

# Вариант 2: Вручную
docker-compose down
docker rm -f teamflow-backend teamflow-frontend
docker image prune -f
docker volume rm teamflow_teamflow-data  # УДАЛИТ ДАННЫЕ!
docker-compose up --build -d
```

## 📱 Доступ

- **Web UI:** http://localhost:5180
- **API:** http://localhost:8180
- **Docs:** http://localhost:8180/docs

## ✅ Проверка работы

### Backend
```bash
curl http://localhost:8180/health
# {"status":"healthy"}
```

### Telegram Bot
Отправьте в чат:
```
/start
```
Бот должен ответить меню с кнопками.

### Web UI
1. Откройте http://localhost:5180
2. Нажмите "Login with Telegram"
3. Авторизуйтесь

**Важно:** Перед использованием замените `YOUR_BOT_USERNAME` в `frontend/src/pages/Dashboard.tsx` на ваш bot username!

## 🐛 Частые проблемы

### Бот не отвечает
```bash
# Проверьте логи
docker-compose logs backend | grep -i error

# Проверьте .env
cat backend/.env | grep TELEGRAM

# Убедитесь что Privacy Mode выключен
# @BotFather → Bot Settings → Group Privacy → Turn off
```

### Порты заняты
Измените в `docker-compose.yml`:
```yaml
ports:
  - "9180:8000"  # Вместо 8180
  - "6180:5173"  # Вместо 5180
```

### База данных заблокирована
```bash
docker-compose restart backend
```

## 📊 Логи

```bash
# Все логи
docker-compose logs -f

# Только backend
docker-compose logs -f backend

# Последние 50 строк
docker-compose logs --tail=50
```

## 🔄 Обновление

```bash
git pull
docker-compose down
docker-compose up --build -d
```

## 🛑 Остановка

```bash
docker-compose down
```

## 📦 Резервное копирование

```bash
# Создать бэкап
docker cp teamflow-backend:/app/data/teamflow.db ./backup.db

# Восстановить
docker cp ./backup.db teamflow-backend:/app/data/teamflow.db
docker-compose restart backend
```

---

**Успешного деплоя! 🚀**

Если возникли проблемы: https://github.com/glebsterx/TeamFlow/issues
