#!/bin/bash
# Runs every test suite from a clean state. Requires the local stack (start.sh).
cd "$(dirname "$0")"
ROOT=$(cd ../.. && pwd)
Q="psql -h 127.0.0.1 -p 54322 -U postgres -Atq"
fresh(){
  $ROOT/tools/reset-local-db.sh >/dev/null 2>&1
  $Q -c "delete from app.rate_limits" >/dev/null
  $Q -c "update auth.users set encrypted_password = extensions.crypt('Test-pass-2026', extensions.gen_salt('bf')) where email like '%@test.local'" >/dev/null
  $Q -c "select app.bootstrap_super_admin('owner@test.local','Clinic Owner')" >/dev/null
  rm -rf /tmp/sddc-storage/* /tmp/admin-shots/*
}
build(){ SUPABASE_URL=http://127.0.0.1:8000 SUPABASE_ANON_KEY=sb_publishable_localtest_key node $ROOT/tools/configure.mjs --out /tmp/sddc-site-build >/dev/null; }
status=0
echo "== migrations";      ./migration-idempotency.test.sh || status=1
echo "== sql scripts";     ./sql-scripts.test.sh || status=1
echo "== configure";       ./configure.test.sh || status=1
echo "== static";          node static-checks.mjs | tail -1; [ ${PIPESTATUS[0]} = 0 ] || status=1
build
echo "== api security";    fresh; node api-security.test.mjs | grep -v '^PASS'; [ ${PIPESTATUS[0]} = 0 ] || status=1
echo "== public parity";   fresh; timeout 900 node public-parity.test.mjs | grep -v '^PASS'; [ ${PIPESTATUS[0]} = 0 ] || status=1
echo "== header button"; fresh; (python3 -m http.server 8301 --bind 127.0.0.1 -d $ROOT/Sri_Danvantari_Dental_Care >/dev/null 2>&1 &) ; sleep 1; timeout 600 node header-button.test.mjs | grep -v '^PASS'; [ ${PIPESTATUS[0]} = 0 ] || status=1
echo "== admin e2e";       fresh; timeout 1500 node admin-e2e.test.mjs | grep -v '^PASS'; [ ${PIPESTATUS[0]} = 0 ] || status=1
exit $status
