-- =======================================================================
-- FocusLock — Full Supabase SQL Schema
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- =======================================================================

-- -----------------------------------------------------------------------
-- EXTENSIONS
-- -----------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------
-- PROFILES
-- Extends Supabase auth.users with app-specific fields.
-- Includes unique username, email, display_name, avatar_url.
-- Automatically populated when a user signs up via trigger below.
-- -----------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null unique,
  username      text unique,
  display_name  text,
  avatar_url         text,
  accepted_terms_at  timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Public can check username availability
create policy "Anyone can check username availability"
  on public.profiles for select
  using (true);

-- -----------------------------------------------------------------------
-- DEVICES
-- Registered hardware devices running FocusLock enforcement client
-- -----------------------------------------------------------------------
create table if not exists public.devices (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  device_name   text not null,
  platform      text not null check (platform in ('ios', 'android')),
  push_token    text,
  is_active     boolean not null default true,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.devices enable row level security;

create policy "Users own their devices"
  on public.devices for all
  using (auth.uid() = user_id);

-- -----------------------------------------------------------------------
-- APP LIMITS
-- Per-app daily maximum usage limits in seconds
-- -----------------------------------------------------------------------
create table if not exists public.app_limits (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  device_id           uuid references public.devices(id) on delete set null,
  app_bundle_id       text not null,
  app_display_name    text,
  daily_limit_seconds integer not null check (daily_limit_seconds >= 0),
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, app_bundle_id)
);

alter table public.app_limits enable row level security;

create policy "Users own their app limits"
  on public.app_limits for all
  using (auth.uid() = user_id);

-- -----------------------------------------------------------------------
-- RESET WINDOWS
-- Daily reset time and grace window configuration
-- -----------------------------------------------------------------------
create table if not exists public.reset_windows (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  reset_time      time not null default '08:00:00',
  timezone        text not null default 'UTC',
  window_minutes  integer not null default 30,
  repeat_type     text not null default 'daily' check (repeat_type in ('daily', 'weekly')),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id)
);

alter table public.reset_windows enable row level security;

create policy "Users own their reset windows"
  on public.reset_windows for all
  using (auth.uid() = user_id);

-- -----------------------------------------------------------------------
-- USAGE SNAPSHOTS
-- Daily aggregated usage per app per user
-- -----------------------------------------------------------------------
create table if not exists public.usage_snapshots (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  device_id           uuid references public.devices(id) on delete set null,
  app_bundle_id       text not null,
  used_seconds        integer not null default 0,
  snapshot_date       date not null default current_date,
  created_at          timestamptz not null default now(),
  unique (user_id, app_bundle_id, snapshot_date)
);

alter table public.usage_snapshots enable row level security;

create policy "Users own their usage data"
  on public.usage_snapshots for all
  using (auth.uid() = user_id);

-- -----------------------------------------------------------------------
-- NOTIFICATION PREFERENCES
-- User notification toggles and quiet hours
-- -----------------------------------------------------------------------
create table if not exists public.notification_preferences (
  id                        uuid primary key default uuid_generate_v4(),
  user_id                   uuid not null references public.profiles(id) on delete cascade,
  notify_on_limit_reached   boolean not null default true,
  notify_window_opening     boolean not null default true,
  notify_window_closing     boolean not null default true,
  quiet_hours_start         time,
  quiet_hours_end           time,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (user_id)
);

alter table public.notification_preferences enable row level security;

create policy "Users own their notification prefs"
  on public.notification_preferences for all
  using (auth.uid() = user_id);

-- -----------------------------------------------------------------------
-- TRIGGER: auto-create profile + defaults on user signup
-- Supports username from raw_user_meta_data or generates from email
-- -----------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_username text;
begin
  v_username := coalesce(
    new.raw_user_meta_data->>'username',
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, email, username, display_name, avatar_url)
  values (
    new.id,
    new.email,
    v_username,
    coalesce(new.raw_user_meta_data->>'full_name', v_username),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set
    email = excluded.email,
    username = coalesce(excluded.username, public.profiles.username),
    display_name = coalesce(excluded.display_name, public.profiles.display_name),
    updated_at = now();

  insert into public.reset_windows (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- -----------------------------------------------------------------------
-- TRIGGER: auto-update updated_at timestamps
-- -----------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_devices_updated_at on public.devices;
create trigger set_devices_updated_at before update on public.devices
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_app_limits_updated_at on public.app_limits;
create trigger set_app_limits_updated_at before update on public.app_limits
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_reset_windows_updated_at on public.reset_windows;
create trigger set_reset_windows_updated_at before update on public.reset_windows
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_notification_prefs_updated_at on public.notification_preferences;
create trigger set_notification_prefs_updated_at before update on public.notification_preferences
  for each row execute procedure public.set_updated_at();

-- -----------------------------------------------------------------------
-- OTP VERIFICATIONS
-- Stores email verification and password reset OTP codes
-- -----------------------------------------------------------------------
create table if not exists public.otp_verifications (
  id          uuid primary key default uuid_generate_v4(),
  email       text not null,
  code        text not null,
  purpose     text not null check (purpose in ('register', 'forgot_password')),
  metadata    jsonb default '{}'::jsonb,
  expires_at  timestamptz not null,
  verified    boolean not null default false,
  attempts    integer not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.otp_verifications enable row level security;

-- -----------------------------------------------------------------------
-- INDEXES
-- -----------------------------------------------------------------------
create index if not exists idx_profiles_username on public.profiles(username);
create index if not exists idx_app_limits_user_id on public.app_limits(user_id);
create index if not exists idx_devices_user_id on public.devices(user_id);
create index if not exists idx_usage_snapshots_user_date on public.usage_snapshots(user_id, snapshot_date);
create index if not exists idx_otp_email_purpose on public.otp_verifications(email, purpose);

-- -----------------------------------------------------------------------
-- STORAGE: AVATARS BUCKET & POLICIES
-- -----------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880, -- 5MB file limit
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- 1. Anyone can view avatar images (public CDN)
drop policy if exists "Avatar images are publicly accessible" on storage.objects;
create policy "Avatar images are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- 2. Authenticated users can upload their own avatar
drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars' and
    (
      auth.uid()::text = (storage.foldername(name))[1] or
      name like (auth.uid()::text || '%')
    )
  );

-- 3. Users can update their own avatar
drop policy if exists "Users can update their own avatar" on storage.objects;
create policy "Users can update their own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars' and
    (
      auth.uid()::text = (storage.foldername(name))[1] or
      name like (auth.uid()::text || '%')
    )
  );

-- 4. Users can delete their own avatar
drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars' and
    (
      auth.uid()::text = (storage.foldername(name))[1] or
      name like (auth.uid()::text || '%')
    )
  );

