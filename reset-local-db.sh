#!/bin/sh
# Rebuild the local test database from the migrations (test harness only).
set -e
P="psql -h 127.0.0.1 -p 54322 -U postgres -v ON_ERROR_STOP=1 -q"
M=/home/claude/project/Sri_Danvantari_Dental_Care/supabase/migrations
$P <<SQL
drop schema if exists public cascade; drop schema if exists app cascade;
create schema public; grant usage on schema public to anon, authenticated, service_role; grant all on schema public to postgres;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
delete from storage.objects; delete from storage.buckets;
drop policy if exists "media admins read" on storage.objects; drop policy if exists "media editors upload" on storage.objects;
drop policy if exists "media editors update" on storage.objects; drop policy if exists "media editors delete" on storage.objects;
SQL
for f in $M/*.sql; do $P -f $f; done
$P -c "notify pgrst, 'reload schema'"   # make the local PostgREST pick up the rebuilt schema
sleep 1
echo "db reset ok"
