-- ===========================================================================
-- FOCUSLOCK MIGRATION: SINGLE-DEVICE SESSIONS (latest login wins)
-- Apply via the Supabase SQL editor.
--
-- Logic:
--   * Each install claims the account by (user_id, device_uuid).
--   * Claiming RETIRES every other device for that user (is_active = false),
--     INCLUDING legacy rows whose device_uuid IS NULL.
--   * Legacy (user_id, platform) rows (UNIQUE from migration 003) are ADOPTED
--     by writing the install uuid onto them — never duplicated.
--   * The backend exposes a status check; the superseded device is signed
--     out locally by the app on its next check, and its API calls are
--     rejected server-side by requireActiveDevice (x-device-uuid header).
-- ===========================================================================

alter table public.devices
  add column if not exists device_uuid text;

-- One row per (user, install) — supports upsert-style claiming.
create unique index if not exists devices_user_device_uuid_key
  on public.devices (user_id, device_uuid)
  where device_uuid is not null;

-- Atomic claim: retire all other devices, then activate (or re-activate)
-- this install — adopting a legacy NULL-uuid row for the same platform when
-- one exists so UNIQUE (user_id, platform) can never abort the claim.
-- SECURITY DEFINER — only callable by the service role.
create or replace function public.claim_device_session(
  p_user_id      uuid,
  p_device_uuid  text,
  p_device_name  text,
  p_platform     text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device public.devices%rowtype;
  v_legacy_id uuid;
begin
  if p_user_id is null or p_device_uuid is null or p_device_uuid = '' then
    raise exception 'user id and device uuid are required';
  end if;
  if p_platform not in ('ios', 'android', 'web') then
    raise exception 'platform must be ios, android or web';
  end if;

  -- Latest login wins: retire every OTHER install for this user (NULL uuid
  -- rows included — IS DISTINCT FROM treats NULL as a value).
  update public.devices
     set is_active = false,
         updated_at = now()
   where user_id = p_user_id
     and device_uuid is distinct from p_device_uuid;

  -- Adopt a legacy NULL-uuid row for this platform (keeps UNIQUE (user_id,
  -- platform) satisfied and preserves push tokens on that row).
  select id into v_legacy_id
    from public.devices
   where user_id = p_user_id
     and platform = p_platform
     and device_uuid is null
   limit 1;

  if v_legacy_id is not null then
    update public.devices
       set device_uuid  = p_device_uuid,
           device_name  = coalesce(p_device_name, device_name),
           is_active    = true,
           last_seen_at = now(),
           updated_at   = now()
     where id = v_legacy_id
    returning * into v_device;

    return to_jsonb(v_device);
  end if;

  insert into public.devices (user_id, device_uuid, device_name, platform, is_active, last_seen_at)
  values (p_user_id, p_device_uuid, coalesce(p_device_name, 'Unknown device'), p_platform, true, now())
  on conflict (user_id, device_uuid) where device_uuid is not null
  do update
     set device_name = excluded.device_name,
         platform    = excluded.platform,
         is_active   = true,
         last_seen_at = now(),
         updated_at  = now()
  returning * into v_device;

  return to_jsonb(v_device);
exception
  when unique_violation then
    -- UNIQUE (user_id, platform) hit a stale row we did not adopt above:
    -- fall back to updating the first conflicting row for this platform.
    update public.devices
       set device_uuid   = p_device_uuid,
           device_name   = coalesce(p_device_name, device_name),
           is_active     = true,
           last_seen_at  = now(),
           updated_at    = now()
     where user_id = p_user_id
       and platform = p_platform
    returning * into v_device;

    if v_device.id is null then
      raise;
    end if;
    return to_jsonb(v_device);
end;
$$;

revoke execute on function public.claim_device_session(uuid, text, text, text)
  from public, anon, authenticated;
grant  execute on function public.claim_device_session(uuid, text, text, text)
  to service_role;

-- Convenience: is a given install currently the active session holder?
create or replace function public.is_device_session_active(
  p_user_id     uuid,
  p_device_uuid text
) returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.devices d
     where d.user_id = p_user_id
       and d.device_uuid = p_device_uuid
       and d.is_active = true
  );
$$;

revoke execute on function public.is_device_session_active(uuid, text)
  from public, anon, authenticated;
grant  execute on function public.is_device_session_active(uuid, text)
  to service_role;
