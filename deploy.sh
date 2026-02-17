#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${YELLOW}╔═══════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║         TeamFlow Deploy Script        ║${NC}"
echo -e "${YELLOW}╚═══════════════════════════════════════╝${NC}"
echo ""

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

# Текущая конфигурация
if [ -f ".env" ]; then
    echo -e "${YELLOW}📋 Текущая конфигурация:${NC}"
    cat .env | grep -v "^#" | grep -v "^$"
    echo ""
fi

# Режим
echo -e "${YELLOW}🔧 Режим:${NC}"
echo "  1) Development  - volume mounts, изменения без пересборки"
echo "  2) Production   - полная сборка образов"
read -p "Выберите [1]: " DEPLOY_MODE
DEPLOY_MODE=${DEPLOY_MODE:-1}

if [ "$DEPLOY_MODE" = "1" ]; then
    COMPOSE_FILE="docker-compose.dev.yml"
    echo -e "${GREEN}✓ Development режим (hot reload)${NC}"
else
    COMPOSE_FILE="docker-compose.yml"
    echo -e "${GREEN}✓ Production режим${NC}"
fi

# URL
echo ""
echo -e "${YELLOW}🌐 URL сервера:${NC}"
echo "  Примеры: http://192.168.0.3  /  http://tf.example.com"

CURRENT_URL=""
[ -f ".env" ] && CURRENT_URL=$(grep "^BASE_URL=" .env 2>/dev/null | cut -d'=' -f2)

if [ -n "$CURRENT_URL" ]; then
    read -p "BASE_URL [${CURRENT_URL}]: " BASE_URL
    BASE_URL=${BASE_URL:-$CURRENT_URL}
else
    read -p "BASE_URL [http://localhost]: " BASE_URL
    BASE_URL=${BASE_URL:-http://localhost}
fi

# Убираем trailing slash
BASE_URL=$(echo "$BASE_URL" | sed 's:/*$::')

read -p "Backend порт [8180]: " BACKEND_PORT
BACKEND_PORT=${BACKEND_PORT:-8180}

read -p "Frontend порт [5180]: " FRONTEND_PORT
FRONTEND_PORT=${FRONTEND_PORT:-5180}

# Telegram
echo ""
echo -e "${YELLOW}🤖 Telegram Bot:${NC}"

CURRENT_TOKEN=""
[ -f "backend/.env" ] && CURRENT_TOKEN=$(grep "^TELEGRAM_BOT_TOKEN=" backend/.env 2>/dev/null | cut -d'=' -f2)

if [ -n "$CURRENT_TOKEN" ]; then
    echo -e "${GREEN}Текущий токен: ${CURRENT_TOKEN:0:15}...${NC}"
    read -p "Использовать текущий? (y/n) [y]: " USE_CURRENT
    USE_CURRENT=${USE_CURRENT:-y}
    [ "$USE_CURRENT" != "y" ] && read -p "Новый токен: " BOT_TOKEN || BOT_TOKEN="$CURRENT_TOKEN"
else
    read -p "Telegram Bot Token (@BotFather): " BOT_TOKEN
fi

[ -z "$BOT_TOKEN" ] && { echo -e "${RED}❌ Token обязателен!${NC}"; exit 1; }

echo "📡 Получаю данные бота..."
BOT_INFO=$(curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getMe")
BOT_USERNAME=$(echo "$BOT_INFO" | grep -o '"username":"[^"]*' | cut -d'"' -f4)

[ -z "$BOT_USERNAME" ] && { echo -e "${RED}❌ Неверный токен!${NC}"; exit 1; }
echo -e "${GREEN}✓ Бот: @${BOT_USERNAME}${NC}"

# Извлекаем домен (без trailing slash)
DOMAIN=$(echo "$BASE_URL" | sed 's|https*://||' | sed 's:/*$::' | cut -d':' -f1)

# Создаём конфиги
echo ""
echo -e "${YELLOW}📝 Конфигурация...${NC}"

cat > .env << EOF
BACKEND_PORT=${BACKEND_PORT}
FRONTEND_PORT=${FRONTEND_PORT}
BASE_URL=${BASE_URL}
EOF

cat > frontend/.env << EOF
VITE_API_URL=${BASE_URL}:${BACKEND_PORT}
EOF

cat > frontend/vite.config.ts << EOFVITE
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: ['${DOMAIN}', 'localhost', '127.0.0.1']
  }
})
EOFVITE

SECRET_KEY=$(openssl rand -hex 32 2>/dev/null || echo "dev-secret-$(date +%s)")

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

echo -e "${GREEN}✓ Конфиги созданы${NC}"

# Docker
echo ""
echo -e "${YELLOW}🐳 Docker...${NC}"

docker-compose -f $COMPOSE_FILE down 2>/dev/null || true

if [ "$DEPLOY_MODE" = "2" ]; then
    docker rm -f teamflow-backend teamflow-frontend 2>/dev/null || true
    docker rmi teamflow_backend teamflow_frontend 2>/dev/null || true
    echo "Сборка (может занять несколько минут)..."
    docker-compose -f $COMPOSE_FILE build --no-cache
fi

echo "Запуск..."
docker-compose -f $COMPOSE_FILE up -d

sleep 5
echo ""
docker-compose -f $COMPOSE_FILE ps

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║        🎉 TeamFlow запущен! 🎉        ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Web UI:  ${BASE_URL}:${FRONTEND_PORT}${NC}"
echo -e "${BLUE}API:     ${BASE_URL}:${BACKEND_PORT}${NC}"
echo -e "${BLUE}Bot:     @${BOT_USERNAME}${NC}"
echo ""
echo -e "${YELLOW}📝 После изменений кода:${NC}"
if [ "$DEPLOY_MODE" = "1" ]; then
    echo "  Backend:  docker restart teamflow-backend"
    echo "  Frontend: docker restart teamflow-frontend"
else
    echo "  docker-compose up --build -d"
fi
echo ""
