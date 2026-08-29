#!/usr/bin/env bash
# Admin E2E QA flow v4 — curl-login to capture httpOnly cookies, then inject
# them into agent-browser via `cookies set --curl`. Bypasses React-form
# automation issues entirely. Single process tree.
set -u
cd /home/z/my-project

PORT=3000
HEAP="--max-old-space-size=2560"
LOG=/home/z/my-project/dev.log
: > "$LOG"
export AGENT_BROWSER_SESSION="kottaby-admin-v4"
AB_ARGS=(--args "--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessRespectPreflightResult")
ADMIN_EMAIL="admin@draftacademy.local"
ADMIN_PASS="Seed_Pass1!"
DETAIL_ID="${DETAIL_ID:-2}"
COOKIES=/tmp/kottaby-cookies.txt
rm -f "$COOKIES"

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
  [ "$code" = "200" ] && { echo "[f4] health 200 after ${i}s"; break; }
  sleep 2
done
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 90 "http://localhost:$PORT/login" 2>/dev/null || echo 000)
  [ "$code" = "200" ] && { echo "[f4] /login 200"; break; }
  sleep 2
done
sleep 2

echo "[f4] curl login mutation (capture cookies)..."
for i in $(seq 1 40); do
  : > "$COOKIES"
  body=$(curl -s -c "$COOKIES" -X POST "http://localhost:$PORT/api/graphql" -H "Content-Type: application/json" -d "{\"query\":\"mutation Login(\$email:String!,\$password:String!){ login(email:\$email,password:\$password){ user{id email role} accessToken refreshToken } }\",\"variables\":{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}}" --max-time 120 2>/dev/null)
  echo "[f4] attempt $i: body has accessToken? $(echo "$body" | grep -c accessToken)"
  if echo "$body" | grep -q accessToken; then
    echo "[f4] login OK"
    break
  fi
  sleep 3
done
echo "[f4] cookies jar:"
cat "$COOKIES" 2>/dev/null | grep -v "^#" | grep -v "^$" | head

echo "[f4] agent-browser open / (init browser) @ 1280x800"
agent-browser open "http://localhost:$PORT/" "${AB_ARGS[@]}" --viewport 1280x800 2>&1 | tail -2
sleep 2

echo "[f4] inject cookies via cookies set --curl"
agent-browser cookies set --curl "$COOKIES" --domain "localhost" 2>&1 | tail -3
sleep 1

echo "[f4] === /admin/users desktop ==="
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 90 "http://localhost:$PORT/admin/users" 2>/dev/null || echo 000)
  { [ "$code" = "200" ] || [ "$code" = "302" ] || [ "$code" = "307" ]; } && break
  sleep 2
done
sleep 2
agent-browser open "http://localhost:$PORT/admin/users" --viewport 1280x800 2>&1 | tail -2
sleep 5
agent-browser screenshot --full /tmp/admin-users-d.png 2>&1 | tail -1
ls -la /tmp/admin-users-d.png

echo "[f4] === /admin/users mobile ==="
agent-browser open "http://localhost:$PORT/admin/users" --viewport 390x844 2>&1 | tail -2
sleep 5
agent-browser screenshot --full /tmp/admin-users-m.png 2>&1 | tail -1
ls -la /tmp/admin-users-m.png

echo "[f4] === /admin/users/$DETAIL_ID desktop ==="
for i in $(seq 1 50); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 90 "http://localhost:$PORT/admin/users/$DETAIL_ID" 2>/dev/null || echo 000)
  { [ "$code" = "200" ] || [ "$code" = "302" ] || [ "$code" = "307" ]; } && break
  sleep 2
done
sleep 2
agent-browser open "http://localhost:$PORT/admin/users/$DETAIL_ID" --viewport 1280x800 2>&1 | tail -2
sleep 5
agent-browser screenshot --full /tmp/admin-user-detail-d.png 2>&1 | tail -1
ls -la /tmp/admin-user-detail-d.png

echo "[f4] === /admin/users/$DETAIL_ID mobile ==="
agent-browser open "http://localhost:$PORT/admin/users/$DETAIL_ID" --viewport 390x844 2>&1 | tail -2
sleep 5
agent-browser screenshot --full /tmp/admin-user-detail-m.png 2>&1 | tail -1
ls -la /tmp/admin-user-detail-m.png
echo "[f4] done"
