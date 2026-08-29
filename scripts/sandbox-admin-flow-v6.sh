#!/usr/bin/env bash
# Admin directory capture v6 — JSON cookie injection + 3584MB heap +
# pre-warm GraphQL endpoint before login. Final sandbox attempt.
set -u
cd /home/z/my-project

PORT=3000
HEAP="--max-old-space-size=3584"
LOG=/home/z/my-project/dev.log
: > "$LOG"
export AGENT_BROWSER_SESSION="kottaby-v6"
AB_ARGS=(--args "--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessRespectPreflightResult")

watchdog() {
  while :; do
    if ! pgrep -f "next dev.*--port $PORT" >/dev/null 2>&1; then
      echo "[wd] revive ($(date -u +%FT%TZ))" >> "$LOG"
      PORT="$PORT" NODE_OPTIONS="$HEAP" ./node_modules/.bin/next dev --webpack --port "$PORT" >> "$LOG" 2>&1 &
    fi
    sleep 3
  done
}
watchdog &
WD=$!
cleanup() { kill "$WD" 2>/dev/null || true; pkill -f "next dev.*--port $PORT" 2>/dev/null || true; agent-browser close 2>/dev/null || true; }
trap cleanup EXIT

echo "[v6] wait for /api/health..."
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "http://localhost:$PORT/api/health" 2>/dev/null || echo 000)
  [ "$code" = "200" ] && { echo "[v6] health 200 after ${i}s"; break; }
  sleep 2
done

echo "[v6] warm /login..."
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 90 "http://localhost:$PORT/login" 2>/dev/null || echo 000)
  [ "$code" = "200" ] && break
  sleep 2
done
sleep 1

echo "[v6] warm /api/graphql with a dummy Me query (unauth)..."
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 90 -X POST "http://localhost:$PORT/api/graphql" -H "Content-Type: application/json" -d '{"query":"{ __typename }"}' 2>/dev/null || echo 000)
  [ "$code" = "200" ] && { echo "[v6] graphql warm 200"; break; }
  sleep 3
done
sleep 1

echo "[v6] login mutation (capture tokens)..."
body=""
for i in $(seq 1 30); do
  body=$(curl -s -X POST "http://localhost:$PORT/api/graphql" -H "Content-Type: application/json" -d '{"query":"mutation Login($email:String!,$password:String!){ login(email:$email,password:$password){ user{id email role} accessToken refreshToken } }","variables":{"email":"admin@draftacademy.local","password":"Seed_Pass1!"}}' --max-time 90 2>/dev/null)
  echo "$body" | grep -q accessToken && { echo "[v6] login OK"; break; }
  sleep 3
done
ACCESS=$(echo "$body" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['data']['login']['accessToken'])" 2>/dev/null)
REFRESH=$(echo "$body" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['data']['login']['refreshToken'])" 2>/dev/null)
echo "[v6] access.len=${#ACCESS} refresh.len=${#REFRESH}"

# Build a JSON cookie file (agent-browser auto-detects JSON).
cat > /tmp/kottaby-cookies.json <<EOF
[
  {"name":"access_token","value":"$ACCESS","domain":"localhost","path":"/","httpOnly":true,"secure":false,"sameSite":"Strict"},
  {"name":"refresh_token","value":"$REFRESH","domain":"localhost","path":"/","httpOnly":true,"secure":false,"sameSite":"Strict"}
]
EOF
echo "[v6] cookies json:"
cat /tmp/kottaby-cookies.json | head -c 300; echo ""

echo "[v6] agent-browser open / (init) @ 1280x800"
agent-browser open "http://localhost:$PORT/" "${AB_ARGS[@]}" --viewport 1280x800 2>&1 | tail -2
sleep 2

echo "[v6] cookies set --curl (JSON)"
agent-browser cookies set --curl /tmp/kottaby-cookies.json --domain localhost 2>&1 | tail -3
sleep 1
echo "[v6] cookies get (verify):"
agent-browser cookies get 2>&1 | head -8

echo "[v6] warm /admin/users..."
for i in $(seq 1 50); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 120 "http://localhost:$PORT/admin/users" 2>/dev/null || echo 000)
  echo "[v6] warm attempt $i: $code"
  { [ "$code" = "200" ] || [ "$code" = "302" ] || [ "$code" = "307" ]; } && break
  sleep 3
done
sleep 2
echo "[v6] open /admin/users @ 1280x800"
agent-browser open "http://localhost:$PORT/admin/users" --viewport 1280x800 2>&1 | tail -2
sleep 6
echo "[v6] snapshot -i (first 20 lines):"
agent-browser snapshot -i 2>&1 | head -20
agent-browser screenshot --full /tmp/admin-users-v6.png 2>&1 | tail -1
ls -la /tmp/admin-users-v6.png
echo "[v6] dev.log tail:"
tail -6 "$LOG"
echo "[v6] done"
