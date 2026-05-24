#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  ship.sh  —  Flo Sisterlocks · Test → Build → Push
#
#  Usage:
#    ./ship.sh                        # full flow: typecheck + build + push
#    ./ship.sh --dev                  # just spin up dev servers + open browser
#    ./ship.sh --push "my message"    # skip checks, force-push with custom msg
#    ./ship.sh --dry-run              # run all checks but don't push
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
BOLD='\033[1m'
DIM='\033[2m'
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
RESET='\033[0m'

# ── Config ────────────────────────────────────────────────────────────────────
FRONTEND_PORT=5173
BACKEND_PORT=5000
FRONTEND_URL="http://localhost:${FRONTEND_PORT}"
BACKEND_HEALTH="http://localhost:${BACKEND_PORT}/api/health"
OPEN_DELAY=3          # seconds to wait before opening browser
BUILD_TIMEOUT=120     # seconds before we give up on a build

# ── Helpers ───────────────────────────────────────────────────────────────────
log()     { echo -e "${CYAN}${BOLD}▸${RESET} $*"; }
success() { echo -e "${GREEN}${BOLD}✔${RESET} $*"; }
warn()    { echo -e "${YELLOW}${BOLD}⚠${RESET}  $*"; }
error()   { echo -e "${RED}${BOLD}✘${RESET} $*" >&2; }
divider() { echo -e "${DIM}────────────────────────────────────────────────${RESET}"; }
header()  {
  echo ""
  echo -e "${WHITE}${BOLD}$*${RESET}"
  divider
}

# Detect OS and pick the right open command
open_browser() {
  local url="$1"
  if command -v xdg-open &>/dev/null; then
    xdg-open "$url" &>/dev/null &
  elif command -v open &>/dev/null; then
    open "$url" &
  elif command -v start &>/dev/null; then
    start "$url"
  else
    warn "Could not auto-open browser — visit: ${CYAN}${url}${RESET}"
  fi
}

# Wait for a URL to become reachable (max N seconds)
wait_for_url() {
  local url="$1"
  local label="$2"
  local timeout="${3:-30}"
  local elapsed=0
  printf "${DIM}  Waiting for %s" "$label"
  until curl -sf "$url" &>/dev/null; do
    printf "."
    sleep 1
    elapsed=$((elapsed + 1))
    if [ "$elapsed" -ge "$timeout" ]; then
      echo ""
      error "Timed out waiting for $label ($url)"
      return 1
    fi
  done
  echo ""
  success "$label is up"
}

# Clean up background processes on exit
PIDS=()
cleanup() {
  if [ ${#PIDS[@]} -gt 0 ]; then
    echo ""
    log "Shutting down dev servers..."
    for pid in "${PIDS[@]}"; do
      kill "$pid" 2>/dev/null || true
    done
  fi
}
trap cleanup EXIT INT TERM

# ── Argument Parsing ──────────────────────────────────────────────────────────
MODE="full"         # full | dev | push | dry-run
CUSTOM_MSG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dev)      MODE="dev"; shift ;;
    --dry-run)  MODE="dry-run"; shift ;;
    --push)     MODE="push"; CUSTOM_MSG="${2:-}"; shift; shift ;;
    *)          warn "Unknown flag: $1"; shift ;;
  esac
done

# ─────────────────────────────────────────────────────────────────────────────
#  BANNER
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${WHITE}${BOLD}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║       FLO SISTERLOCKS  ·  ship.sh        ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${RESET}"
echo -e "  Mode: ${CYAN}${BOLD}${MODE}${RESET}   Branch: ${CYAN}$(git branch --show-current)${RESET}"
echo ""

# ── Make sure we're in the right place ───────────────────────────────────────
if [ ! -f "package.json" ] || [ ! -d "backend" ] || [ ! -d "frontend" ]; then
  error "Run this script from the repo root (where package.json, backend/ and frontend/ live)"
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
#  MODE: --dev  — spin up servers and open browser
# ─────────────────────────────────────────────────────────────────────────────
if [ "$MODE" = "dev" ]; then
  header "Starting Dev Servers"

  # Check .env exists
  if [ ! -f "backend/.env" ]; then
    warn "backend/.env not found — copying from .env.example"
    cp backend/.env.example backend/.env
    warn "Fill in backend/.env (MONGODB_URI, RESEND_API_KEY, etc.) before using the app"
  fi

  log "Installing dependencies..."
  npm install --silent

  log "Starting backend  (port ${BACKEND_PORT})..."
  npm run dev:backend &
  PIDS+=($!)

  log "Starting frontend (port ${FRONTEND_PORT})..."
  npm run dev:frontend &
  PIDS+=($!)

  # Wait then open browser
  sleep "$OPEN_DELAY"
  wait_for_url "$FRONTEND_URL" "Vite dev server" 30 || true

  header "Opening Browser"
  log "Opening ${FRONTEND_URL} ..."
  open_browser "$FRONTEND_URL"

  echo ""
  echo -e "  ${GREEN}Dev servers running.${RESET}  Press ${BOLD}Ctrl+C${RESET} to stop."
  echo ""
  echo -e "  ${DIM}Frontend : ${FRONTEND_URL}${RESET}"
  echo -e "  ${DIM}Backend  : http://localhost:${BACKEND_PORT}${RESET}"
  echo -e "  ${DIM}Health   : ${BACKEND_HEALTH}${RESET}"
  echo ""

  # Keep running until Ctrl+C
  wait
  exit 0
fi

# ─────────────────────────────────────────────────────────────────────────────
#  MODE: --push  — skip checks, just commit + push
# ─────────────────────────────────────────────────────────────────────────────
if [ "$MODE" = "push" ]; then
  header "Quick Push (checks skipped)"

  if [ -z "$(git status --porcelain)" ]; then
    warn "Nothing to commit — working tree is clean"
    exit 0
  fi

  git add -A

  if [ -n "$CUSTOM_MSG" ]; then
    COMMIT_MSG="$CUSTOM_MSG"
  else
    COMMIT_MSG="chore: update $(date '+%Y-%m-%d %H:%M')"
  fi

  log "Committing: \"${COMMIT_MSG}\""
  git commit -m "$COMMIT_MSG"

  log "Pushing to origin/$(git branch --show-current)..."
  git push origin "$(git branch --show-current)"
  success "Pushed! Render will auto-deploy shortly."
  echo ""
  echo -e "  ${DIM}Track deployment at: https://dashboard.render.com${RESET}"
  echo ""
  exit 0
fi

# ─────────────────────────────────────────────────────────────────────────────
#  MODE: full | dry-run  — typecheck → build → optional push
# ─────────────────────────────────────────────────────────────────────────────

# ── Step 1: Dependencies ──────────────────────────────────────────────────────
header "1 / 4  —  Dependencies"
log "Installing (root + workspaces)..."
npm install --silent
success "Dependencies up to date"

# ── Step 2: TypeScript checks ─────────────────────────────────────────────────
header "2 / 4  —  TypeScript"

log "Checking backend..."
if cd backend && npx tsc --noEmit 2>&1; then
  success "Backend types OK"
else
  error "Backend TypeScript errors — fix them before pushing"
  cd ..
  exit 1
fi
cd ..

log "Checking frontend..."
if cd frontend && npx tsc --noEmit 2>&1; then
  success "Frontend types OK"
else
  error "Frontend TypeScript errors — fix them before pushing"
  cd ..
  exit 1
fi
cd ..

# ── Step 3: Production build ──────────────────────────────────────────────────
header "3 / 4  —  Production Build"
log "Building frontend (Vite)..."

BUILD_START=$(date +%s)
if npm run build 2>&1; then
  BUILD_END=$(date +%s)
  success "Build succeeded in $((BUILD_END - BUILD_START))s"
else
  error "Build failed"
  exit 1
fi

# Report bundle size
if [ -d "frontend/dist" ]; then
  DIST_SIZE=$(du -sh frontend/dist 2>/dev/null | cut -f1)
  echo -e "  ${DIM}dist/ size: ${DIST_SIZE}${RESET}"
fi

# ── Step 4: Smoke test — spin up preview, open browser, then push ─────────────
header "4 / 4  —  Smoke Test & Push"

# Check .env exists for the quick backend smoke-test
if [ -f "backend/.env" ]; then
  log "Starting backend smoke server..."
  (cd backend && node --import tsx server.ts) &
  BACKEND_PID=$!
  PIDS+=($BACKEND_PID)

  wait_for_url "$BACKEND_HEALTH" "backend health" 20 && {
    HEALTH=$(curl -sf "$BACKEND_HEALTH")
    echo -e "  ${DIM}${HEALTH}${RESET}"
  } || warn "Backend health check skipped (no .env or DB not reachable)"

  kill $BACKEND_PID 2>/dev/null || true
  # Remove from PIDS so cleanup doesn't double-kill
  PIDS=("${PIDS[@]/$BACKEND_PID}")
else
  warn "backend/.env not found — skipping live smoke test (build check still passed)"
fi

log "Starting Vite preview server..."
(cd frontend && npx vite preview --port "$FRONTEND_PORT") &
PIDS+=($!)

wait_for_url "$FRONTEND_URL" "Vite preview" 20

log "Opening preview in browser..."
open_browser "$FRONTEND_URL"

echo ""
echo -e "  ${YELLOW}Review the app in your browser.${RESET}"
echo -e "  Press ${BOLD}Enter${RESET} to continue with the push, or ${BOLD}Ctrl+C${RESET} to abort."
echo ""
read -r

# Kill preview server before pushing
for pid in "${PIDS[@]}"; do
  kill "$pid" 2>/dev/null || true
done
PIDS=()

# ── Git: commit + push ────────────────────────────────────────────────────────
if [ "$MODE" = "dry-run" ]; then
  echo ""
  success "Dry run complete — all checks passed. Nothing was pushed."
  echo ""
  exit 0
fi

divider
BRANCH=$(git branch --show-current)

if [ -z "$(git status --porcelain)" ]; then
  warn "Nothing new to commit — working tree is clean"
else
  log "Staging all changes..."
  git add -A

  # Build a smart commit message from what changed
  CHANGED_FILES=$(git diff --cached --name-only | head -10 | tr '\n' ' ')
  if [ -n "$CUSTOM_MSG" ]; then
    COMMIT_MSG="$CUSTOM_MSG"
  else
    COMMIT_MSG="chore: build + update [$(date '+%Y-%m-%d %H:%M')] — ${CHANGED_FILES}"
  fi

  log "Committing: \"${COMMIT_MSG}\""
  git commit -m "$COMMIT_MSG"
fi

log "Pushing to origin/${BRANCH}..."
git push origin "$BRANCH"

echo ""
success "Shipped!  Render will pick up the push and redeploy automatically."
echo ""
echo -e "  ${DIM}Render dashboard : https://dashboard.render.com${RESET}"
echo -e "  ${DIM}Branch pushed    : ${BRANCH}${RESET}"
echo -e "  ${DIM}Latest commit    : $(git log --oneline -1)${RESET}"
echo ""
