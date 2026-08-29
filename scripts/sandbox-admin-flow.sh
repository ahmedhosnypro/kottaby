#!/usr/bin/env bash
# Admin E2E QA flow — login as admin, capture directory + detail at
# desktop + mobile viewports. Single process tree (server stays alive).
set -u
cd /home/z/my-project

PORT=3000
HEAP="--max-old-space-size=2560"
LOG=/home/z/my-project/dev.log
: > "$LOG"
ADMIN_EMAIL="admin@draftacademy.local"
ADMIN_PASS="Seed_Pass1!"
DETAIL_ID="${DETAIL_ID:-2}"
AB_ARGS=(--args "--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessRespectPreflightResult")

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
WD=$!
cleanup() { kill "$WD" 2>/dev/null || true; pkill -f "next dev.*--port $PORT" 2>/dev/null || true; }
trap cleanup EXIT

echo "[flow] waiting for /api/health 200..."
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "http://localhost:$PORT/api/health" 2>/dev/null || echo 000)
  [ "$code" = "200" ] && { echo "[flow] health 200 after ${i}s"; break; }
  sleep 2
done

echo "[flow] warming /login..."
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 90 "http://localhost:$PORT/login" 2>/dev/null || echo 000)
  echo "[flow] attempt $i: /login -> $code"
  [ "$code" = "200" ] && break
  sleep 3
done
sleep 2

echo "[flow] agent-browser open /login @ 1280x800"
agent-browser open "http://localhost:$PORT/login" "${AB_ARGS[@]}" --viewport 1280x800 2>&1 | tail -3
sleep 2
echo "[flow] fill email"
agent-browser fill "input[type=email]" "$ADMIN_EMAIL" "${AB_ARGS[@]}" 2>&1 | tail -2 || true
sleep 1
echo "[flow] fill password"
agent-browser fill "input[type=password]" "$ADMIN_PASS" "${AB_ARGS[@]}" 2>&1 | tail -2 || true
sleep 1
echo "[flow] click submit"
agent-browser click "button[type=submit]" "${AB_ARGS[@]}" 2>&1 | tail -2 || true
sleep 8
echo "[flow] post-login url:"
agent-browser url "${AB_ARGS[@]}" 2>&1 | tail -2 || true

echo "[flow] warming /admin/users..."
for i in $(seq 1 50); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 90 "http://localhost:$PORT/admin/users" 2>/dev/null || echo 000)
  echo "[flow] attempt $i: /admin/users -> $code"
  [ "$code" = "200" ] || [ "$code" = "302" ] || [ "$code" = "307" ] && break
  sleep 3
done
sleep 2

echo "[flow] open /admin/users @ 1280x800"
agent-browser open "http://localhost:$PORT/admin/users" "${AB_ARGS[@]}" --viewport 1280x800 2>&1 | tail -3
sleep 4
agent-browser screenshot --full /tmp/admin-users-d.png 2>&1 | tail -2
ls -la /tmp/admin-users-d.png

echo "[flow] open /admin/users @ 390x844"
agent-browser open "http://localhost:$PORT/admin/users" "${AB_ARGS[@]}" --viewport 390x844 2>&1 | tail -3
sleep 4
agent-browser screenshot --full /tmp/admin-users-m.png 2>&1 | tail -2
ls -la /tmp/admin-users-m.png

echo "[flow] warming /admin/users/$DETAIL_ID..."
for i in $(seq 1 50); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 90 "http://localhost:$PORT/admin/users/$DETAIL_ID" 2>/dev/null || echo 000)
  echo "[flow] attempt $i: /admin/users/$DETAIL_ID -> $code"
  [ "$code" = "200" ] || [ "$code" = "302" ] || [ "$code" = "307" ] && break
  sleep 3
done
sleep 2

echo "[flow] open /admin/users/$DETAIL_ID @ 1280x800"
agent-browser open "http://localhost:$PORT/admin/users/$DETAIL_ID" "${AB_ARGS[@]}" --viewport 1280x800 2>&1 | tail -3
sleep 4
agent-browser screenshot --full /tmp/admin-user-detail-d.png 2>&1 | tail -2
ls -la /tmp/admin-user-detail-d.png

echo "[flow] open /admin/users/$DETAIL_ID @ 390x844"
agent-browser open "http://localhost:$PORT/admin/users/$DETAIL_ID" "${AB_ARGS[@]}" --viewport 390x844 2>&1 | tail -3
sleep 4
agent-browser screenshot --full /tmp/admin-user-detail-m.png 2>&1 | tail -2
ls -la /tmp/admin-user-detail-m.png

echo "[flow] done"
