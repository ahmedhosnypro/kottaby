#!/usr/bin/env bash
# Debug the admin login flow with a named session + snapshots.
set -u
cd /home/z/my-project

PORT=3000
HEAP="--max-old-space-size=2560"
LOG=/home/z/my-project/dev.log
: > "$LOG"
export AGENT_BROWSER_SESSION="kottaby-qa-debug"
AB_ARGS=(--args "--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessRespectPreflightResult")

watchdog() {
  while :; do
    if ! pgrep -f "next dev.*--port $PORT" >/dev/null 2>&1; then
      echo "[wd] revive ($(date -u +%FT%TZ))" >> "$LOG"
      PORT="$PORT" NODE_OPTIONS="$HEAP" ./node_modules/.bin/next dev --webpack --port "$PORT" >> "$LOG" 2>&1 &
    fi
    sleep 2
  done
}
watchdog &
WD=$!
cleanup() { kill "$WD" 2>/dev/null || true; pkill -f "next dev.*--port $PORT" 2>/dev/null || true; agent-browser close 2>/dev/null || true; }
trap cleanup EXIT

for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "http://localhost:$PORT/api/health" 2>/dev/null || echo 000)
  [ "$code" = "200" ] && { echo "[dbg] health 200 after ${i}s"; break; }
  sleep 2
done
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 90 "http://localhost:$PORT/login" 2>/dev/null || echo 000)
  [ "$code" = "200" ] && { echo "[dbg] /login 200"; break; }
  sleep 2
done
sleep 2

echo "[dbg] open /login"
agent-browser open "http://localhost:$PORT/login" "${AB_ARGS[@]}" --viewport 1280x800 2>&1 | tail -3
sleep 2
echo "[dbg] snapshot -i (interactive only)"
agent-browser snapshot -i 2>&1 | head -50
