#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_URL="${BACKEND_URL:-}"
BACKEND_SCRIPT="$BACKEND_DIR/backend.sh"
FRONTEND_COMMAND=(bun run dev)
BACKEND_LOG_FILE=""
BACKEND_PID=""
FRONTEND_PID=""

if [[ -t 1 ]]; then
  COLOR_RESET=$'\033[0m'
  COLOR_BOLD=$'\033[1m'
  COLOR_BLUE=$'\033[34m'
  COLOR_GREEN=$'\033[32m'
  COLOR_YELLOW=$'\033[33m'
  COLOR_RED=$'\033[31m'
  COLOR_CYAN=$'\033[36m'
else
  COLOR_RESET=""
  COLOR_BOLD=""
  COLOR_BLUE=""
  COLOR_GREEN=""
  COLOR_YELLOW=""
  COLOR_RED=""
  COLOR_CYAN=""
fi

log_info() {
  printf '%b%s%b\n' "$COLOR_BLUE" "$*" "$COLOR_RESET"
}

log_success() {
  printf '%b%s%b\n' "$COLOR_GREEN" "$*" "$COLOR_RESET"
}

log_warn() {
  printf '%b%s%b\n' "$COLOR_YELLOW" "$*" "$COLOR_RESET" >&2
}

log_error() {
  printf '%b%s%b\n' "$COLOR_RED" "$*" "$COLOR_RESET" >&2
}

colorize_backend_log() {
  if [[ -z "$COLOR_RESET" ]]; then
    cat
    return 0
  fi

  awk -v reset="$COLOR_RESET" \
      -v green="$COLOR_GREEN" \
      -v yellow="$COLOR_YELLOW" \
      -v red="$COLOR_RED" \
      -v cyan="$COLOR_CYAN" \
      -v bold="$COLOR_BOLD" '
    {
      line = $0

      if (line ~ /\[FTL\]/ || line ~ /\[ERR\]/ || line ~ /Unhandled exception/) {
        print red bold line reset
      } else if (line ~ /\[WRN\]/) {
        print yellow bold line reset
      } else if (line ~ /\[INF\]/ || line ~ /Starting web application/ || line ~ /Application started/) {
        print green line reset
      } else if (line ~ /SELECT |INSERT |UPDATE |DELETE |SET |FROM |WHERE |VALUES |INTO /) {
        print cyan line reset
      } else {
        print line
      }
    }
  '
}

stop_existing_backend_on_port() {
  local listener_pids cmdline
  listener_pids=$(lsof -tiTCP:5000 -sTCP:LISTEN 2>/dev/null || true)

  [[ -z "$listener_pids" ]] && return 0

  local killed_any=0
  for pid in $listener_pids; do
    cmdline=$(ps -p "$pid" -o args= 2>/dev/null || true)
    if [[ "$cmdline" == *"$BACKEND_DIR/Api/bin"* || "$cmdline" == *"dotnet"*"Api.dll"* ]]; then
      log_warn "Stopping existing backend listener on port 5000 (pid $pid)."
      kill "$pid" >/dev/null 2>&1 || true
      killed_any=1
    fi
  done

  if (( killed_any )); then
    for _ in {1..20}; do
      if ! lsof -tiTCP:5000 -sTCP:LISTEN >/dev/null 2>&1; then
        return 0
      fi
      sleep 0.2
    done
  fi

  if lsof -tiTCP:5000 -sTCP:LISTEN >/dev/null 2>&1; then
    log_error "Port 5000 is already in use and does not appear to belong to this backend."
    return 1
  fi
}

stop_existing_frontend_dev() {
  local listener_pids cmdline
  listener_pids=$(lsof -tiTCP:3000 -sTCP:LISTEN 2>/dev/null || true)
  listener_pids+=$'\n'$(lsof -tiTCP:3001 -sTCP:LISTEN 2>/dev/null || true)

  local killed_any=0
  for pid in $listener_pids; do
    [[ -z "$pid" ]] && continue
    cmdline=$(ps -p "$pid" -o args= 2>/dev/null || true)
    if [[ "$cmdline" == *"$FRONTEND_DIR"* || "$cmdline" == *"next dev"* ]]; then
      log_warn "Stopping existing frontend dev process (pid $pid)."
      kill "$pid" >/dev/null 2>&1 || true
      killed_any=1
    fi
  done

  if (( killed_any )); then
    for _ in {1..20}; do
      if ! pgrep -f "$FRONTEND_DIR/node_modules/next" >/dev/null 2>&1; then
        rm -f "$FRONTEND_DIR/.next/dev/lock" 2>/dev/null || true
        return 0
      fi
      sleep 0.2
    done

    if pgrep -f "$FRONTEND_DIR/node_modules/next" >/dev/null 2>&1; then
      log_warn "Forcing stale frontend dev process shutdown."
      pgrep -f "$FRONTEND_DIR/node_modules/next" | xargs -r kill -9 >/dev/null 2>&1 || true
    fi
  fi

  if lsof -tiTCP:3000 -sTCP:LISTEN >/dev/null 2>&1 || lsof -tiTCP:3001 -sTCP:LISTEN >/dev/null 2>&1; then
    log_warn "Frontend ports 3000/3001 are still in use; next dev may choose another port or fail on lock." 
  fi

  rm -f "$FRONTEND_DIR/.next/dev/lock" 2>/dev/null || true
}

cleanup() {
  if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
    kill "$FRONTEND_PID" >/dev/null 2>&1 || true
  fi

  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi

  if [[ -n "$BACKEND_LOG_FILE" && -f "$BACKEND_LOG_FILE" ]]; then
    rm -f "$BACKEND_LOG_FILE"
  fi
}

backend_is_ready() {
  if [[ -z "$BACKEND_URL" ]]; then
    return 1
  fi

  if command -v curl >/dev/null 2>&1; then
    curl -fsS "$BACKEND_URL/" >/dev/null 2>&1
    return $?
  fi

  if command -v wget >/dev/null 2>&1; then
    wget -qO- "$BACKEND_URL/" >/dev/null 2>&1
    return $?
  fi

  echo "Neither curl nor wget is available to check backend readiness." >&2
  return 1
}

detect_backend_url_from_log() {
  if [[ -z "$BACKEND_LOG_FILE" || ! -f "$BACKEND_LOG_FILE" ]]; then
    return 1
  fi

  # Typical Kestrel log line: "Now listening on: http://localhost:5099"
  local detected_url
  detected_url=$(grep -Eo 'Now listening on:[[:space:]]+https?://[^[:space:]]+' "$BACKEND_LOG_FILE" \
    | tail -n 1 \
    | sed -E 's/.*Now listening on:[[:space:]]+//')

  if [[ -n "$detected_url" ]]; then
    BACKEND_URL="$detected_url"
    return 0
  fi

  return 1
}

wait_for_backend() {
  local attempts=0
  local max_attempts=120
  local last_size=0

  while (( attempts < max_attempts )); do
    if ! kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
      wait "$BACKEND_PID" || true
      log_error "Backend exited before becoming ready."
      if [[ -f "$BACKEND_LOG_FILE" ]]; then
        printf '%b--- backend log ---%b\n' "$COLOR_BOLD" "$COLOR_RESET" >&2
        tail -c +$((last_size + 1)) "$BACKEND_LOG_FILE" | colorize_backend_log >&2 || true
      fi
      return 1
    fi

    if [[ -f "$BACKEND_LOG_FILE" ]]; then
      local current_size
      current_size=$(wc -c < "$BACKEND_LOG_FILE" 2>/dev/null || echo 0)
      if (( current_size > last_size )); then
        tail -c +$((last_size + 1)) "$BACKEND_LOG_FILE" | colorize_backend_log >&2 || true
        last_size=$current_size
      fi
    fi

    if [[ -z "$BACKEND_URL" ]]; then
      detect_backend_url_from_log || true
    fi

    if backend_is_ready; then
      return 0
    fi

    sleep 1
    ((attempts++))
  done

  log_error "Timed out waiting for backend to become ready at $BACKEND_URL."
  if [[ -f "$BACKEND_LOG_FILE" ]]; then
    printf '%b--- backend log ---%b\n' "$COLOR_BOLD" "$COLOR_RESET" >&2
    tail -c +$((last_size + 1)) "$BACKEND_LOG_FILE" | colorize_backend_log >&2 || true
  fi
  return 1
}

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required but was not found in PATH." >&2
  exit 1
fi

if [[ ! -x "$BACKEND_SCRIPT" ]]; then
  log_error "Backend script not found or not executable: $BACKEND_SCRIPT"
  exit 1
fi

trap cleanup EXIT INT TERM

BACKEND_LOG_FILE="$(mktemp)"

if ! stop_existing_backend_on_port; then
  exit 1
fi

stop_existing_frontend_dev

log_info "Starting backend..."
bash "$BACKEND_SCRIPT" run >"$BACKEND_LOG_FILE" 2>&1 &
BACKEND_PID=$!

if ! wait_for_backend; then
  exit 1
fi

if [[ -z "$BACKEND_URL" ]]; then
  log_error "Backend started but listening URL could not be detected."
  if [[ -f "$BACKEND_LOG_FILE" ]]; then
    echo "--- backend log ---" >&2
    tail -n 100 "$BACKEND_LOG_FILE" >&2 || true
  fi
  exit 1
fi

log_success "Backend is ready at $BACKEND_URL"
log_info "Starting frontend..."

cd "$FRONTEND_DIR"
export NEXT_PUBLIC_API_BASE_URL="$BACKEND_URL"

"${FRONTEND_COMMAND[@]}" &
FRONTEND_PID=$!

wait "$FRONTEND_PID"
