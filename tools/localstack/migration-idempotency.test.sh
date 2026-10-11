#!/bin/bash
# Migrations: fresh install, full re-run, and the live project's real state (only 001 applied).
M=/home/claude/project/Sri_Danvantari_Dental_Care/supabase/migrations
P="psql -h 127.0.0.1 -p 54322 -U postgres -q -v ON_ERROR_STOP=1"
Q="psql -h 127.0.0.1 -p 54322 -U postgres -Atq"
pass=0; fail=0
ok(){ if [ "$1" = "0" ]; then echo "PASS  $2"; pass=$((pass+1)); else echo "FAIL  $2"; fail=$((fail+1)); fi; }
snapshot(){ $Q -c "select (select count(*) from page_sections)||'/'||(select count(*) from treatments)||'/'||(select count(*) from doctors)||'/'||(select count(*) from testimonials)||'/'||(select count(*) from gallery_items)||'/'||(select count(*) from faqs)||'/'||(select count(*) from nav_items)||'/'||(select count(*) from media_assets)||'/'||(select count(*) from site_settings)||'/'||(select count(*) from seo_pages)||'/'||(select count(*) from pg_policies where schemaname in ('public','storage'))"; }
/home/claude/project/tools/reset-local-db.sh >/dev/null 2>&1; ok $? "fresh install of 001, 002, 003 in order"
A=$(snapshot); echo "      counts: $A"
for f in $M/*.sql; do $P -f $f >/dev/null 2>&1 || { ok 1 "re-run $(basename $f)"; continue; }; ok 0 "re-run $(basename $f) succeeds"; done
B=$(snapshot); [ "$A" = "$B" ]; ok $? "re-running everything creates no duplicate rows or policies ($B)"
# An admin edit must survive a re-run of the seed
$Q -c "update treatments set title='Edited in dashboard' where slug='implants'" >/dev/null
$P -f $M/20261010000003_cms_seed_content.sql >/dev/null 2>&1
[ "$($Q -c "select title from treatments where slug='implants'")" = "Edited in dashboard" ]; ok $? "re-running the seed keeps content edited in the dashboard"
# Live project state: only 001 applied. CLI 'db push' may run 001 again, then 002 and 003.
$P >/dev/null 2>&1 <<SQL
drop schema if exists public cascade; drop schema if exists app cascade;
create schema public; grant usage on schema public to anon, authenticated, service_role; grant all on schema public to postgres;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
delete from storage.objects; delete from storage.buckets;
SQL
$P -f $M/20261010000001_cms_schema.sql >/dev/null 2>&1
$P -f $M/20261010000001_cms_schema.sql >/dev/null 2>&1; ok $? "live-like state: 001 applied twice"
$P -f $M/20261010000002_cms_security_and_api.sql >/dev/null 2>&1; ok $? "live-like state: 002 applies on top"
$P -f $M/20261010000003_cms_seed_content.sql >/dev/null 2>&1; ok $? "live-like state: 003 applies on top"
C=$(snapshot); [ "$A" = "$C" ]; ok $? "live-like path ends in the same state as a fresh install ($C)"
[ "$($Q -c "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','app') and c.relkind='r' and not c.relrowsecurity")" = "0" ]; ok $? "RLS is enabled on every table"
echo; echo "$pass passed, $fail failed"; [ $fail = 0 ]
