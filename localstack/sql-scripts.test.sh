#!/bin/bash
# Pre-flight, verification and rollback scripts on empty, installed and rolled-back databases.
S=/home/claude/project/Sri_Danvantari_Dental_Care/supabase
P="psql -h 127.0.0.1 -p 54322 -U postgres -v ON_ERROR_STOP=1 -At"
pass=0; fail=0
ok(){ if [ "$1" = "0" ]; then echo "PASS  $2"; pass=$((pass+1)); else echo "FAIL  $2"; fail=$((fail+1)); fi; }
/home/claude/project/tools/reset-local-db.sh >/dev/null 2>&1
out=$($P -f $S/checks/00_preflight_status.sql 2>&1); echo "$out" | grep -q "page sections (expect 34)|34" && echo "$out" | grep -qi "without row level security (expect none)|none"; ok $? "pre-flight reports a complete install correctly"
out=$($P -f $S/checks/99_verify_after_migrations.sql 2>&1); [ "$(echo "$out" | grep -c '|ok$')" = "3" ] && echo "$out" | grep -q "anon can read published content|true" && echo "$out" | grep -q "|none$"; ok $? "verification: anonymous visitor reads content but not appointments, audit log or admin users"
$P -q -f $S/rollback/rollback_cms_DESTRUCTIVE.sql >/dev/null 2>&1; ok $? "rollback script runs"
[ "$($P -c "select count(*) from information_schema.tables where table_schema='public'")" = "0" ] && [ "$($P -c "select count(*) from pg_namespace where nspname='app'")" = "0" ]; ok $? "rollback removes every CMS table, function and policy"
out=$($P -f $S/checks/00_preflight_status.sql 2>&1); echo "$out" | grep -q "page sections (expect 34)|table missing"; ok $? "pre-flight works on a project with nothing installed"
/home/claude/project/tools/reset-local-db.sh >/dev/null 2>&1; ok $? "migrations install again cleanly after a rollback"
echo; echo "$pass passed, $fail failed"; [ $fail = 0 ]
