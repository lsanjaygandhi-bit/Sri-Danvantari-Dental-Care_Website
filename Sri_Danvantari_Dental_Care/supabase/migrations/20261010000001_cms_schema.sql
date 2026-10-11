-- =============================================================================
-- Sri Danvantari Dental Care — CMS schema (tables, helpers, triggers)
-- Idempotent: safe to run again (every object uses IF NOT EXISTS / OR REPLACE).
-- Creates no destructive changes. Row Level Security policies are in the next migration.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- Private helper schema. Not exposed through the Data API.
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'admin_role') then
    create type public.admin_role as enum ('super_admin', 'editor', 'front_desk');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'content_status') then
    create type public.content_status as enum ('draft', 'published', 'archived');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'appointment_status') then
    create type public.appointment_status as enum ('new', 'contacted', 'confirmed', 'completed', 'cancelled');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Admin users and role helpers
-- ---------------------------------------------------------------------------
create table if not exists public.admin_users (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text not null default '' check (char_length(display_name) <= 80),
  role         public.admin_role not null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid
);

create or replace function app.current_role()
returns public.admin_role
language sql stable security definer set search_path = ''
as $$
  select au.role from public.admin_users au
  where au.user_id = (select auth.uid()) and au.is_active
$$;

create or replace function app.has_role(variadic roles public.admin_role[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select au.role = any (roles) from public.admin_users au
    where au.user_id = (select auth.uid()) and au.is_active
  ), false)
$$;

create or replace function app.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select app.has_role('super_admin', 'editor', 'front_desk') $$;

create or replace function app.can_edit_content()
returns boolean language sql stable security definer set search_path = ''
as $$ select app.has_role('super_admin', 'editor') $$;

create or replace function app.is_super_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select app.has_role('super_admin') $$;

create or replace function app.can_manage_appointments()
returns boolean language sql stable security definer set search_path = ''
as $$ select app.has_role('super_admin', 'front_desk') $$;

revoke all on function app.current_role(), app.has_role(public.admin_role[]), app.is_admin(),
  app.can_edit_content(), app.is_super_admin(), app.can_manage_appointments() from public;
grant execute on function app.current_role(), app.has_role(public.admin_role[]), app.is_admin(),
  app.can_edit_content(), app.is_super_admin(), app.can_manage_appointments() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Generic triggers
-- ---------------------------------------------------------------------------
create or replace function app.touch()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end $$;

-- Stamp published_at when a row becomes published.
create or replace function app.stamp_published()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    new.published_at := now();
  end if;
  return new;
end $$;

-- Audit log: who changed what and when. Patient data is redacted.
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id    uuid,
  actor_email text,
  action      text not null,
  table_name  text not null,
  record_id   text,
  changes     jsonb
);
create index if not exists audit_log_occurred_idx on public.audit_log (occurred_at desc);
create index if not exists audit_log_table_idx on public.audit_log (table_name, record_id);

create or replace function app.audit()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_old jsonb; v_new jsonb; v_changes jsonb; v_id text;
  v_actor uuid := (select auth.uid());
  v_email text;
  v_pk text := coalesce(tg_argv[0], 'id');
  v_keep text[] := array['id', 'status', 'appointment_id', 'preferred_date', 'treatment'];
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new); end if;
  v_id := coalesce(v_new ->> v_pk, v_old ->> v_pk);

  if tg_op = 'UPDATE' then
    select jsonb_object_agg(e.key, jsonb_build_object('from', v_old -> e.key, 'to', e.value))
      into v_changes
      from jsonb_each(v_new) e
     where e.value is distinct from (v_old -> e.key)
       and e.key not in ('updated_at', 'updated_by');
    if v_changes is null then return null; end if;
  elsif tg_op = 'INSERT' then
    v_changes := v_new;
  else
    v_changes := v_old;
  end if;

  -- Never copy patient details into the audit log.
  if tg_table_name in ('appointments', 'appointment_notes') then
    select jsonb_object_agg(e.key, case when e.key = any (v_keep) then e.value else '"[redacted]"'::jsonb end)
      into v_changes from jsonb_each(v_changes) e;
  end if;

  if v_actor is not null then
    select u.email into v_email from auth.users u where u.id = v_actor;
  end if;

  insert into public.audit_log (actor_id, actor_email, action, table_name, record_id, changes)
  values (v_actor, coalesce(v_email, case when v_actor is null then 'public website' end),
          lower(tg_op), tg_table_name, v_id, v_changes);
  return null;
end $$;

-- Allow an admin RPC to write an explicit audit entry (e.g. CSV export, login).
create or replace function app.audit_event(p_action text, p_table text, p_record text, p_details jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_email text;
begin
  select u.email into v_email from auth.users u where u.id = (select auth.uid());
  insert into public.audit_log (actor_id, actor_email, action, table_name, record_id, changes)
  values ((select auth.uid()), v_email, p_action, p_table, p_record, p_details);
end $$;
revoke all on function app.audit_event(text, text, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Media library
-- ---------------------------------------------------------------------------
create table if not exists public.media_assets (
  id               uuid primary key default gen_random_uuid(),
  -- Uploaded files live in the "media" storage bucket under a generated name.
  storage_path     text unique check (storage_path ~ '^uploads/[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}\.(jpg|png|webp|avif|ico)$'),
  -- Original site files shipped with the website (preserved, never deleted).
  static_path      text unique check (static_path ~ '^assets/[A-Za-z0-9_./-]+\.(jpg|jpeg|png|webp|svg|ico)$' and static_path !~ '\.\.'),
  srcset           text check (srcset is null or srcset ~ '^assets/[A-Za-z0-9_./-]+ [0-9]+w(, assets/[A-Za-z0-9_./-]+ [0-9]+w)*$'),
  title            text not null default '' check (char_length(title) <= 120),
  original_name    text not null default '' check (char_length(original_name) <= 200),
  mime_type        text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon')),
  size_bytes       integer check (size_bytes is null or (size_bytes > 0 and size_bytes <= 5242880)),
  width            integer check (width is null or width between 1 and 10000),
  height           integer check (height is null or height between 1 and 10000),
  alt_text         text not null default '' check (char_length(alt_text) <= 300),
  caption          text not null default '' check (char_length(caption) <= 300),
  contains_patient boolean not null default false,
  patient_consent  boolean not null default false,
  consent_note     text not null default '' check (char_length(consent_note) <= 500),
  is_builtin       boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid,
  constraint media_one_location check ((storage_path is null) <> (static_path is null)),
  constraint media_svg_static_only check (mime_type <> 'image/svg+xml' or static_path is not null)
);

-- Built-in site files cannot be deleted from the library.
create or replace function app.protect_builtin_media()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if old.is_builtin then
    raise exception 'Original website images cannot be deleted. Replace the image instead.' using errcode = 'P0001';
  end if;
  return old;
end $$;

-- ---------------------------------------------------------------------------
-- Site settings (single JSON value per key, validated by trigger)
-- ---------------------------------------------------------------------------
create table if not exists public.site_settings (
  key        text primary key check (key in ('contact', 'hours', 'social', 'booking', 'announcement', 'branding', 'privacy', 'site')),
  value      jsonb not null check (jsonb_typeof(value) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create or replace function app.is_safe_url(u text, allow_relative boolean default true)
returns boolean language sql immutable set search_path = ''
as $$
  select u is null or u = '' or (
    char_length(u) <= 500 and u !~ '[\s<>"''`]' and (
      u ~* '^https://[a-z0-9.-]+(:[0-9]+)?(/[^\s]*)?$'
      or u ~ '^tel:\+?[0-9]{6,15}$'
      or u ~* '^mailto:[^@\s]+@[^@\s]+$'
      or (allow_relative and (u ~ '^[a-z0-9-]+\.html(\?[a-z0-9=&_-]*)?(#[a-z0-9-]+)?$' or u ~ '^#[a-z0-9-]+$'))
    )
  )
$$;

create or replace function app.validate_settings()
returns trigger language plpgsql set search_path = ''
as $$
declare v jsonb := new.value; k text;
begin
  case new.key
  when 'contact' then
    if coalesce(v->>'clinic_name', '') = '' or char_length(v->>'clinic_name') > 100 then raise exception 'Clinic name is required (max 100 characters).'; end if;
    if coalesce(v->>'phone', '') !~ '^[0-9]{10,13}$' then raise exception 'Phone must be digits only with country code, e.g. 919884048448.'; end if;
    if coalesce(v->>'whatsapp', '') !~ '^[0-9]{10,13}$' then raise exception 'WhatsApp number must be digits only with country code, e.g. 919884048448.'; end if;
    if coalesce(v->>'email', '') <> '' and v->>'email' !~* '^[^@\s<>]+@[^@\s<>]+\.[a-z]{2,}$' then raise exception 'Email address is not valid.'; end if;
    if not app.is_safe_url(v->>'maps_url', false) then raise exception 'Google Maps link must be an https:// link.'; end if;
    if coalesce(v->>'maps_url', '') <> '' and v->>'maps_url' !~* '^https://(maps\.app\.goo\.gl|goo\.gl|(www\.)?google\.[a-z.]+|maps\.google\.[a-z.]+)/' then raise exception 'Directions link must be a Google Maps link.'; end if;
    if char_length(coalesce(v->>'address_full', '')) not between 10 and 300 then raise exception 'Full address must be 10–300 characters.'; end if;
    if char_length(coalesce(v->>'map_query', '')) > 300 then raise exception 'Map search text is too long.'; end if;
  when 'hours' then
    if jsonb_typeof(coalesce(v->'rows', '[]')) <> 'array' then raise exception 'Opening hours rows must be a list.'; end if;
    if jsonb_typeof(coalesce(v->'closed_days', '[]')) <> 'array' then raise exception 'Closed days must be a list.'; end if;
    if exists (select 1 from jsonb_array_elements(coalesce(v->'closed_days', '[]')) d where jsonb_typeof(d) <> 'number' or (d)::text::int not between 0 and 6) then raise exception 'Closed days must be numbers 0 (Sunday) to 6 (Saturday).'; end if;
  when 'social' then
    for k in select jsonb_object_keys(v) loop
      if not app.is_safe_url(v->>k, false) or (coalesce(v->>k, '') <> '' and v->>k !~* '^https://') then raise exception 'Social link "%" must be an https:// link.', k; end if;
    end loop;
  when 'booking' then
    if coalesce(v->>'mode', '') not in ('whatsapp_and_store', 'whatsapp_only', 'store_only') then raise exception 'Booking mode is not valid.'; end if;
    if jsonb_typeof(coalesce(v->'treatment_options', '[]')) <> 'array' or jsonb_array_length(coalesce(v->'treatment_options', '[]')) = 0 then raise exception 'At least one treatment option is required.'; end if;
    if jsonb_typeof(coalesce(v->'time_options', '[]')) <> 'array' or jsonb_array_length(coalesce(v->'time_options', '[]')) = 0 then raise exception 'At least one time option is required.'; end if;
  when 'announcement' then
    if (v->>'enabled')::boolean and char_length(coalesce(v->>'text', '')) not between 3 and 200 then raise exception 'Announcement text must be 3–200 characters.'; end if;
    if not app.is_safe_url(v->>'link_url') then raise exception 'Announcement link is not a safe URL.'; end if;
    if coalesce(v->>'tone', 'info') not in ('info', 'alert') then raise exception 'Announcement style is not valid.'; end if;
  when 'branding' then
    if coalesce(v->>'theme_color', '') !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Theme colour must be a hex colour like #5b2c83.'; end if;
  when 'privacy' then
    if char_length(coalesce(v->>'cookie_notice_text', '')) > 400 then raise exception 'Cookie notice is too long.'; end if;
  when 'site' then
    if coalesce(v->>'site_url', '') <> '' and v->>'site_url' !~* '^https://[a-z0-9.-]+\.[a-z]{2,}/?$' then raise exception 'Website address must look like https://www.example.com'; end if;
  else null;
  end case;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Pages: editable sections (content = live, draft_content = pending changes)
-- ---------------------------------------------------------------------------
create table if not exists public.page_sections (
  id            uuid primary key default gen_random_uuid(),
  page          text not null check (page ~ '^[a-z0-9-]+$'),
  key           text not null check (key ~ '^[a-z0-9_]+$'),
  label         text not null check (char_length(label) between 1 and 80),
  sort_order    integer not null default 0,
  is_visible    boolean not null default true,
  is_locked     boolean not null default false,  -- e.g. the homepage hero
  can_hide      boolean not null default false,  -- only sections that are safe to hide
  can_reorder   boolean not null default false,
  schema        jsonb not null default '[]' check (jsonb_typeof(schema) = 'array'),
  content       jsonb not null default '{}' check (jsonb_typeof(content) = 'object'),
  draft_content jsonb check (draft_content is null or jsonb_typeof(draft_content) = 'object'),
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  unique (page, key)
);

create or replace function app.guard_page_sections()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Page sections cannot be deleted. Hide the section instead.';
  end if;
  if tg_op = 'UPDATE' then
    if old.is_locked and (new.content is distinct from old.content or new.draft_content is distinct from old.draft_content
        or new.is_visible is distinct from old.is_visible or new.sort_order is distinct from old.sort_order) then
      raise exception 'The "%" section is locked and cannot be changed from the dashboard.', old.label;
    end if;
    if new.is_locked is distinct from old.is_locked or new.schema is distinct from old.schema
       or new.page is distinct from old.page or new.key is distinct from old.key
       or new.can_hide is distinct from old.can_hide or new.can_reorder is distinct from old.can_reorder then
      raise exception 'Section structure cannot be changed from the dashboard.';
    end if;
    if not old.can_hide and new.is_visible is distinct from old.is_visible then
      raise exception 'The "%" section cannot be hidden.', old.label;
    end if;
    if not old.can_reorder and new.sort_order is distinct from old.sort_order then
      raise exception 'The "%" section cannot be moved.', old.label;
    end if;
    if new.content is distinct from old.content then new.published_at := now(); end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Doctors and staff
-- ---------------------------------------------------------------------------
create table if not exists public.doctors (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  kind             text not null default 'doctor' check (kind in ('doctor', 'staff')),
  name             text not null check (char_length(name) between 2 and 100),
  initials         text not null default '' check (char_length(initials) <= 3),
  qualifications   text not null default '' check (char_length(qualifications) <= 120),
  designation      text not null default '' check (char_length(designation) <= 120),
  specialisations  text[] not null default '{}' check (cardinality(specialisations) <= 20),
  experience       text not null default '' check (char_length(experience) <= 120),
  card_text        text not null default '' check (char_length(card_text) <= 400),
  bio              text not null default '' check (char_length(bio) <= 8000),
  photo_id         uuid references public.media_assets (id) on delete restrict,
  photo_alt        text not null default '' check (char_length(photo_alt) <= 200),
  photo_placeholder text not null default 'Photo not provided' check (char_length(photo_placeholder) <= 40),
  legacy_page      text unique check (legacy_page ~ '^[a-z0-9-]+\.html$'),
  seo_title        text not null default '' check (char_length(seo_title) <= 120),
  seo_description  text not null default '' check (char_length(seo_description) <= 320),
  noindex          boolean not null default false,
  sort_order       integer not null default 0,
  status           public.content_status not null default 'draft',
  draft_data       jsonb check (draft_data is null or jsonb_typeof(draft_data) = 'object'),
  published_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid
);

-- ---------------------------------------------------------------------------
-- Treatments
-- ---------------------------------------------------------------------------
create table if not exists public.treatment_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (char_length(name) between 2 and 80),
  slug       text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.treatments (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  title             text not null check (char_length(title) between 2 and 120),
  category_id       uuid references public.treatment_categories (id) on delete set null,
  display           text not null default 'more' check (display in ('featured', 'more')),
  show_on_home      boolean not null default false,
  card_summary      text not null default '' check (char_length(card_summary) <= 400),
  description       text not null default '' check (char_length(description) <= 4000),
  benefits          text[] not null default '{}' check (cardinality(benefits) <= 20),
  procedure_details text not null default '' check (char_length(procedure_details) <= 6000),
  consult_questions text[] not null default '{}' check (cardinality(consult_questions) <= 12),
  faqs              jsonb not null default '[]' check (jsonb_typeof(faqs) = 'array' and jsonb_array_length(faqs) <= 20),
  image_id          uuid references public.media_assets (id) on delete restrict,
  image_alt         text not null default '' check (char_length(image_alt) <= 300),
  booking_value     text not null default '' check (char_length(booking_value) <= 80),
  cta_label         text not null default 'Ask about this treatment' check (char_length(cta_label) between 1 and 60),
  seo_title         text not null default '' check (char_length(seo_title) <= 120),
  seo_description   text not null default '' check (char_length(seo_description) <= 320),
  og_image_id       uuid references public.media_assets (id) on delete restrict,
  noindex           boolean not null default false,
  sort_order        integer not null default 0,
  status            public.content_status not null default 'draft',
  draft_data        jsonb check (draft_data is null or jsonb_typeof(draft_data) = 'object'),
  published_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid
);

-- Slug history so old treatment/doctor links keep working.
create table if not exists public.slug_redirects (
  id         uuid primary key default gen_random_uuid(),
  entity     text not null check (entity in ('treatment', 'doctor')),
  old_slug   text not null,
  new_slug   text not null,
  created_at timestamptz not null default now(),
  unique (entity, old_slug)
);

create or replace function app.track_slug_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_entity text := tg_argv[0];
begin
  if new.slug is distinct from old.slug then
    -- The new slug may be reclaimed from an older redirect.
    delete from public.slug_redirects where entity = v_entity and old_slug = new.slug;
    -- Point existing redirects straight at the new slug (no chains).
    update public.slug_redirects set new_slug = new.slug where entity = v_entity and new_slug = old.slug;
    insert into public.slug_redirects (entity, old_slug, new_slug) values (v_entity, old.slug, new.slug)
      on conflict (entity, old_slug) do update set new_slug = excluded.new_slug, created_at = now();
  end if;
  return new;
end $$;

-- A new slug must not be an old slug that redirects elsewhere... handled above by reclaim.

-- ---------------------------------------------------------------------------
-- Testimonials
-- ---------------------------------------------------------------------------
create table if not exists public.testimonials (
  id            uuid primary key default gen_random_uuid(),
  author_name   text not null check (char_length(author_name) between 1 and 80),
  initials      text not null default '' check (char_length(initials) <= 3),
  quote         text not null check (char_length(quote) between 5 and 1200),
  label         text not null default 'Patient feedback' check (char_length(label) <= 80),
  source        text not null default '' check (char_length(source) <= 120),
  review_age    numeric,
  consent_basis text not null default 'not_confirmed' check (consent_basis in ('written_consent', 'public_google_review', 'not_confirmed')),
  consent_note  text not null default '' check (char_length(consent_note) <= 500),
  sort_order    integer not null default 0,
  status        public.content_status not null default 'draft',
  draft_data    jsonb check (draft_data is null or jsonb_typeof(draft_data) = 'object'),
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  constraint testimonial_consent_before_publish check (status <> 'published' or consent_basis <> 'not_confirmed')
);

-- ---------------------------------------------------------------------------
-- Gallery (clinic photos and treatment case examples)
-- ---------------------------------------------------------------------------
create table if not exists public.gallery_items (
  id           uuid primary key default gen_random_uuid(),
  gallery      text not null check (gallery in ('clinic', 'cases')),
  media_id     uuid not null references public.media_assets (id) on delete restrict,
  title        text not null default '' check (char_length(title) <= 120),
  caption      text not null default '' check (char_length(caption) <= 300),
  alt_text     text not null default '' check (char_length(alt_text) <= 300),
  sort_order   integer not null default 0,
  status       public.content_status not null default 'draft',
  draft_data   jsonb check (draft_data is null or jsonb_typeof(draft_data) = 'object'),
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid
);

-- Identifiable patient images need recorded consent before they can be published
-- anywhere on the site.
create or replace function app.check_patient_consent()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_media uuid; v_ok boolean;
begin
  if new.status <> 'published' then return new; end if;
  if tg_table_name = 'gallery_items' then v_media := new.media_id;
  elsif tg_table_name = 'doctors' then v_media := new.photo_id;
  elsif tg_table_name = 'treatments' then v_media := new.image_id;
  end if;
  if v_media is null then return new; end if;
  select (not m.contains_patient) or m.patient_consent into v_ok from public.media_assets m where m.id = v_media;
  if not coalesce(v_ok, true) then
    raise exception 'This image is marked as showing an identifiable patient without recorded consent, so it cannot be published.';
  end if;
  return new;
end $$;

create or replace function app.media_consent_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.contains_patient and not new.patient_consent then
    if exists (select 1 from public.gallery_items g where g.media_id = new.id and g.status = 'published')
       or exists (select 1 from public.doctors d where d.photo_id = new.id and d.status = 'published')
       or exists (select 1 from public.treatments t where t.image_id = new.id and t.status = 'published') then
      raise exception 'This image is used on the live website. Unpublish it there before marking it as an identifiable patient image without consent.';
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- FAQs
-- ---------------------------------------------------------------------------
create table if not exists public.faqs (
  id           uuid primary key default gen_random_uuid(),
  page         text not null default 'contact' check (page in ('contact')),
  question     text not null check (char_length(question) between 3 and 200),
  answer       text not null check (char_length(answer) between 3 and 2000),
  sort_order   integer not null default 0,
  status       public.content_status not null default 'draft',
  draft_data   jsonb check (draft_data is null or jsonb_typeof(draft_data) = 'object'),
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid
);

-- ---------------------------------------------------------------------------
-- Navigation and footer links
-- ---------------------------------------------------------------------------
create table if not exists public.nav_items (
  id           uuid primary key default gen_random_uuid(),
  location     text not null check (location in ('header', 'footer')),
  label        text not null check (char_length(label) between 1 and 40),
  href         text not null check (app.is_safe_url(href) and href <> ''),
  new_tab      boolean not null default false,
  sort_order   integer not null default 0,
  is_visible   boolean not null default true,
  is_essential boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid
);

create or replace function app.guard_nav_items()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_essential then raise exception 'Essential link "%" cannot be deleted.', old.label; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.is_essential then
    if not new.is_visible then raise exception 'Essential link "%" cannot be hidden.', old.label; end if;
    if new.href is distinct from old.href or new.location is distinct from old.location then
      raise exception 'The address of essential link "%" cannot be changed.', old.label;
    end if;
    if new.is_essential is distinct from old.is_essential then raise exception 'Essential flag cannot be changed.'; end if;
  end if;
  if tg_op = 'INSERT' and new.is_essential and (select auth.uid()) is not null then
    raise exception 'New links cannot be marked essential.';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- SEO per page
-- ---------------------------------------------------------------------------
create table if not exists public.seo_pages (
  path            text primary key check (path ~ '^[a-z0-9-]+\.html$'),
  label           text not null default '' check (char_length(label) <= 80),
  title           text not null check (char_length(title) between 1 and 120),
  description     text not null default '' check (char_length(description) <= 320),
  canonical_url   text check (canonical_url is null or canonical_url = '' or (app.is_safe_url(canonical_url, false) and canonical_url ~* '^https://')),
  og_title        text not null default '' check (char_length(og_title) <= 120),
  og_description  text not null default '' check (char_length(og_description) <= 320),
  og_image_id     uuid references public.media_assets (id) on delete restrict,
  robots          text not null default 'index,follow' check (robots in ('index,follow', 'noindex,follow', 'noindex,nofollow')),
  structured_data jsonb check (structured_data is null or jsonb_typeof(structured_data) in ('object', 'array')),
  in_sitemap      boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid
);

-- ---------------------------------------------------------------------------
-- Appointments (patient data — private)
-- ---------------------------------------------------------------------------
create table if not exists public.appointments (
  id             uuid primary key default gen_random_uuid(),
  reference      text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  patient_name   text not null check (char_length(patient_name) between 2 and 80),
  phone          text not null check (phone ~ '^[6-9][0-9]{9}$'),
  treatment      text not null default '' check (char_length(treatment) <= 80),
  preferred_date date,
  preferred_time text not null default '' check (char_length(preferred_time) <= 40),
  message        text not null default '' check (char_length(message) <= 500),
  status         public.appointment_status not null default 'new',
  source         text not null default 'website' check (source in ('website', 'admin')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid
);
create index if not exists appointments_created_idx on public.appointments (created_at desc);
create index if not exists appointments_status_idx on public.appointments (status);

create table if not exists public.appointment_notes (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  author_id      uuid default auth.uid(),
  author_email   text not null default '',
  note           text not null check (char_length(note) between 1 and 2000),
  created_at     timestamptz not null default now()
);
create index if not exists appointment_notes_appt_idx on public.appointment_notes (appointment_id);

-- Patient-entered fields are read-only after submission. Only status changes.
create or replace function app.guard_appointments()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (new.patient_name, new.phone, new.treatment, new.preferred_date, new.preferred_time, new.message, new.reference, new.created_at, new.source)
     is distinct from
     (old.patient_name, old.phone, old.treatment, old.preferred_date, old.preferred_time, old.message, old.reference, old.created_at, old.source) then
    raise exception 'Patient details cannot be edited. Add an internal note instead.';
  end if;
  return new;
end $$;

create or replace function app.stamp_note_author()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  new.author_id := (select auth.uid());
  select coalesce(u.email, '') into new.author_email from auth.users u where u.id = new.author_id;
  new.author_email := coalesce(new.author_email, '');
  new.created_at := now();
  return new;
end $$;

-- Rate limiting buckets for public endpoints (hashed keys only, no raw IPs).
create table if not exists app.rate_limits (
  bucket       text not null,
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (bucket, window_start)
);

-- ---------------------------------------------------------------------------
-- Admin user safety: at least one active super admin must always remain.
-- ---------------------------------------------------------------------------
create or replace function app.guard_admin_users()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_remaining int;
begin
  if tg_op in ('UPDATE', 'DELETE') and old.role = 'super_admin' and old.is_active then
    if tg_op = 'DELETE' or new.role <> 'super_admin' or not new.is_active then
      select count(*) into v_remaining from public.admin_users
       where role = 'super_admin' and is_active and user_id <> old.user_id;
      if v_remaining = 0 then
        raise exception 'At least one active Super Admin is required. Add another Super Admin first.';
      end if;
    end if;
  end if;
  if tg_op = 'UPDATE' and new.user_id = (select auth.uid()) and (new.role <> old.role or new.is_active <> old.is_active) then
    raise exception 'You cannot change your own role or deactivate your own account.';
  end if;
  if tg_op = 'DELETE' and old.user_id = (select auth.uid()) then
    raise exception 'You cannot remove your own admin access.';
  end if;
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'User id cannot be changed.';
  end if;
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------------
-- Attach triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['admin_users', 'media_assets', 'site_settings', 'page_sections', 'doctors',
    'treatment_categories', 'treatments', 'testimonials', 'gallery_items', 'faqs', 'nav_items', 'seo_pages', 'appointments']
  loop
    execute format('create or replace trigger %I before update on public.%I for each row execute function app.touch()', t || '_touch', t);
  end loop;

  foreach t in array array['doctors', 'treatments', 'testimonials', 'gallery_items', 'faqs']
  loop
    execute format('create or replace trigger %I before insert or update on public.%I for each row execute function app.stamp_published()', t || '_published', t);
  end loop;

  foreach t in array array['media_assets', 'site_settings', 'page_sections', 'doctors', 'treatment_categories',
    'treatments', 'testimonials', 'gallery_items', 'faqs', 'nav_items', 'seo_pages', 'appointments', 'appointment_notes', 'slug_redirects']
  loop
    execute format('create or replace trigger %I after insert or update or delete on public.%I for each row execute function app.audit(%L)',
      t || '_audit', t, case t when 'site_settings' then 'key' when 'seo_pages' then 'path' else 'id' end);
  end loop;
end $$;

create or replace trigger admin_users_audit after insert or update or delete on public.admin_users
  for each row execute function app.audit('user_id');
create or replace trigger admin_users_guard before update or delete on public.admin_users
  for each row execute function app.guard_admin_users();

create or replace trigger media_assets_protect before delete on public.media_assets
  for each row execute function app.protect_builtin_media();
create or replace trigger media_assets_consent before update on public.media_assets
  for each row execute function app.media_consent_guard();

create or replace trigger site_settings_validate before insert or update on public.site_settings
  for each row execute function app.validate_settings();

create or replace trigger page_sections_guard before update or delete on public.page_sections
  for each row execute function app.guard_page_sections();

create or replace trigger nav_items_guard before insert or update or delete on public.nav_items
  for each row execute function app.guard_nav_items();

create or replace trigger treatments_slug after update of slug on public.treatments
  for each row execute function app.track_slug_change('treatment');
create or replace trigger doctors_slug after update of slug on public.doctors
  for each row execute function app.track_slug_change('doctor');

create or replace trigger gallery_items_consent before insert or update on public.gallery_items
  for each row execute function app.check_patient_consent();
create or replace trigger doctors_consent before insert or update on public.doctors
  for each row execute function app.check_patient_consent();
create or replace trigger treatments_consent before insert or update on public.treatments
  for each row execute function app.check_patient_consent();

create or replace trigger appointments_guard before update on public.appointments
  for each row execute function app.guard_appointments();
create or replace trigger appointment_notes_author before insert on public.appointment_notes
  for each row execute function app.stamp_note_author();

-- Helpful indexes for foreign keys
create index if not exists doctors_photo_idx on public.doctors (photo_id);
create index if not exists treatments_image_idx on public.treatments (image_id);
create index if not exists treatments_og_image_idx on public.treatments (og_image_id);
create index if not exists treatments_category_idx on public.treatments (category_id);
create index if not exists gallery_media_idx on public.gallery_items (media_id);
create index if not exists seo_og_image_idx on public.seo_pages (og_image_id);
