#!/usr/bin/env bash
# Admin E2E QA flow v2 — uses agent-browser snapshot refs (not CSS selectors)
# so MUI TextField inputs are reliably targeted. Named session preserves cookies.
set -u
cd /home/z/my-project

PORT=3000
HEAP="--max-old-space-size=2560"
LOG=/home/z/my-project/dev.log
: > "$LOG"
export AGENT_BROWSER_SESSION="kottaby-admin-qa"
AB_ARGS=(--args "--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessRespectPreflightResult")
ADMIN_EMAIL="admin@draftacademy.local"
ADMIN_PASS="Seed_Pass1!"
DETAIL_ID="${DETAIL_ID:-2}"

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
  [ "$code" = "200" ] && { echo "[flow] health 200 after ${i}s"; break; }
  sleep 2
done
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 90 "http://localhost:$PORT/login" 2>/dev/null || echo 000)
  [ "$code" = "200" ] && break
  sleep 2
done
sleep 2

echo "[flow] open /login @ 1280x800"
agent-browser open "http://localhost:$PORT/login" "${AB_ARGS[@]}" --viewport 1280x800 2>&1 | tail -2
sleep 2

echo "[flow] snapshot -i to find form refs"
SNAP=$(agent-browser snapshot -i 2>&1)
echo "$SNAP" | grep -E "textbox|button \"تسجيل الدخول\"" | head -8

# Extract refs: first textbox = email, second textbox = password, تسجيل الدخول button = submit.
EMAIL_REF=$(echo "$SNAP" | grep -m1 'textbox' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=e/@e/')
PASS_REF=$(echo "$SNAP" | grep -m2 'textbox' | tail -1 | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=e/@e/')
SUBMIT_REF=$(echo "$SNAP" | grep 'تسجيل الدخول' | grep -oE 'ref=e[0-9]+' | head -1 | sed 's/ref=e/@e/')
echo "[flow] email_ref=$EMAIL_REF pass_ref=$PASS_REF submit_ref=$SUBMIT_REF"

echo "[flow] fill email $ADMIN_EMAIL -> $EMAIL_REF"
agent-browser fill "$EMAIL_REF" "$ADMIN_EMAIL" 2>&1 | tail -1
sleep 1
echo "[flow] fill password -> $PASS_REF"
agent-browser fill "$PASS_REF" "$ADMIN_PASS" 2>&1 | tail -1
sleep 1
echo "[flow] click submit -> $SUBMIT_REF"
agent-browser click "$SUBMIT_REF" 2>&1 | tail -1
echo "[flow] waiting 10s for post-login navigation..."
sleep 10

echo "[flow] post-login snapshot (interactive):"
agent-browser snapshot -i 2>&1 | head -15

echo "[flow] === capturing /admin/users ==="
# Warm + open directory
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 90 "http://localhost:$PORT/admin/users" 2>/dev/null || echo 000)
  { [ "$code" = "200" ] || [ "$code" = "302" ] || [ "$code" = "307" ]; } && break
  sleep 2
done
sleep 2
agent-browser open "http://localhost:$PORT/admin/users" --viewport 1280x800 2>&1 | tail -2
sleep 4
agent-browser screenshot --full /tmp/admin-users-d.png 2>&1 | tail -1
ls -la /tmp/admin-users-d.png
agent-browser open "http://localhost:$PORT/admin/users" --viewport 390x844 2>&1 | tail -2
sleep 4
agent-browser screenshot --full /tmp/admin-users-m.png 2>&1 | tail -1
ls -la /tmp/admin-users-m.png

echo "[flow] === capturing /admin/users/$DETAIL_ID ==="
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 90 "http://localhost:$PORT/admin/users/$DETAIL_ID" 2>/dev/null || echo 000)
  { [ "$code" = "200" ] || [ "$code" = "302" ] || [ "$code" = "307" ]; } && break
  sleep 2
done
sleep 2
agent-browser open "http://localhost:$PORT/admin/users/$DETAIL_ID" --viewport 1280x800 2>&1 | tail -2
sleep 4
agent-browser screenshot --full /tmp/admin-user-detail-d.png 2>&1 | tail -1
ls -la /tmp/admin-user-detail-d.png
agent-browser open "http://localhost:$PORT/admin/users/$DETAIL_ID" --viewport 390x844 2>&1 | tail -2
sleep 4
agent-browser screenshot --full /tmp/admin-user-detail-m.png 2>&1 | tail -1
ls -la /tmp/admin-user-detail-m.png
echo "[flow] done"
