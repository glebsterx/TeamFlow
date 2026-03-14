# TeamFlow — Deployment Guide

## Быстрый старт

```bash
git clone https://github.com/glebsterx/TeamFlow.git
cd TeamFlow
./deploy.sh
```

`deploy.sh` запрашивает URL, порты и Telegram Bot Token — и запускает docker-compose.

---

## Требования

- Docker & Docker Compose
- Telegram Bot Token (получить у @BotFather)
- VPS: 1 vCPU, 1GB RAM, 10GB диск, Ubuntu 20.04+

---

## Конфигурация

### `.env` (корень) — для Docker Compose
```env
BACKEND_PORT=8180
FRONTEND_PORT=5180
BASE_URL=http://tf.example.com
```

### `backend/.env` — для приложения
```env
APP_NAME=TeamFlow
TELEGRAM_BOT_TOKEN=...
TELEGRAM_BOT_USERNAME=...
DATABASE_URL=sqlite+aiosqlite:///./data/teamflow.db
BASE_URL=http://tf.example.com
BACKEND_PORT=8180
FRONTEND_PORT=5180
BACKEND_CORS_ORIGINS=["http://tf.example.com:5180"]
SECRET_KEY=...   # openssl rand -hex 32
API_HOST=0.0.0.0
API_PORT=8000
```

### `frontend/.env`
```env
VITE_API_URL=http://tf.example.com:8180
```

---

## Настройка Telegram

1. `@BotFather → /newbot` → скопировать токен
2. Добавить бота в групповой чат
3. Отключить Privacy Mode: `@BotFather → Bot Settings → Group Privacy → Turn off`
4. Получить Chat ID:
   ```bash
   curl https://api.telegram.org/bot<TOKEN>/getUpdates
   # найти "chat":{"id":-100xxxxxxxxx}
   ```

---

## Docker Services

| Контейнер | Образ | Порт |
|-----------|-------|------|
| `teamflow-backend` | python | 8180 |
| `teamflow-frontend` | node (vite dev) | 5180 |
| `teamflow-redis` | redis:7 | — |

### После изменений кода
```bash
# Backend — нет --reload, перезапустить вручную:
docker restart teamflow-backend

# Frontend — hot reload автоматически (src/ volume-mounted, Vite HMR)
```

---

## Последовательность запуска приложения

1. Загрузка конфигурации
2. Инициализация логирования
3. Подключение к SQLite + создание таблиц
4. Инициализация сервисов
5. Запуск Telegram Bot (aiogram polling)
6. Запуск FastAPI Web API

---

## Миграции БД

`migrate.py` не монтируется в контейнер. Запуск:

```bash
docker exec -it teamflow-backend python migrate.py
```

Или напрямую:
```bash
docker exec -it teamflow-backend python -c "
import asyncio, aiosqlite
async def run():
    async with aiosqlite.connect('data/teamflow.db') as db:
        await db.execute('ALTER TABLE tasks ADD COLUMN new_col TEXT')
        await db.commit()
asyncio.run(run())
"
```

---

## Управление

```bash
docker-compose up -d          # Запуск
docker-compose down           # Остановка
docker-compose restart        # Перезапуск всех
docker-compose logs -f        # Все логи
docker-compose logs -f backend  # Логи бэкенда
docker-compose ps             # Статус

# После git pull:
docker-compose up -d --build
```

---

## Резервное копирование

```bash
# Ручной бэкап
docker cp teamflow-backend:/app/data/teamflow.db ./backup-$(date +%Y%m%d).db

# Восстановление
docker cp ./backup.db teamflow-backend:/app/data/teamflow.db
docker restart teamflow-backend
```

### Автоматический бэкап (cron)
```bash
cat > /root/backup-teamflow.sh << 'EOF'
#!/bin/bash
mkdir -p /root/backups
docker cp teamflow-backend:/app/data/teamflow.db /root/backups/teamflow-$(date +%Y%m%d-%H%M).db
find /root/backups -name "teamflow-*.db" -mtime +30 -delete
EOF
chmod +x /root/backup-teamflow.sh
echo "0 2 * * * /root/backup-teamflow.sh" | crontab -
```

### Авто-архивация DONE задач (cron)
По умолчанию задачи со статусом DONE архивируются автоматически через 7 дней после завершения.

**Вручную:**
```bash
curl -X POST http://localhost:8180/api/tasks/auto-archive
```

**Автоматически (cron):**
```bash
echo "0 3 * * * curl -s -X POST http://localhost:8180/api/tasks/auto-archive" | crontab -
```

**Принцип работы:**
- Архивируются задачи со статусом `DONE`
- У которых `completed_at` старше 7 дней
- Которые ещё не заархивированы (`archived=false`)

**Важно:** Для старых задач (завершённых до v0.8.6) может отсутствовать `completed_at`. Выполните миграцию:
```bash
docker exec teamflow-backend python -c "
import asyncio, aiosqlite
async def fix():
    async with aiosqlite.connect('/app/data/teamflow.db') as db:
        await db.execute('UPDATE tasks SET completed_at = updated_at WHERE status = \"DONE\" AND completed_at IS NULL')
        await db.commit()
asyncio.run(fix())
"
```

---

## Nginx + SSL (production)

```bash
apt install nginx certbot python3-certbot-nginx -y
```

```nginx
# /etc/nginx/sites-available/teamflow
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5180;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }

    location /api {
        proxy_pass http://localhost:8180;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/teamflow /etc/nginx/sites-enabled/
nginx -t && systemctl restart nginx
certbot --nginx -d your-domain.com
```

---

## Автозапуск (systemd)

```bash
cat > /etc/systemd/system/teamflow.service << 'EOF'
[Unit]
Description=TeamFlow
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/root/TeamFlow
ExecStart=/usr/local/bin/docker-compose up -d
ExecStop=/usr/local/bin/docker-compose down

[Install]
WantedBy=multi-user.target
EOF

systemctl enable teamflow
```

---

## Firewall

```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

---

## Логирование

| Уровень | Что логируется |
|---------|---------------|
| INFO | создание задач, смены статусов |
| WARNING | некритичные проблемы |
| ERROR | сбои операций, ошибки БД |

---

## Безопасность

- Токен бота — только в `backend/.env`, не в репозитории
- Web UI открыт без авторизации (авторизация через Telegram Login Widget — v1.0.0, требует HTTPS)
- CORS ограничен явным списком origins
- Рекомендуется Nginx reverse proxy + SSL для production

---

## Troubleshooting

### Бот не отвечает
```bash
docker-compose logs backend | grep -i error
# Проверить токен, chat ID, privacy mode
```

### Порты заняты
```bash
# В .env изменить BACKEND_PORT / FRONTEND_PORT
```

### База данных заблокирована
```bash
docker-compose restart backend
```

### ContainerConfig ошибка
```bash
docker-compose down
docker rm -f teamflow-backend teamflow-frontend
docker image prune -f
docker-compose up --build -d
```

### Нет памяти на VPS
```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

---

## Рекомендуемые VPS провайдеры

| Провайдер | Цена | Конфигурация |
|-----------|------|-------------|
| Hetzner Cloud | €4.15/мес | 2 vCPU, 2GB RAM |
| DigitalOcean | $6/мес | 1 vCPU, 1GB RAM |
| Linode | $5/мес | 1 vCPU, 1GB RAM |
| Vultr | $6/мес | 1 vCPU, 1GB RAM |
