-- A7: optimistic concurrency control
-- Additive: nullable default 0, no breakage on existing inserts.

alter table public.appointments add column if not exists version integer not null default 0;
alter table public.deals       add column if not exists version integer not null default 0;
alter table public.tickets     add column if not exists version integer not null default 0;

create or replace function public.bump_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (TG_OP = 'UPDATE') then
    -- only bump if any non-version column changed
    if row(NEW.*) is distinct from row(OLD.*) then
      NEW.version := coalesce(OLD.version, 0) + 1;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_appointments_bump_version on public.appointments;
create trigger trg_appointments_bump_version
  before update on public.appointments
  for each row execute function public.bump_version();

drop trigger if exists trg_deals_bump_version on public.deals;
create trigger trg_deals_bump_version
  before update on public.deals
  for each row execute function public.bump_version();

drop trigger if exists trg_tickets_bump_version on public.tickets;
create trigger trg_tickets_bump_version
  before update on public.tickets
  for each row execute function public.bump_version();

-- Generic optimistic-update RPC. Caller passes table name (whitelist), id,
-- expected_version and a JSONB patch with only the columns to change.
create or replace function public.update_with_version(
  p_table text,
  p_id uuid,
  p_expected_version integer,
  p_patch jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sql text;
  v_set text;
  v_row jsonb;
  v_current integer;
begin
  if p_table not in ('appointments','deals','tickets') then
    raise exception 'invalid_table' using errcode = '22023';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'empty_patch' using errcode = '22023';
  end if;

  -- Lock row & check version (RLS still applies)
  execute format('select version from public.%I where id = $1 for update', p_table)
    into v_current using p_id;
  if v_current is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_current is distinct from p_expected_version then
    raise exception 'concurrency_conflict: current=% expected=%', v_current, p_expected_version
      using errcode = '40001';
  end if;

  -- Build SET clause from JSONB keys (values cast via jsonb_populate_record on the table type)
  v_sql := format(
    'update public.%I t set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1)) where t.id = $2 returning to_jsonb(t.*)',
    p_table,
    (select string_agg(quote_ident(k), ',') from jsonb_object_keys(p_patch) k),
    (select string_agg('p.' || quote_ident(k), ',') from jsonb_object_keys(p_patch) k),
    p_table
  );

  execute v_sql into v_row using p_patch, p_id;
  return v_row;
end;
$$;

revoke all on function public.update_with_version(text, uuid, integer, jsonb) from public;
grant execute on function public.update_with_version(text, uuid, integer, jsonb) to authenticated;