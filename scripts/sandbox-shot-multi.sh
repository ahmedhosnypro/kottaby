#!/usr/bin/env bash
# Sandbox QA multi-shot helper — capture one route at multiple viewports
# in a single server session (avoids re-booting next dev per viewport).
#
# Usage:
#   scripts/sandbox-shot-multi.sh <route> "<vp1>=<out1>" "<vp2>=<out2>" ...
# Example:
#   scripts/sandbox-shot-multi.sh /login "1280x800=/tmp/login-d.png" "390x844=/tmp/login-m.png"
set -u

ROUTE="${1:?route required}"
shift
SHOTS=("$@")
[ "${#SHOTS[@]}" -gt 0 ] || { echo "no viewport=out pairs provided" >&2; exit 2; }

cd /home/z/my-project

PORT=3000
HEAP="--max-old-space-size=2560"
LOG=/home/z/my-project/dev.log
: > "$LOG"

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

echo "[multi] waiting for /api/health 200..."
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "http://localhost:$PORT/api/health" 2>/dev/null || echo 000)
  [ "$code" = "200" ] && { echo "[multi] health 200 after ${i}s"; break; }
  sleep 2
done

echo "[multi] warming $ROUTE..."
for i in $(seq 1 50); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 90 "http://localhost:$PORT$ROUTE" 2>/dev/null || echo 000)
  echo "[multi] attempt $i: $ROUTE -> $code"
  { [ "$code" = "200" ] || [ "$code" = "302" ] || [ "$code" = "307" ]; } && { echo "[multi] warm OK ($code)"; break; }
  sleep 3
done
sleep 2

AB_ARGS=(--args "--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessRespectPreflightResult")
for pair in "${SHOTS[@]}"; do
  vp="${pair%%=*}"
  out="${pair##*=}"
  echo "[multi] agent-browser open $ROUTE @ ${vp} -> $out"
  agent-browser open "http://localhost:$PORT$ROUTE" "${AB_ARGS[@]}" --viewport "$vp" 2>&1 | tail -3 || true
  sleep 2
  agent-browser screenshot --full "$out" 2>&1 | tail -3 || true
  ls -la "$out" 2>/dev/null
done
echo "[multi] done"
