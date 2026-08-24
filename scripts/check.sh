#!/bin/bash
# Local "CI" — same checks a GitHub Actions workflow would run, minus the
# Actions runner (see DEVELOPMENT.md: this repo only uses GitHub for storage,
# nothing triggers on push there). Run manually with `./scripts/check.sh`,
# or automatically on push once `.githooks/pre-push` is enabled
# (`git config core.hooksPath .githooks` — see DEVELOPMENT.md).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILED=0
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

run_check() {
    local name="$1"; shift
    echo -e "${YELLOW}→ ${name}${NC}"
    if "$@"; then
        echo -e "${GREEN}✓ ${name}${NC}"
    else
        echo -e "${RED}✗ ${name}${NC}"
        FAILED=1
    fi
    echo ""
}

# --- Backend ---
cd "$ROOT/backend"

if command -v ruff >/dev/null 2>&1; then
    run_check "ruff check app" ruff check app
else
    echo -e "${YELLOW}⚠ ruff не установлен (pip install --user ruff) — пропускаю lint${NC}\n"
fi

run_check "pytest (backend)" python3 -m pytest -q

# --- Frontend ---
cd "$ROOT/frontend"

run_check "tsc --noEmit" npx tsc --noEmit
run_check "eslint" npx eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0
run_check "vitest run" npx vitest run

cd "$ROOT"

if [ "$FAILED" -ne 0 ]; then
    echo -e "${RED}Есть непройденные проверки.${NC}"
    exit 1
fi

echo -e "${GREEN}Все проверки зелёные.${NC}"
exit 0
