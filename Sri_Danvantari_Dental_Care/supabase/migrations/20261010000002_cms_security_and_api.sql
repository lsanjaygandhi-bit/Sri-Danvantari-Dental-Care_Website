-- =============================================================================
-- Sri Danvantari Dental Care — Row Level Security, grants, RPC API, storage
--
-- Role matrix (enforced here, in the database — not just in the dashboard UI):
--   super_admin : everything, incl. settings, navigation, admin users, audit log, CSV export
--   editor      : website content, media, SEO (no appointments, settings, users, audit)
--   front_desk  : appointment requests and internal notes only (no export)
--   public      : no direct table access. Reads published content through
--                 get_site_content() and submits requests through submit_appointment().
-- Idempotent: safe to run again (policies are dropped and re-created by name).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Lock down direct table access for the public role.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon, public;
revoke all on table app.rate_limits from public, anon, authenticated;
-- Signed-in users never need TRUNCATE (which bypasses RLS), TRIGGER or REFERENCES on CMS tables.
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- Enable RLS everywhere (never disabled).
alter table public.admin_users          enable row level security;
alter table public.audit_log            enable row level security;
alter table public.media_assets         enable row level security;
alter table public.site_settings        enable row level security;
alter table public.page_sections        enable row level security;
alter table public.doctors              enable row level security;
alter table public.treatment_categories enable row level security;
alter table public.treatments           enable row level security;
alter table public.slug_redirects       enable row level security;
alter table public.testimonials         enable row level security;
alter table public.gallery_items        enable row level security;
alter table public.faqs                 enable row level security;
alter table public.nav_items            enable row level security;
alter table public.seo_pages            enable row level security;
alter table public.appointments         enable row level security;
alter table public.appointment_notes    enable row level security;
alter table app.rate_limits             enable row level security;

-- ---------------------------------------------------------------------------
-- admin_users
-- ---------------------------------------------------------------------------
drop policy if exists admin_users_select on public.admin_users;
create policy admin_users_select on public.admin_users for select to authenticated
  using (user_id = (select auth.uid()) or (select app.is_super_admin()));
drop policy if exists admin_users_update on public.admin_users;
create policy admin_users_update on public.admin_users for update to authenticated
  using ((select app.is_super_admin())) with check ((select app.is_super_admin()));
drop policy if exists admin_users_delete on public.admin_users;
create policy admin_users_delete on public.admin_users for delete to authenticated
  using ((select app.is_super_admin()));
-- Inserts happen only through admin_grant_access() (needs an existing Auth user).

-- ---------------------------------------------------------------------------
-- audit_log: read-only for super admins; rows are written by triggers only.
-- ---------------------------------------------------------------------------
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated
  using ((select app.is_super_admin()));
revoke insert, update, delete, truncate on public.audit_log from authenticated;

-- ---------------------------------------------------------------------------
-- Website content: any admin can read; super_admin and editor can write.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['media_assets', 'page_sections', 'doctors', 'treatment_categories', 'treatments',
    'testimonials', 'gallery_items', 'faqs', 'seo_pages']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select app.is_admin()))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select app.can_edit_content()))', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select app.can_edit_content())) with check ((select app.can_edit_content()))', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select app.can_edit_content()))', t || '_delete', t);
  end loop;

  -- Settings and navigation: super admin only for writes.
  foreach t in array array['site_settings', 'nav_items']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select app.is_admin()))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select app.is_super_admin()))', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select app.is_super_admin())) with check ((select app.is_super_admin()))', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select app.is_super_admin()))', t || '_delete', t);
  end loop;
end $$;

-- Page sections are seeded; they cannot be created or deleted from the dashboard.
drop policy if exists page_sections_insert on public.page_sections;
drop policy if exists page_sections_delete on public.page_sections;
-- Site settings keys are seeded; no new keys or deletions.
drop policy if exists site_settings_insert on public.site_settings;
drop policy if exists site_settings_delete on public.site_settings;

-- Slug redirects are maintained by triggers; admins may read and remove them.
drop policy if exists slug_redirects_select on public.slug_redirects;
create policy slug_redirects_select on public.slug_redirects for select to authenticated using ((select app.is_admin()));
drop policy if exists slug_redirects_delete on public.slug_redirects;
create policy slug_redirects_delete on public.slug_redirects for delete to authenticated using ((select app.can_edit_content()));

-- ---------------------------------------------------------------------------
-- Appointments: super_admin and front_desk only. No public SELECT, ever.
-- Public inserts go through submit_appointment() (validated + rate limited).
-- ---------------------------------------------------------------------------
drop policy if exists appointments_select on public.appointments;
create policy appointments_select on public.appointments for select to authenticated
  using ((select app.can_manage_appointments()));
drop policy if exists appointments_update on public.appointments;
create policy appointments_update on public.appointments for update to authenticated
  using ((select app.can_manage_appointments())) with check ((select app.can_manage_appointments()));
drop policy if exists appointments_delete on public.appointments;
create policy appointments_delete on public.appointments for delete to authenticated
  using ((select app.is_super_admin()));

drop policy if exists appointment_notes_select on public.appointment_notes;
create policy appointment_notes_select on public.appointment_notes for select to authenticated
  using ((select app.can_manage_appointments()));
drop policy if exists appointment_notes_insert on public.appointment_notes;
create policy appointment_notes_insert on public.appointment_notes for insert to authenticated
  with check ((select app.can_manage_appointments()));
drop policy if exists appointment_notes_delete on public.appointment_notes;
create policy appointment_notes_delete on public.appointment_notes for delete to authenticated
  using ((select app.is_super_admin()));
revoke update on public.appointment_notes from authenticated;

-- ---------------------------------------------------------------------------
-- Public content API
-- ---------------------------------------------------------------------------
create or replace function app.media_json(p_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select case when m.id is null then null else jsonb_strip_nulls(jsonb_build_object(
    'id', m.id, 'static', m.static_path, 'storage', m.storage_path, 'srcset', m.srcset,
    'alt', m.alt_text, 'w', m.width, 'h', m.height, 'mime', m.mime_type)) end
  from (select p_id) x left join public.media_assets m on m.id = p_id
$$;

-- Merge pending draft edits over a row (preview mode only).
create or replace function app.preview_row(p_row jsonb, p_preview boolean)
returns jsonb language sql immutable set search_path = ''
as $$
  select case when p_preview and p_row ? 'draft_data' and jsonb_typeof(p_row -> 'draft_data') = 'object'
              then (p_row - 'draft_data') || (p_row -> 'draft_data')
              else p_row - 'draft_data' end
$$;

create or replace function public.get_site_content(p_page text default null, p_preview boolean default false)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_preview boolean := coalesce(p_preview, false);
  v_page text := coalesce(nullif(p_page, ''), 'index');
  v_statuses public.content_status[];
  v_result jsonb;
begin
  if v_page !~ '^[a-z0-9-]+$' then
    raise exception 'Invalid page';
  end if;
  if v_preview and not app.can_edit_content() then
    raise exception 'Preview is available to signed-in content administrators only.' using errcode = '42501';
  end if;
  v_statuses := case when v_preview then array['published', 'draft']::public.content_status[]
                     else array['published']::public.content_status[] end;

  select jsonb_build_object(
    'preview', v_preview,
    'generated_at', now(),
    'settings', (select coalesce(jsonb_object_agg(s.key, s.value), '{}') from public.site_settings s),
    'branding_media', jsonb_build_object(
        'logo', app.media_json(((select value from public.site_settings where key = 'branding') ->> 'logo_id')::uuid),
        'favicon', app.media_json(((select value from public.site_settings where key = 'branding') ->> 'favicon_id')::uuid)),
    'nav', (select coalesce(jsonb_agg(jsonb_build_object('location', n.location, 'label', n.label, 'href', n.href, 'new_tab', n.new_tab) order by n.location, n.sort_order), '[]')
              from public.nav_items n where n.is_visible),
    'seo', (select coalesce(jsonb_object_agg(sp.path, jsonb_build_object(
                'title', sp.title, 'description', sp.description, 'canonical', sp.canonical_url,
                'og_title', sp.og_title, 'og_description', sp.og_description, 'og_image', app.media_json(sp.og_image_id),
                'robots', sp.robots, 'structured_data', sp.structured_data)), '{}') from public.seo_pages sp),
    'sections', (select coalesce(jsonb_object_agg(ps.page || '.' || ps.key, jsonb_build_object(
                'visible', ps.is_visible, 'order', ps.sort_order, 'locked', ps.is_locked,
                'content', case when ps.is_locked then '{}'::jsonb
                                when v_preview and ps.draft_content is not null then ps.content || ps.draft_content
                                else ps.content end,
                'media', (select coalesce(jsonb_object_agg(f ->> 'name', app.media_json(nullif(
                              (case when v_preview and ps.draft_content is not null then ps.content || ps.draft_content else ps.content end) ->> (f ->> 'name'), '')::uuid)), '{}')
                            from jsonb_array_elements(ps.schema) f where f ->> 'type' = 'image'))), '{}')
              from public.page_sections ps where ps.page in (v_page, 'global')),
    'treatments', (select coalesce(jsonb_agg(app.preview_row(to_jsonb(t) - 'created_at' - 'updated_by', v_preview)
                        || jsonb_build_object('image', app.media_json(coalesce(nullif(case when v_preview then t.draft_data ->> 'image_id' end, ''), t.image_id::text)::uuid),
                                              'og_image', app.media_json(t.og_image_id),
                                              'category', (select c.name from public.treatment_categories c where c.id = t.category_id))
                        order by t.sort_order, t.title), '[]')
                    from public.treatments t where t.status = any (v_statuses)),
    'doctors', (select coalesce(jsonb_agg(app.preview_row(to_jsonb(d) - 'created_at' - 'updated_by', v_preview)
                        || jsonb_build_object('photo', app.media_json(coalesce(nullif(case when v_preview then d.draft_data ->> 'photo_id' end, ''), d.photo_id::text)::uuid))
                        order by d.sort_order, d.name), '[]')
                    from public.doctors d where d.status = any (v_statuses)),
    'testimonials', (select coalesce(jsonb_agg(app.preview_row(jsonb_build_object('id', r.id, 'author_name', r.author_name, 'initials', r.initials,
                          'quote', r.quote, 'label', r.label, 'review_age', r.review_age, 'status', r.status, 'draft_data', r.draft_data), v_preview)
                        order by r.sort_order), '[]')
                    from public.testimonials r where r.status = any (v_statuses)),
    'gallery', (select coalesce(jsonb_agg(app.preview_row(to_jsonb(g) - 'created_at' - 'updated_by', v_preview)
                        || jsonb_build_object('media', app.media_json(coalesce(nullif(case when v_preview then g.draft_data ->> 'media_id' end, ''), g.media_id::text)::uuid))
                        order by g.gallery, g.sort_order), '[]')
                    from public.gallery_items g where g.status = any (v_statuses)),
    'faqs', (select coalesce(jsonb_agg(app.preview_row(jsonb_build_object('id', f.id, 'page', f.page, 'question', f.question, 'answer', f.answer,
                          'status', f.status, 'draft_data', f.draft_data), v_preview) order by f.sort_order), '[]')
                    from public.faqs f where f.status = any (v_statuses)),
    'redirects', (select coalesce(jsonb_agg(jsonb_build_object('entity', sr.entity, 'from', sr.old_slug, 'to', sr.new_slug)), '[]')
                    from public.slug_redirects sr)
  ) into v_result;

  return v_result;
end $$;

revoke all on function public.get_site_content(text, boolean) from public;
grant execute on function public.get_site_content(text, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Rate limiting helper
-- ---------------------------------------------------------------------------
create or replace function app.hit_rate_limit(p_bucket text, p_window interval, p_max integer)
returns boolean  -- true when the limit is exceeded
language plpgsql security definer set search_path = ''
as $$
declare
  v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / extract(epoch from p_window)) * extract(epoch from p_window));
  v_hits integer;
begin
  insert into app.rate_limits (bucket, window_start, hits) values (p_bucket, v_start, 1)
  on conflict (bucket, window_start) do update set hits = app.rate_limits.hits + 1
  returning hits into v_hits;
  -- Housekeeping: drop windows older than two days.
  delete from app.rate_limits where window_start < now() - interval '2 days';
  return v_hits > p_max;
end $$;
revoke all on function app.hit_rate_limit(text, interval, integer) from public, anon, authenticated;

create or replace function app.client_ip_hash()
returns text language plpgsql stable security definer set search_path = ''
as $$
declare v_headers jsonb; v_ip text;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then v_headers := null;
  end;
  -- Prefer the address set by Supabase's edge network. The left-most X-Forwarded-For
  -- entry can be supplied by the client, so it is only a last resort.
  v_ip := coalesce(nullif(v_headers ->> 'cf-connecting-ip', ''), nullif(v_headers ->> 'x-real-ip', ''),
                   nullif(btrim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), ''), 'unknown');
  return encode(extensions.digest('sddc-rl:' || trim(v_ip), 'sha256'), 'hex');
end $$;
revoke all on function app.client_ip_hash() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public: submit an appointment request (validated, rate limited, honeypot)
-- ---------------------------------------------------------------------------
create or replace function public.submit_appointment(
  p_name text, p_phone text, p_treatment text default '', p_date date default null,
  p_time text default '', p_message text default '', p_website text default ''
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '[[:cntrl:]]', '', 'g');
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_treatment text := btrim(coalesce(p_treatment, ''));
  v_time text := btrim(coalesce(p_time, ''));
  v_message text := regexp_replace(btrim(coalesce(p_message, '')), '[\x00-\x09\x0B-\x1F\x7F]', '', 'g');
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_booking jsonb; v_hours jsonb; v_ref text; v_ip text;
begin
  -- Honeypot: real visitors never fill the hidden "website" field.
  if coalesce(p_website, '') <> '' then
    return jsonb_build_object('ok', true, 'reference', null);
  end if;

  v_ip := app.client_ip_hash();
  if app.hit_rate_limit('appt:ip:' || v_ip, interval '1 hour', 5) then
    raise exception 'Too many requests from this connection. Please try again later or contact the clinic on WhatsApp.' using errcode = 'P0001';
  end if;
  if app.hit_rate_limit('appt:global', interval '1 day', 300) then
    raise exception 'The booking form is busy. Please contact the clinic on WhatsApp.' using errcode = 'P0001';
  end if;

  if length(v_phone) = 12 and left(v_phone, 2) = '91' then v_phone := right(v_phone, 10); end if;
  if length(v_phone) = 11 and left(v_phone, 1) = '0' then v_phone := right(v_phone, 10); end if;

  if char_length(v_name) not between 2 and 80 then raise exception 'Please enter your name (2–80 characters).' using errcode = 'P0001'; end if;
  if v_phone !~ '^[6-9][0-9]{9}$' then raise exception 'Please enter a valid 10-digit Indian mobile number.' using errcode = 'P0001'; end if;
  if char_length(v_message) > 500 then raise exception 'Message is too long (max 500 characters).' using errcode = 'P0001'; end if;
  if char_length(v_time) > 40 then raise exception 'Preferred time is not valid.' using errcode = 'P0001'; end if;

  select value into v_booking from public.site_settings where key = 'booking';
  select value into v_hours from public.site_settings where key = 'hours';

  if v_treatment <> '' and not exists (
      select 1 from jsonb_array_elements_text(coalesce(v_booking -> 'treatment_options', '[]')) o where o = v_treatment) then
    raise exception 'Please choose a treatment from the list.' using errcode = 'P0001';
  end if;
  if v_time <> '' and not exists (
      select 1 from jsonb_array_elements_text(coalesce(v_booking -> 'time_options', '[]')) o where o = v_time) then
    raise exception 'Please choose a time from the list.' using errcode = 'P0001';
  end if;
  if p_date is not null then
    if p_date < v_today or p_date > v_today + 365 then
      raise exception 'Please choose a date between today and the next 12 months.' using errcode = 'P0001';
    end if;
    if exists (select 1 from jsonb_array_elements_text(coalesce(v_hours -> 'closed_days', '[]')) d
               where d::int = extract(dow from p_date)::int) then
      raise exception 'The clinic is closed on that day. Please choose another date.' using errcode = 'P0001';
    end if;
  end if;

  insert into public.appointments (patient_name, phone, treatment, preferred_date, preferred_time, message, source)
  values (v_name, v_phone, v_treatment, p_date, v_time, v_message, 'website')
  returning reference into v_ref;

  return jsonb_build_object('ok', true, 'reference', v_ref);
end $$;

revoke all on function public.submit_appointment(text, text, text, date, text, text, text) from public;
grant execute on function public.submit_appointment(text, text, text, date, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin RPCs
-- ---------------------------------------------------------------------------
create or replace function public.admin_me()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('user_id', au.user_id, 'email', au.email, 'display_name', au.display_name, 'role', au.role)
  from public.admin_users au where au.user_id = (select auth.uid()) and au.is_active
$$;
revoke all on function public.admin_me() from public, anon;
grant execute on function public.admin_me() to authenticated;

-- Records a dashboard sign-in in the audit log.
create or replace function public.admin_record_login()
returns void language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not app.is_admin() then return; end if;
  perform app.audit_event('login', 'admin_users', (select auth.uid())::text, null);
end $$;
revoke all on function public.admin_record_login() from public, anon;
grant execute on function public.admin_record_login() to authenticated;

-- Grant dashboard access to an existing Auth user (create/invite the user in
-- Supabase Auth first). Super admin only.
create or replace function public.admin_grant_access(p_email text, p_role public.admin_role, p_display_name text default '')
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare v_user uuid; v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not app.is_super_admin() then raise exception 'Only a Super Admin can manage admin users.' using errcode = '42501'; end if;
  select id into v_user from auth.users where lower(email) = v_email;
  if v_user is null then
    raise exception 'No login exists for %. Invite or create the user in Supabase Auth first, then grant access here.', v_email using errcode = 'P0001';
  end if;
  insert into public.admin_users (user_id, email, display_name, role, is_active)
  values (v_user, v_email, left(coalesce(p_display_name, ''), 80), p_role, true)
  on conflict (user_id) do update set role = excluded.role, display_name = excluded.display_name, is_active = true;
  return jsonb_build_object('user_id', v_user, 'email', v_email, 'role', p_role);
end $$;
revoke all on function public.admin_grant_access(text, public.admin_role, text) from public, anon;
grant execute on function public.admin_grant_access(text, public.admin_role, text) to authenticated;

-- CSV export of appointments: super admin only, and every export is audited.
-- p_from / p_to are whole days in clinic time (Asia/Kolkata).
create or replace function public.admin_export_appointments(p_from date default null, p_to date default null, p_status public.appointment_status default null)
returns table (reference text, created_at timestamptz, patient_name text, phone text, treatment text,
               preferred_date date, preferred_time text, message text, status public.appointment_status)
language plpgsql volatile security definer set search_path = ''
as $$
declare v_count int;
begin
  if not app.is_super_admin() then raise exception 'Only a Super Admin can export appointment data.' using errcode = '42501'; end if;
  select count(*) into v_count from public.appointments a
   where (p_from is null or a.created_at >= (p_from::timestamp at time zone 'Asia/Kolkata'))
     and (p_to is null or a.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Kolkata'))
     and (p_status is null or a.status = p_status);
  perform app.audit_event('export', 'appointments', null,
    jsonb_build_object('rows', v_count, 'from', p_from, 'to', p_to, 'status', p_status));
  return query
    select a.reference, a.created_at, a.patient_name, a.phone, a.treatment, a.preferred_date, a.preferred_time, a.message, a.status
      from public.appointments a
     where (p_from is null or a.created_at >= (p_from::timestamp at time zone 'Asia/Kolkata'))
     and (p_to is null or a.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Kolkata'))
       and (p_status is null or a.status = p_status)
     order by a.created_at desc;
end $$;
revoke all on function public.admin_export_appointments(date, date, public.appointment_status) from public, anon;
grant execute on function public.admin_export_appointments(date, date, public.appointment_status) to authenticated;

-- Where is a media asset used?
create or replace function public.admin_media_usage(p_id uuid)
returns table (kind text, label text, record_id text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not app.can_edit_content() then raise exception 'Not authorised.' using errcode = '42501'; end if;
  return query
    select 'Doctor photo', d.name, d.id::text from public.doctors d where d.photo_id = p_id or d.draft_data ->> 'photo_id' = p_id::text
    union all select 'Treatment image', t.title, t.id::text from public.treatments t where t.image_id = p_id or t.draft_data ->> 'image_id' = p_id::text
    union all select 'Treatment social image', t.title, t.id::text from public.treatments t where t.og_image_id = p_id
    union all select 'Gallery (' || g.gallery || ')', coalesce(nullif(g.title, ''), 'Untitled'), g.id::text from public.gallery_items g where g.media_id = p_id or g.draft_data ->> 'media_id' = p_id::text
    union all select 'SEO social image', s.path, s.path from public.seo_pages s where s.og_image_id = p_id
    union all select 'Page section', ps.page || ' › ' || ps.label, ps.id::text from public.page_sections ps
               where ps.content::text like '%' || p_id::text || '%' or coalesce(ps.draft_content::text, '') like '%' || p_id::text || '%'
    union all select 'Site settings (' || ss.key || ')', ss.key, ss.key from public.site_settings ss where ss.value::text like '%' || p_id::text || '%';
end $$;
revoke all on function public.admin_media_usage(uuid) from public, anon;
grant execute on function public.admin_media_usage(uuid) to authenticated;

create or replace function public.admin_dashboard_stats()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v jsonb := '{}';
begin
  if not app.is_admin() then raise exception 'Not authorised.' using errcode = '42501'; end if;
  if app.can_manage_appointments() then
    v := v || jsonb_build_object(
      'appointments_new', (select count(*) from public.appointments where status = 'new'),
      'appointments_week', (select count(*) from public.appointments where created_at > now() - interval '7 days'),
      'appointments_total', (select count(*) from public.appointments),
      'appointments_by_status', (select coalesce(jsonb_object_agg(status, c), '{}') from (select status, count(*) c from public.appointments group by status) s));
  end if;
  v := v || jsonb_build_object(
    'treatments', (select jsonb_build_object('published', count(*) filter (where status = 'published'), 'draft', count(*) filter (where status = 'draft'), 'pending', count(*) filter (where draft_data is not null)) from public.treatments),
    'doctors', (select jsonb_build_object('published', count(*) filter (where status = 'published'), 'draft', count(*) filter (where status = 'draft'), 'pending', count(*) filter (where draft_data is not null)) from public.doctors),
    'testimonials', (select jsonb_build_object('published', count(*) filter (where status = 'published'), 'draft', count(*) filter (where status = 'draft'), 'pending', count(*) filter (where draft_data is not null)) from public.testimonials),
    'gallery', (select jsonb_build_object('published', count(*) filter (where status = 'published'), 'draft', count(*) filter (where status = 'draft'), 'pending', count(*) filter (where draft_data is not null)) from public.gallery_items),
    'faqs', (select jsonb_build_object('published', count(*) filter (where status = 'published'), 'draft', count(*) filter (where status = 'draft'), 'pending', count(*) filter (where draft_data is not null)) from public.faqs),
    'sections_pending', (select count(*) from public.page_sections where draft_content is not null),
    'media', (select count(*) from public.media_assets));
  return v;
end $$;
revoke all on function public.admin_dashboard_stats() from public, anon;
grant execute on function public.admin_dashboard_stats() to authenticated;

-- ---------------------------------------------------------------------------
-- First Super Admin bootstrap. Run once from the Supabase SQL editor
-- (it cannot be called through the API). Works only while no Super Admin exists.
-- ---------------------------------------------------------------------------
create or replace function app.bootstrap_super_admin(p_email text, p_display_name text default '')
returns text language plpgsql security definer set search_path = ''
as $$
declare v_user uuid; v_email text := lower(btrim(p_email));
begin
  if exists (select 1 from public.admin_users where role = 'super_admin' and is_active) then
    raise exception 'A Super Admin already exists. Use the dashboard (Admin users) to add more.';
  end if;
  select id into v_user from auth.users where lower(email) = v_email;
  if v_user is null then
    raise exception 'Create the user % in Supabase Auth (Authentication → Users → Add user) first.', v_email;
  end if;
  insert into public.admin_users (user_id, email, display_name, role) values (v_user, v_email, coalesce(p_display_name, ''), 'super_admin')
  on conflict (user_id) do update set role = 'super_admin', is_active = true;
  return 'Super Admin access granted to ' || v_email;
end $$;
revoke all on function app.bootstrap_super_admin(text, text) from public, anon, authenticated, service_role;

-- Internal helper functions are not callable through the API.
revoke all on function app.touch(), app.stamp_published(), app.audit(), app.protect_builtin_media(),
  app.validate_settings(), app.guard_page_sections(), app.track_slug_change(), app.check_patient_consent(),
  app.media_consent_guard(), app.guard_nav_items(), app.guard_appointments(), app.stamp_note_author(),
  app.guard_admin_users(), app.media_json(uuid), app.preview_row(jsonb, boolean) from public, anon, authenticated;
grant execute on function app.is_safe_url(text, boolean) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Storage: public "media" bucket for website images.
--   * Anyone can view files by URL (website images are public).
--   * Only content admins can upload, replace or delete.
--   * Only generated names under uploads/YYYY/MM/<uuid>.<ext> (no path traversal).
--   * Max 5 MB; raster images only (no SVG uploads, to prevent script injection).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/x-icon', 'image/vnd.microsoft.icon'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "media admins read" on storage.objects;
create policy "media admins read" on storage.objects for select to authenticated
  using (bucket_id = 'media' and (select app.is_admin()));
drop policy if exists "media editors upload" on storage.objects;
create policy "media editors upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (select app.can_edit_content())
              and name ~ '^uploads/[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}\.(jpg|png|webp|avif|ico)$');
drop policy if exists "media editors update" on storage.objects;
create policy "media editors update" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (select app.can_edit_content()))
  with check (bucket_id = 'media' and (select app.can_edit_content())
              and name ~ '^uploads/[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}\.(jpg|png|webp|avif|ico)$');
drop policy if exists "media editors delete" on storage.objects;
create policy "media editors delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (select app.can_edit_content()));
