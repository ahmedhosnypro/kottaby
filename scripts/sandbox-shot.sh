#!/usr/bin/env bash
# Sandbox QA shot helper.
#
# Launches `next dev` fresh, waits for /api/health, warms the target route
# (with a watchdog that restarts the server if it OOMs during compile),
# then drives agent-browser to open the route at a given viewport and
# capture a full-page screenshot.
#
# Everything runs inside one Bash tool call's process tree because the
# sandbox kills background processes when the tool call returns.
#
# Usage:
#   scripts/sandbox-shot.sh <route> <viewport> <out.png> [extra agent-browser args...]
#   scripts/sandbox-shot.sh /login 1280x800 /tmp/login-desktop.png
#   scripts/sandbox-shot.sh /admin/users 390x844 /tmp/admin-mobile.png
set -u

ROUTE="${1:?route required}"
VIEWPORT="${2:?viewport required (e.g. 1280x800)}"
OUT="${3:?output png required}"
shift 3 || true
EXTRA_ARGS=("$@")

cd /home/z/my-project

PORT=3000
HEAP="--max-old-space-size=2560"
LOG=/home/z/my-project/dev.log
: > "$LOG"

# Watchdog: revive next dev if it dies.
watchdog() {
  while :; do
    if ! pgrep -f "next dev.*--port $PORT" >/dev/null 2>&1; then
      echo "[watchdog] reviving next dev ($(date -u +%FT%TZ))" >> "$LOG"
      PORT="$PORT" NODE_OPTIONS="$HEAP" ./node_modules/.bin/next dev --webpack --port "$PORT" >> "$LOG" 2>&1 &
    fi
    sleep 2
  done
}
watchdog &
WATCHDOG_PID=$!

cleanup() {
  kill "$WATCHDOG_PID" 2>/dev/null || true
  pkill -f "next dev.*--port $PORT" 2>/dev/null || true
}
trap cleanup EXIT

# Wait for /api/health to return 200 (initial server boot + compile).
echo "[shot] waiting for /api/health 200..."
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "http://localhost:$PORT/api/health" 2>/dev/null || echo 000)
  if [ "$code" = "200" ]; then
    echo "[shot] /api/health 200 after ${i}s"
    break
  fi
  sleep 2
done

# Warm the target route (retry on transient OOM-death; watchdog will revive).
echo "[shot] warming $ROUTE..."
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 90 "http://localhost:$PORT$ROUTE" 2>/dev/null || echo 000)
  echo "[shot] attempt $i: $ROUTE -> $code"
  if [ "$code" = "200" ] || [ "$code" = "302" ] || [ "$code" = "307" ]; then
    echo "[shot] $ROUTE warm OK ($code)"
    break
  fi
  sleep 3
done

# Give the page bundle a moment to finalize.
sleep 2

# Drive agent-browser with the Local Network Access bypass.
AB_ARGS=(--args "--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessRespectPreflightResult")
echo "[shot] agent-browser open $ROUTE @ ${VIEWPORT}"
agent-browser open "http://localhost:$PORT$ROUTE" "${AB_ARGS[@]}" --viewport "$VIEWPORT" 2>&1 | tail -5 || true
sleep 2
agent-browser screenshot --full "$OUT" 2>&1 | tail -5 || true
echo "[shot] screenshot -> $OUT"
ls -la "$OUT" 2>/dev/null
