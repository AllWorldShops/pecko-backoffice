#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Pecko BOM Converter — startup script
#
# Usage (development):   ./scripts/start.sh
# Usage (production):    NODE_ENV=production ./scripts/start.sh
#   or just:             ./scripts/start.sh   (reads NODE_ENV from .env)
#
# What this script does on every run:
#   1. Validates that .env exists
#   2. Installs/updates npm dependencies (fast — skips if already up to date)
#   3. Builds the React frontend (production only)
#   4. Syncs the SQLite schema (creates tables if they don't exist)
#   5. Seeds default data — admin user, K&S customer, UOM mappings (idempotent)
#   6. Starts the Express server
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$APP_DIR"

# ── Colour helpers ────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
log()  { echo -e "${GREEN}  ●${NC}  $1"; }
warn() { echo -e "${YELLOW}  ▲${NC}  $1"; }
die()  { echo -e "\n${RED}  ✖  ERROR:${NC}  $1\n" >&2; exit 1; }
sep()  { echo -e "${BOLD}  ────────────────────────────────────────${NC}"; }

sep
echo -e "${BOLD}      Pecko BOM Converter${NC}"
sep
echo ""

# ── Step 1: .env ─────────────────────────────────────────────────────────────
if [ ! -f "$APP_DIR/.env" ]; then
  die ".env not found.\n\n  Fix:\n    cd $APP_DIR\n    cp .env.example .env\n    # Then fill in ANTHROPIC_API_KEY, JWT_SECRET, JWT_REFRESH_SECRET"
fi

# Load .env into the current shell so the server picks them up
set -a
# shellcheck source=/dev/null
source "$APP_DIR/.env"
set +a

log ".env loaded"

# ── Step 2: Node.js ───────────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || die "Node.js not found.\n  Install Node.js 20+ from https://nodejs.org"
NODE_VER=$(node -e "process.stdout.write(process.version)")
log "Node.js $NODE_VER"

# ── Step 3: Dependencies ──────────────────────────────────────────────────────
log "Checking dependencies..."
npm install --prefer-offline --silent 2>&1 || npm install --silent
log "Dependencies ready"

# ── Step 4: Build frontend (production only) ──────────────────────────────────
if [ "${NODE_ENV:-development}" = "production" ]; then
  log "Building frontend..."
  npm run build --workspace=client 2>&1 | tail -3
  log "Frontend built  →  client/dist/"
else
  warn "Development mode — frontend served by Vite dev server (port 5173)"
fi

# ── Step 5: Database schema sync ─────────────────────────────────────────────
log "Syncing database schema..."
node_modules/.bin/prisma db push --schema=prisma/schema.prisma --skip-generate 2>&1 \
  | grep -E "(Your database|Generated Prisma|Error)" || true
node_modules/.bin/prisma generate --schema=prisma/schema.prisma 2>&1 \
  | grep -v "^$" | tail -2 || true
log "Database schema ready  →  ${DATABASE_URL:-file:./pecko.db}"

# ── Step 6: Seed ──────────────────────────────────────────────────────────────
log "Verifying seed data..."
node prisma/seed.js 2>&1 | sed 's/^/    /'
log "Seed data verified"

# ── Step 7: Start ─────────────────────────────────────────────────────────────
echo ""
sep

# Detect local IP for display
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}') \
  || LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null) \
  || LOCAL_IP="localhost"
PORT="${PORT:-3001}"

if [ "${NODE_ENV:-development}" = "production" ]; then
  echo -e "${BOLD}  App is running at:${NC}"
  echo -e "    ${GREEN}Local:${NC}    http://localhost:$PORT"
  echo -e "    ${GREEN}Network:${NC}  http://$LOCAL_IP:$PORT"
  echo -e "\n  Login: admin@pecko.com  /  Admin@123"
else
  echo -e "${BOLD}  Development mode:${NC}"
  echo -e "    ${GREEN}Frontend:${NC}  http://localhost:5173"
  echo -e "    ${GREEN}Backend:${NC}   http://localhost:$PORT"
fi

sep
echo ""

# Replace the shell process with the server (clean PID for systemd)
exec node server/index.js
