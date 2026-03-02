#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[restart]${NC} $1"; }
warn() { echo -e "${YELLOW}[restart]${NC} $1"; }

# ── 1. Kill existing dev processes ──────────────────────────────────
log "Stopping existing processes..."

kill_port() {
  local port=$1
  local pids
  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill -TERM 2>/dev/null || true
    warn "Killed process(es) on port $port"
  fi
}

kill_matching() {
  local pattern=$1
  pkill -f "$pattern" 2>/dev/null && warn "Killed $pattern" || true
}

kill_port 3000
kill_port 3001
kill_matching "tsx watch src/workers/server.ts"
kill_matching "tsx watch src/scheduler/server.ts"

sleep 1

# ── 2. Ensure Docker infra is up ───────────────────────────────────
log "Ensuring redis is running..."
docker compose up -d redis 2>&1 | tail -1 || warn "Redis docker failed — may already be running"

if lsof -ti :5432 >/dev/null 2>&1; then
  log "Postgres already running on :5432"
else
  log "Starting postgres via docker..."
  docker compose up -d postgres 2>&1 | tail -1 || warn "Postgres docker failed"
fi

# ── 3. Start all services in background ─────────────────────────────
log "Starting backend API on :3000..."
npm run dev > /tmp/sl-api.log 2>&1 &

log "Starting worker..."
npm run dev:worker > /tmp/sl-worker.log 2>&1 &

log "Starting scheduler..."
npm run dev:scheduler > /tmp/sl-scheduler.log 2>&1 &

log "Starting frontend on :3001..."
npm run dev:frontend > /tmp/sl-frontend.log 2>&1 &

sleep 2

# ── 4. Verify ───────────────────────────────────────────────────────
echo ""
log "All services launched. Logs at /tmp/sl-*.log"
echo ""
echo -e "  API:        ${GREEN}http://localhost:3000${NC}  → /tmp/sl-api.log"
echo -e "  Worker:     ${GREEN}background${NC}             → /tmp/sl-worker.log"
echo -e "  Scheduler:  ${GREEN}background${NC}             → /tmp/sl-scheduler.log"
echo -e "  Frontend:   ${GREEN}http://localhost:3001${NC}  → /tmp/sl-frontend.log"
echo ""
echo -e "  ${YELLOW}Tip:${NC} tail -f /tmp/sl-api.log /tmp/sl-worker.log"
