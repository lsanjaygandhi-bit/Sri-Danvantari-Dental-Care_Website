-- =============================================================================
-- ROLLBACK — DESTRUCTIVE. Removes the CMS from the database, INCLUDING all
-- appointment requests, notes, audit log and every edit made in the dashboard.
-- Only run this with explicit approval, after exporting anything you need
-- (Dashboard → Appointments → Export CSV; Supabase → Database → Backups).
-- Uploaded images in the "media" storage bucket must be deleted in the Storage
-- page first (Supabase does not allow deleting storage objects from SQL).
-- The public website keeps working afterwards: with the CMS gone it falls back
-- to its built-in static content. Auth users are NOT deleted.
-- =============================================================================
begin;
drop policy if exists "media admins read" on storage.objects;
drop policy if exists "media editors upload" on storage.objects;
drop policy if exists "media editors update" on storage.objects;
drop policy if exists "media editors delete" on storage.objects;
delete from storage.buckets where id = 'media' and not exists (select 1 from storage.objects where bucket_id = 'media');

drop function if exists public.get_site_content(text, boolean);
drop function if exists public.submit_appointment(text, text, text, date, text, text, text);
drop function if exists public.admin_me();
drop function if exists public.admin_record_login();
drop function if exists public.admin_grant_access(text, public.admin_role, text);
drop function if exists public.admin_export_appointments(date, date, public.appointment_status);
drop function if exists public.admin_media_usage(uuid);
drop function if exists public.admin_dashboard_stats();

drop table if exists public.appointment_notes, public.appointments, public.gallery_items, public.testimonials,
  public.faqs, public.slug_redirects, public.treatments, public.treatment_categories, public.doctors,
  public.seo_pages, public.nav_items, public.page_sections, public.site_settings, public.media_assets,
  public.audit_log, public.admin_users cascade;
drop schema if exists app cascade;   -- helper functions depend on the types below
drop type if exists public.appointment_status, public.content_status, public.admin_role;
commit;
