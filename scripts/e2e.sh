#!/bin/bash
# E2E tests — spins up an isolated docker-compose stack (throwaway SQLite
# DB, no Telegram bot token, ports 8199/5199 so it never collides with a
# real dev/prod TeamFlow instance), runs Playwright against it, then tears
# the stack down. Not part of scripts/check.sh — this is slow (docker
# build + browser) and needs Docker, so it's opt-in, not on every push.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT/docker-compose.e2e.yml"
YELLOW='\033[1;33m'
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

cleanup() {
    echo -e "${YELLOW}→ Останавливаю e2e-стек${NC}"
    docker compose -f "$COMPOSE_FILE" down -v --remove-orphans >/dev/null 2>&1
}
trap cleanup EXIT

echo -e "${YELLOW}→ Собираю и поднимаю изолированный e2e-стек (порты 8199/5199)${NC}"
if ! docker compose -f "$COMPOSE_FILE" up -d --build; then
    echo -e "${RED}✗ Не удалось поднять e2e-стек${NC}"
    exit 1
fi

echo -e "${YELLOW}→ Жду backend health${NC}"
for i in $(seq 1 30); do
    if curl -fs http://localhost:8199/health >/dev/null 2>&1; then
        echo -e "${GREEN}✓ backend healthy${NC}"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo -e "${RED}✗ backend не поднялся за отведённое время${NC}"
        docker compose -f "$COMPOSE_FILE" logs backend | tail -50
        exit 1
    fi
    sleep 2
done

cd "$ROOT/frontend"
echo -e "${YELLOW}→ Запускаю Playwright${NC}"
npx playwright test "$@"
EXIT_CODE=$?

if [ "$EXIT_CODE" -eq 0 ]; then
    echo -e "${GREEN}Все E2E-тесты зелёные.${NC}"
else
    echo -e "${RED}E2E-тесты упали.${NC}"
fi
exit $EXIT_CODE
