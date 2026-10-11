-- READ-ONLY verification after running migrations 001, 002 and 003.
-- Simulates the anonymous website visitor inside a transaction that is rolled back.
begin;
set local role anon;
select 'anon can read published content' as check,
       (public.get_site_content('index') -> 'treatments' is not null)::text as result;
select 'anon blocked from appointments' as check,
       case when has_table_privilege('anon', 'public.appointments', 'select') then 'FAIL: has SELECT' else 'ok' end as result;
select 'anon blocked from audit log' as check,
       case when has_table_privilege('anon', 'public.audit_log', 'select') then 'FAIL: has SELECT' else 'ok' end as result;
select 'anon blocked from admin users' as check,
       case when has_table_privilege('anon', 'public.admin_users', 'select') then 'FAIL: has SELECT' else 'ok' end as result;
rollback;
select 'tables without RLS (expect none)' as check, coalesce((select string_agg(n.nspname || '.' || c.relname, ', ')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public','app') and c.relkind = 'r' and not c.relrowsecurity), 'none') as result;
select 'content rows' as check, format('%s sections, %s treatments, %s doctors, %s testimonials, %s FAQs',
  (select count(*) from public.page_sections), (select count(*) from public.treatments), (select count(*) from public.doctors),
  (select count(*) from public.testimonials), (select count(*) from public.faqs)) as result;
