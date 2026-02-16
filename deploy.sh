#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔═══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║      TeamFlow Deploy Script          ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════╝${NC}"
echo ""

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

# Показываем текущие настройки
if [ -f ".env" ]; then
    echo -e "${YELLOW}📋 Текущая конфигурация:${NC}"
    cat .env 2>/dev/null | grep -v "^#" | grep -v "^$"
    echo ""
fi

# Выбор режима
echo -e "${YELLOW}🔧 Режим развертывания:${NC}"
echo "1) Development (с hot reload, volume mounts)"
echo "2) Production (полная сборка)"
echo "3) Local network (без Telegram auth)"
read -p "Выберите [1]: " DEPLOY_MODE
DEPLOY_MODE=${DEPLOY_MODE:-1}

# Определяем compose файл
if [ "$DEPLOY_MODE" = "1" ]; then
    COMPOSE_FILE="docker-compose.dev.yml"
    echo -e "${GREEN}✓ Development режим${NC}"
elif [ "$DEPLOY_MODE" = "3" ]; then
    COMPOSE_FILE="docker-compose.yml"
    echo -e "${YELLOW}⚠ Local network (без авторизации)${NC}"
else
    COMPOSE_FILE="docker-compose.yml"
    echo -e "${GREEN}✓ Production режим${NC}"
fi

# URL настройки
echo ""
echo -e "${YELLOW}🌐 Настройка URL:${NC}"
echo "Примеры:"
echo "  - http://localhost (локально)"
echo "  - http://192.168.0.3 (локальная сеть)"  
echo "  - http://tf.example.com (домен без порта)"
echo "  - http://example.com (домен)"

read -p "BASE_URL [http://localhost]: " BASE_URL
BASE_URL=${BASE_URL:-http://localhost}

read -p "Backend порт [8180]: " BACKEND_PORT
BACKEND_PORT=${BACKEND_PORT:-8180}

read -p "Frontend порт [5180]: " FRONTEND_PORT
FRONTEND_PORT=${FRONTEND_PORT:-5180}

# Telegram Token
echo ""
echo -e "${YELLOW}🤖 Telegram Bot:${NC}"

CURRENT_TOKEN=""
if [ -f "backend/.env" ]; then
    CURRENT_TOKEN=$(grep "^TELEGRAM_BOT_TOKEN=" backend/.env 2>/dev/null | cut -d'=' -f2)
fi

if [ -n "$CURRENT_TOKEN" ]; then
    echo -e "${GREEN}Текущий токен: ${CURRENT_TOKEN:0:15}...${NC}"
    read -p "Использовать текущий токен? (y/n) [y]: " USE_CURRENT
    USE_CURRENT=${USE_CURRENT:-y}
    
    if [ "$USE_CURRENT" = "y" ]; then
        BOT_TOKEN="$CURRENT_TOKEN"
    else
        read -p "Новый Telegram Bot Token: " BOT_TOKEN
    fi
else
    read -p "Telegram Bot Token (@BotFather): " BOT_TOKEN
fi

if [ -z "$BOT_TOKEN" ]; then
    echo -e "${RED}❌ Bot Token обязателен!${NC}"
    exit 1
fi

# Получаем bot username
echo "📡 Получаю информацию о боте..."
BOT_INFO=$(curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getMe")
BOT_USERNAME=$(echo "$BOT_INFO" | grep -o '"username":"[^"]*' | cut -d'"' -f4)

if [ -z "$BOT_USERNAME" ]; then
    echo -e "${RED}❌ Не удалось получить username бота!${NC}"
    echo "Проверьте токен или попробуйте позже."
    exit 1
fi

echo -e "${GREEN}✓ Бот: @${BOT_USERNAME}${NC}"

# Создаем конфигурацию
echo ""
echo -e "${YELLOW}📝 Создание конфигурации...${NC}"

# Корневой .env
cat > .env << EOF
BACKEND_PORT=${BACKEND_PORT}
FRONTEND_PORT=${FRONTEND_PORT}
BASE_URL=${BASE_URL}
EOF

# Frontend .env
# Убираем trailing slash из BASE_URL если есть
BASE_URL_CLEAN=$(echo "$BASE_URL" | sed 's:/*$::')

cat > frontend/.env << EOF
VITE_API_URL=${BASE_URL_CLEAN}:${BACKEND_PORT}
EOF

# Извлекаем домен из BASE_URL для vite.config.ts
DOMAIN=$(echo "$BASE_URL" | sed 's|https*://||' | cut -d':' -f1)

# Обновляем vite.config.ts с allowedHosts
cat > frontend/vite.config.ts << EOFVITE
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: [
      '${DOMAIN}',
      '.${DOMAIN}',
      'localhost',
      '127.0.0.1'
    ]
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
  }
})
EOFVITE

echo -e "${GREEN}✓ Vite config обновлен (allowedHosts: ${DOMAIN})${NC}"

# Backend .env
SECRET_KEY=$(openssl rand -hex 32 2>/dev/null || echo "dev-secret-key-$(date +%s)")

cat > backend/.env << EOF
APP_NAME=TeamFlow
VERSION=0.3.1
DEBUG=False

BASE_URL=${BASE_URL}
BACKEND_PORT=${BACKEND_PORT}
FRONTEND_PORT=${FRONTEND_PORT}

TELEGRAM_BOT_TOKEN=${BOT_TOKEN}
TELEGRAM_BOT_USERNAME=${BOT_USERNAME}

DATABASE_URL=sqlite+aiosqlite:///./data/teamflow.db
API_HOST=0.0.0.0
API_PORT=8000

BACKEND_CORS_ORIGINS=["${BASE_URL}:${FRONTEND_PORT}","${BASE_URL}","http://localhost:${FRONTEND_PORT}"]

SECRET_KEY=${SECRET_KEY}
DB_POOL_SIZE=5
DB_MAX_OVERFLOW=10
EOF

echo -e "${GREEN}✓ Конфигурация создана${NC}"

# Docker
echo ""
echo -e "${YELLOW}🐳 Docker...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker не установлен!${NC}"
    exit 1
fi

# Очистка
echo "Остановка старых контейнеров..."
docker-compose -f $COMPOSE_FILE down 2>/dev/null || true

if [ "$DEPLOY_MODE" != "1" ]; then
    echo "Очистка образов..."
    docker rm -f teamflow-backend teamflow-frontend 2>/dev/null || true
    docker rmi teamflow_backend teamflow_frontend 2>/dev/null || true
fi

# Сборка
echo ""
echo -e "${YELLOW}🔨 Сборка...${NC}"

if [ "$DEPLOY_MODE" = "1" ]; then
    echo "(Development: быстрая сборка с volume mounts)"
    docker-compose -f $COMPOSE_FILE up --build -d
else
    echo "(Production: полная пересборка)"
    docker-compose -f $COMPOSE_FILE build --no-cache
    docker-compose -f $COMPOSE_FILE up -d
fi

# Ожидание
echo ""
echo "⏳ Ожидание запуска..."
sleep 5

# Статус
echo ""
docker-compose -f $COMPOSE_FILE ps

# Финал
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       🎉 TeamFlow запущен! 🎉        ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📍 Доступ:${NC}"
echo "   Web UI:   ${BASE_URL}:${FRONTEND_PORT}"
echo "   Backend:  ${BASE_URL}:${BACKEND_PORT}"
echo ""
echo -e "${BLUE}🤖 Telegram:${NC}"
echo "   Bot: @${BOT_USERNAME}"
echo "   Добавьте в чат и отправьте: /start"
echo ""

if [ "$DEPLOY_MODE" = "3" ]; then
    echo -e "${YELLOW}⚠️  Telegram авторизация не будет работать в локальной сети${NC}"
    echo "   Используйте VPN или публичный домен для авторизации"
    echo ""
fi

echo -e "${BLUE}📝 Команды:${NC}"
echo "   Логи:    docker-compose -f $COMPOSE_FILE logs -f"
echo "   Рестарт: docker-compose -f $COMPOSE_FILE restart"
echo "   Стоп:    docker-compose -f $COMPOSE_FILE down"
echo ""
