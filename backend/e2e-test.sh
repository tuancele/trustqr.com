#!/bin/bash
# End-to-end test suite for TrustQR

set +e  # Continue on failures to see all results
cd "$(dirname "$0")"

PASS=0
FAIL=0
pass() { echo "  ✅ $1"; PASS=$((PASS+1)); }
fail() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

docker exec yanhee_redis redis-cli FLUSHALL >/dev/null 2>&1

ACCESS=$(curl -s -X POST http://localhost:8080/api/v1/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@yanhee.vn","password":"YanheeAdmin2026!"}' \
  | grep -oE '"access_token":"[^"]*"' | cut -d'"' -f4)

echo "════════════════════════════════════════════════════════"
echo "  TrustQR END-TO-END TEST"
echo "════════════════════════════════════════════════════════"

echo
echo "─── TEST 1: Health / Ready / Metrics ───"
[ "$(curl -s http://localhost:8080/health)" = '{"status":"ok"}' ] && pass "health" || fail "health"
curl -s http://localhost:8080/ready | grep -q "ready" && pass "ready" || fail "ready"
curl -s http://localhost:8080/metrics | grep -q "trustqr_total_tokens" && pass "metrics" || fail "metrics"

echo
echo "─── TEST 2: Auth ───"
[ -n "$ACCESS" ] && pass "login OK" || fail "login FAILED"
curl -s http://localhost:8080/api/v1/admin/auth/me -H "Authorization: Bearer $ACCESS" | grep -q "admin@" && pass "auth/me" || fail "auth/me"
curl -s http://localhost:8080/api/v1/admin/auth/2fa/status -H "Authorization: Bearer $ACCESS" | grep -q "enabled" && pass "2FA status" || fail "2FA status"

echo
echo "─── TEST 3: Create blank batch (500 tokens, no product) ───"
RESP=$(curl -s -X POST http://localhost:8080/api/v1/admin/batches \
  -H "Authorization: Bearer $ACCESS" \
  -H "Content-Type: application/json" \
  -d '{"batch_code":"E2E-TEST-500","quantity":500,"notes":"E2E test batch"}')
BID=$(echo "$RESP" | grep -oE '"batch_id":[0-9]+' | cut -d':' -f2)
if [ -n "$BID" ]; then pass "created batch id=$BID"; else fail "create batch: $RESP"; fi

echo
echo "─── TEST 4: Batch appears in list (THE BUG FIX!) ───"
LIST=$(curl -s http://localhost:8080/api/v1/admin/batches -H "Authorization: Bearer $ACCESS")
echo "$LIST" | grep -q "E2E-TEST-500" && pass "batch in list" || fail "not in list: $LIST"

echo
echo "─── TEST 5: Batch detail (500 unassigned) ───"
DETAIL=$(curl -s "http://localhost:8080/api/v1/admin/batches/$BID" -H "Authorization: Bearer $ACCESS")
UNASSIGNED=$(echo "$DETAIL" | grep -oE '"unassigned":[0-9]+' | cut -d':' -f2)
[ "$UNASSIGNED" = "500" ] && pass "500 unassigned" || fail "unassigned=$UNASSIGNED"

echo
echo "─── TEST 6: Assign range 1-200 to product 1 + distributor 1 ───"
RES=$(curl -s -X POST "http://localhost:8080/api/v1/admin/batches/$BID/assign-range" \
  -H "Authorization: Bearer $ACCESS" -H "Content-Type: application/json" \
  -d '{"from_serial":1,"to_serial":200,"product_id":1,"distributor_id":1,"mark_ready":true,"notes":"1-200"}')
echo "$RES" | grep -q '"tokens_updated":200' && pass "200 assigned" || fail "assign1: $RES"

echo
echo "─── TEST 7: Assign range 201-500 to product 2 ───"
RES=$(curl -s -X POST "http://localhost:8080/api/v1/admin/batches/$BID/assign-range" \
  -H "Authorization: Bearer $ACCESS" -H "Content-Type: application/json" \
  -d '{"from_serial":201,"to_serial":500,"product_id":2,"mark_ready":true}')
echo "$RES" | grep -q '"tokens_updated":300' && pass "300 assigned" || fail "assign2: $RES"

echo
echo "─── TEST 8: Detail shows 500 assigned + 2 assignments ───"
DETAIL=$(curl -s "http://localhost:8080/api/v1/admin/batches/$BID" -H "Authorization: Bearer $ACCESS")
ASSIGNED=$(echo "$DETAIL" | grep -oE '"assigned":[0-9]+' | head -1 | cut -d':' -f2)
[ "$ASSIGNED" = "500" ] && pass "500 assigned" || fail "assigned=$ASSIGNED"

echo
echo "─── TEST 9: Token serial 50 verifies as product 1 ───"
CODE1=$(docker exec yanhee_postgres psql -U postgres -d trustqr -tAc \
  "SELECT secret_code FROM qr_tokens WHERE batch_id=$BID AND serial_no=50;" | tr -d '[:space:]')
V1=$(curl -s -X POST http://localhost:8080/api/v1/qr/verify \
  -H "Content-Type: application/json" -d "{\"code\":\"$CODE1\"}")
echo "$V1" | grep -q '"product_id":1' && pass "serial 50 → product 1" || fail "verify1: $V1"
echo "$V1" | grep -q '"distributor_id":1' && pass "serial 50 → distributor 1" || fail "no distributor"

echo
echo "─── TEST 10: Token serial 300 verifies as product 2 ───"
CODE2=$(docker exec yanhee_postgres psql -U postgres -d trustqr -tAc \
  "SELECT secret_code FROM qr_tokens WHERE batch_id=$BID AND serial_no=300;" | tr -d '[:space:]')
V2=$(curl -s -X POST http://localhost:8080/api/v1/qr/verify \
  -H "Content-Type: application/json" -d "{\"code\":\"$CODE2\"}")
echo "$V2" | grep -q '"product_id":2' && pass "serial 300 → product 2" || fail "verify2: $V2"

echo
echo "─── TEST 11: Activate with SĐT ───"
ACT=$(curl -s -X POST http://localhost:8080/api/v1/qr/activate \
  -H "Content-Type: application/json" -H "Idempotency-Key: e2e-1" \
  -d "{\"code\":\"$CODE1\",\"phone\":\"0912999888\",\"marketing_consent\":true,\"privacy_policy_version\":\"v1.0\"}")
echo "$ACT" | grep -q '"success":true' && pass "activation OK" || fail "activate: $ACT"
echo "$ACT" | grep -qE '"voucher":"YHH-' && pass "voucher YHH-XXXXXX" || fail "no voucher"

echo
echo "─── TEST 12: Re-activate returns same voucher (idempotent) ───"
ACT2=$(curl -s -X POST http://localhost:8080/api/v1/qr/activate \
  -H "Content-Type: application/json" -H "Idempotency-Key: e2e-2" \
  -d "{\"code\":\"$CODE1\",\"phone\":\"0912999888\",\"marketing_consent\":true,\"privacy_policy_version\":\"v1.0\"}")
V1V=$(echo "$ACT" | grep -oE '"voucher":"[^"]*"')
V2V=$(echo "$ACT2" | grep -oE '"voucher":"[^"]*"')
[ "$V1V" = "$V2V" ] && pass "same voucher" || fail "voucher changed"

echo
echo "─── TEST 13: GPS geolocation saved ───"
curl -s -X POST http://localhost:8080/api/v1/qr/verify \
  -H "Content-Type: application/json" \
  -d "{\"code\":\"$CODE1\",\"lat\":10.7769,\"lng\":106.7009,\"accuracy\":15}" > /dev/null
sleep 1
LAT=$(docker exec yanhee_postgres psql -U postgres -d trustqr -tAc \
  "SELECT device_lat FROM scan_logs WHERE token_id=(SELECT id FROM qr_tokens WHERE secret_code='$CODE1') AND device_lat IS NOT NULL LIMIT 1;" | tr -d '[:space:]')
[ -n "$LAT" ] && pass "GPS saved: lat=$LAT" || fail "GPS not saved"

echo
echo "─── TEST 14: Invalid HMAC returns 404 ───"
BAD=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8080/api/v1/qr/verify \
  -H "Content-Type: application/json" -d '{"code":"INVALIDCODE1"}')
[ "$BAD" = "404" ] && pass "invalid → 404" || fail "code=$BAD"

echo
echo "─── TEST 15: Rate limit 429 triggers ───"
FLOOD_CODES=""
for i in $(seq 1 25); do
  FLOOD_CODES="$FLOOD_CODES $(curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:8080/api/v1/qr/verify -H 'Content-Type: application/json' -d "{\"code\":\"$CODE1\"}")"
done
echo "$FLOOD_CODES" | grep -q "429" && pass "429 rate limit triggered" || fail "no 429"
docker exec yanhee_redis redis-cli FLUSHALL >/dev/null 2>&1

echo
echo "─── TEST 16: Public product endpoint ───"
curl -s http://localhost:8080/api/v1/products/1 | grep -q "name" && pass "public product" || fail "product"

echo
echo "─── TEST 17: Public company endpoint ───"
curl -s http://localhost:8080/api/v1/companies/1 | grep -q "name" && pass "public company" || fail "company"

echo
echo "─── TEST 18: Companies CRUD ───"
NEWC=$(curl -s -X POST http://localhost:8080/api/v1/admin/companies -H "Authorization: Bearer $ACCESS" -H "Content-Type: application/json" -d '{"name":"E2E Corp","phone":"0987654321"}' | grep -oE '"id":[0-9]+' | cut -d':' -f2)
[ -n "$NEWC" ] && pass "create id=$NEWC" || fail "create"
curl -s -X PATCH "http://localhost:8080/api/v1/admin/companies/$NEWC" -H "Authorization: Bearer $ACCESS" -H "Content-Type: application/json" -d '{"name":"E2E Corp v2"}' | grep -q "success" && pass "update" || fail "update"
curl -s -X DELETE "http://localhost:8080/api/v1/admin/companies/$NEWC" -H "Authorization: Bearer $ACCESS" | grep -q "deleted" && pass "delete" || fail "delete"

echo
echo "─── TEST 19: Distributors CRUD ───"
NEWD=$(curl -s -X POST http://localhost:8080/api/v1/admin/distributors -H "Authorization: Bearer $ACCESS" -H "Content-Type: application/json" -d '{"name":"E2E Dist","phone":"0912000000"}' | grep -oE '"id":[0-9]+' | cut -d':' -f2)
[ -n "$NEWD" ] && pass "create id=$NEWD" || fail "create"
curl -s -X DELETE "http://localhost:8080/api/v1/admin/distributors/$NEWD" -H "Authorization: Bearer $ACCESS" | grep -q "deleted" && pass "delete" || fail "delete"

echo
echo "─── TEST 20: Products CRUD ───"
NEWP=$(curl -s -X POST http://localhost:8080/api/v1/admin/products -H "Authorization: Bearer $ACCESS" -H "Content-Type: application/json" -d '{"name":"E2E Product","barcode":"1234567890","gtin":"00614141"}' | grep -oE '"id":[0-9]+' | cut -d':' -f2)
[ -n "$NEWP" ] && pass "create id=$NEWP" || fail "create"
curl -s "http://localhost:8080/api/v1/admin/products/$NEWP" -H "Authorization: Bearer $ACCESS" | grep -q "1234567890" && pass "barcode saved" || fail "barcode"
curl -s -X DELETE "http://localhost:8080/api/v1/admin/products/$NEWP" -H "Authorization: Bearer $ACCESS" | grep -q "deleted" && pass "delete" || fail "delete"

echo
echo "─── TEST 21: Analytics ───"
curl -s http://localhost:8080/api/v1/admin/analytics/summary -H "Authorization: Bearer $ACCESS" | grep -q "total_tokens" && pass "summary" || fail "summary"
curl -s "http://localhost:8080/api/v1/admin/analytics/geo?days=30" -H "Authorization: Bearer $ACCESS" | grep -q "data" && pass "geo" || fail "geo"
curl -s http://localhost:8080/api/v1/admin/analytics/frauds -H "Authorization: Bearer $ACCESS" | head -c 1 | grep -q '\[' && pass "frauds" || fail "frauds"

echo
echo "─── TEST 22: Batch tokens paginated + filter ───"
TOK=$(curl -s "http://localhost:8080/api/v1/admin/batches/$BID/tokens?filter=assigned&page_size=5" -H "Authorization: Bearer $ACCESS")
echo "$TOK" | grep -q '"total":500' && pass "500 assigned found" || fail "total wrong: $TOK"

echo
echo "─── TEST 23: Customer unsubscribe ───"
curl -s -X POST http://localhost:8080/api/v1/customer/unsubscribe -H "Content-Type: application/json" -d '{"phone":"0912999888"}' | grep -q "success" && pass "unsubscribe" || fail "unsub"

echo
echo "─── TEST 24: CSV export ───"
CSV=$(curl -s "http://localhost:8080/api/v1/admin/batches/$BID/export.csv" -H "Authorization: Bearer $ACCESS" | head -2)
echo "$CSV" | grep -q "secret_code" && pass "CSV export" || fail "CSV"

echo
echo "─── TEST 25: Audit log has records ───"
AL=$(curl -s "http://localhost:8080/api/v1/admin/audit?limit=10" -H "Authorization: Bearer $ACCESS")
echo "$AL" | grep -qE "product|company|distributor|2fa" && pass "audit records" || fail "audit empty"

echo
echo "════════════════════════════════════════════════════════"
echo "  RESULTS:  $PASS passed / $FAIL failed"
echo "════════════════════════════════════════════════════════"
