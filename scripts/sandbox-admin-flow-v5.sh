#!/usr/bin/env bash
# Admin directory capture v5 — set cookies individually (avoid --curl parser
# issues with #HttpOnly_ prefix), verify with cookies get, then capture.
set -u
cd /home/z/my-project

PORT=3000
HEAP="--max-old-space-size=2560"
LOG=/home/z/my-project/dev.log
: > "$LOG"
export AGENT_BROWSER_SESSION="kottaby-v5"
AB_ARGS=(--args "--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessRespectPreflightResult")
COOKIES=/tmp/kottaby-cookies.txt

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
  [ "$code" = "200" ] && { echo "[f5] health 200"; break; }
  sleep 2
done
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 90 "http://localhost:$PORT/login" 2>/dev/null || echo 000)
  [ "$code" = "200" ] && break
  sleep 2
done
sleep 2

# Fresh login to get current tokens.
echo "[f5] curl login..."
body=$(curl -s -D /tmp/hdr.txt -X POST "http://localhost:$PORT/api/graphql" -H "Content-Type: application/json" -d '{"query":"mutation Login($email:String!,$password:String!){ login(email:$email,password:$password){ user{id email role} accessToken refreshToken } }","variables":{"email":"admin@draftacademy.local","password":"Seed_Pass1!"}}' --max-time 120 2>/dev/null)
ACCESS=$(echo "$body" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['data']['login']['accessToken'])" 2>/dev/null)
REFRESH=$(echo "$body" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['data']['login']['refreshToken'])" 2>/dev/null)
echo "[f5] access.len=${#ACCESS} refresh.len=${#REFRESH}"

echo "[f5] agent-browser open / (init) @ 1280x800"
agent-browser open "http://localhost:$PORT/" "${AB_ARGS[@]}" --viewport 1280x800 2>&1 | tail -2
sleep 2

echo "[f5] set cookies individually"
agent-browser cookies set "access_token=$ACCESS" --domain "localhost" --path "/" --httpOnly --sameSite "Strict" 2>&1 | tail -2
agent-browser cookies set "refresh_token=$REFRESH" --domain "localhost" --path "/" --httpOnly --sameSite "Strict" 2>&1 | tail -2
echo "[f5] cookies get (verify):"
agent-browser cookies get 2>&1 | head -10

echo "[f5] warm + open /admin/users..."
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 90 "http://localhost:$PORT/admin/users" 2>/dev/null || echo 000)
  { [ "$code" = "200" ] || [ "$code" = "302" ] || [ "$code" = "307" ]; } && break
  sleep 2
done
sleep 2
agent-browser open "http://localhost:$PORT/admin/users" --viewport 1280x800 2>&1 | tail -2
sleep 5
echo "[f5] snapshot -i (first 25 lines — see what rendered):"
agent-browser snapshot -i 2>&1 | head -25
agent-browser screenshot --full /tmp/admin-users-d5.png 2>&1 | tail -1
ls -la /tmp/admin-users-d5.png
echo "[f5] dev.log tail:"
tail -5 "$LOG"
echo "[f5] done"
