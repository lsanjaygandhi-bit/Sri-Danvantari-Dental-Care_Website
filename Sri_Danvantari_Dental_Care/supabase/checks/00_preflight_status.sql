-- READ-ONLY. Run in the Supabase SQL Editor before applying migrations.
-- Shows which parts of the CMS already exist in this project. Changes nothing.
select 'migration history' as check,
       case when to_regclass('supabase_migrations.schema_migrations') is null
            then 'no migration history table (migrations were run by hand, or never)'
            else coalesce((select string_agg(x::text, ', ') from unnest(xpath('//row/v/text()',
                   query_to_xml('select version || '' '' || name as v from supabase_migrations.schema_migrations order by 1', false, true, ''))) x),
                 'none recorded') end as result
union all select '001 schema: CMS tables present (expect 16)',
  (select count(*)::text from information_schema.tables where table_schema = 'public'
     and table_name in ('admin_users','audit_log','media_assets','site_settings','page_sections','doctors','treatment_categories',
       'treatments','slug_redirects','testimonials','gallery_items','faqs','nav_items','seo_pages','appointments','appointment_notes'))
union all select '002 security: public policies (expect 52 after 002)', (select count(*)::text from pg_policies where schemaname = 'public')
union all select '002 security: storage policies for media (expect 4)', (select count(*)::text from pg_policies where schemaname = 'storage' and policyname like 'media %')
union all select '002 security: media bucket exists', (select (count(*) = 1)::text from storage.buckets where id = 'media')
union all select '002 security: API functions (expect 8)', (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('get_site_content','submit_appointment','admin_me','admin_record_login','admin_grant_access','admin_export_appointments','admin_media_usage','admin_dashboard_stats'))
union all select '003 seed: page sections (expect 34)', (select case when to_regclass('public.page_sections') is null then 'table missing' else (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.page_sections', false, true, '')))[1]::text end)
union all select 'tables WITHOUT row level security (expect none)', coalesce((select string_agg(n.nspname || '.' || c.relname, ', ')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public','app') and c.relkind = 'r' and not c.relrowsecurity), 'none')
union all select 'Super Admins', (select case when to_regclass('public.admin_users') is null then 'table missing' else (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.admin_users where role = ''super_admin'' and is_active', false, true, '')))[1]::text end);
