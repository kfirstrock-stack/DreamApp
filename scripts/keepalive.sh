#!/usr/bin/env bash
# Read-only pings so free Supabase projects do not pause.
# Keys are the public anon/publishable keys. No service_role. No writes.
set -u

PROD_URL="${PROD_URL:-https://xxuzjmjkgfjxmdqehvap.supabase.co}"
PROD_ANON_KEY="${PROD_ANON_KEY:-sb_publishable_-P83XQ3cpD__9W51C4eQvA_L01uwA08}"
TEST_URL="${TEST_URL:-https://wmyinjftktwvjvcvclph.supabase.co}"
TEST_ANON_KEY="${TEST_ANON_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndteWluamZ0a3R3dmp2Y3ZjbHBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ4OTIyMzIsImV4cCI6MjExMDQ2ODIzMn0.wkpsyfbCEEb-f-bDSbxzQ8mW1wq8HbBUTzgloyHTcFg}"

fail=0

check() {
  local name="$1" url="$2" key="$3" path="$4"
  local code
  code=$(curl -sS -o /dev/null -w "%{http_code}" --retry 3 --retry-delay 10 --max-time 40 \
    -H "apikey: $key" \
    -H "Authorization: Bearer $key" \
    "$url$path") || code="000"
  echo "$name: HTTP $code"
  case "$code" in
    2*) ;;
    *) fail=1 ;;
  esac
}

check "prod photos" "$PROD_URL" "$PROD_ANON_KEY" "/rest/v1/photos?select=id&limit=1"
check "prod auth" "$PROD_URL" "$PROD_ANON_KEY" "/auth/v1/health"
check "test photos" "$TEST_URL" "$TEST_ANON_KEY" "/rest/v1/photos?select=id&limit=1"
check "test auth" "$TEST_URL" "$TEST_ANON_KEY" "/auth/v1/health"

if [ "$fail" != "0" ]; then
  echo "Supabase keepalive failed. A project may be paused — restore it in the Supabase dashboard."
  exit 1
fi
