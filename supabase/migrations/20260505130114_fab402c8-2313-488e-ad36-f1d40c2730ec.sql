-- A6: Data Quality scoring
create table if not exists public.data_quality_metrics (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  entity text not null,
  metric text not null,
  value numeric not null default 0,
  total integer not null default 0,
  bad integer not null default 0,
  computed_at timestamptz not null default now()
);

create index if not exists idx_dqm_brand_metric_time
  on public.data_quality_metrics (brand_id, entity, metric, computed_at desc);

alter table public.data_quality_metrics enable row level security;

drop policy if exists "dqm_read_admin_ceo" on public.data_quality_metrics;
create policy "dqm_read_admin_ceo" on public.data_quality_metrics
  for select to authenticated
  using (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'ceo'::app_role));

drop policy if exists "dqm_no_write" on public.data_quality_metrics;
create policy "dqm_no_write" on public.data_quality_metrics
  for all to authenticated using (false) with check (false);

-- Compute function: callable by admin/ceo or by service role (internal cron)
create or replace function public.compute_data_quality()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  is_privileged boolean;
  rec record;
  v_now timestamptz := now();
  v_inserted integer := 0;
begin
  is_privileged := (auth.role() = 'service_role')
    or has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'ceo'::app_role);
  if not is_privileged then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Per brand
  for rec in
    select id as brand_id from public.brands where deleted_at is null
  loop
    -- contacts: telefono mancante o non valido
    insert into public.data_quality_metrics(brand_id, entity, metric, value, total, bad, computed_at)
    select rec.brand_id, 'contacts', 'phone_missing_or_invalid',
      case when count(*)=0 then 100
        else round(100.0 * (count(*) - count(*) filter (
          where phone is not null and phone ~ '^\+?[0-9 .\-()]{6,20}$'
        )) / count(*), 2) end,
      count(*),
      count(*) - count(*) filter (where phone is not null and phone ~ '^\+?[0-9 .\-()]{6,20}$'),
      v_now
    from public.contacts
    where brand_id = rec.brand_id and (deleted_at is null);
    v_inserted := v_inserted + 1;

    -- contacts: email mancante
    insert into public.data_quality_metrics(brand_id, entity, metric, value, total, bad, computed_at)
    select rec.brand_id, 'contacts', 'email_missing',
      case when count(*)=0 then 0 else round(100.0 * count(*) filter (where email is null or email = '') / count(*), 2) end,
      count(*),
      count(*) filter (where email is null or email = ''),
      v_now
    from public.contacts where brand_id = rec.brand_id and (deleted_at is null);
    v_inserted := v_inserted + 1;

    -- deals: senza stage
    insert into public.data_quality_metrics(brand_id, entity, metric, value, total, bad, computed_at)
    select rec.brand_id, 'deals', 'stage_missing',
      case when count(*)=0 then 0 else round(100.0 * count(*) filter (where stage_id is null) / count(*), 2) end,
      count(*), count(*) filter (where stage_id is null), v_now
    from public.deals where brand_id = rec.brand_id;
    v_inserted := v_inserted + 1;

    -- deals: senza valore
    insert into public.data_quality_metrics(brand_id, entity, metric, value, total, bad, computed_at)
    select rec.brand_id, 'deals', 'value_missing',
      case when count(*)=0 then 0 else round(100.0 * count(*) filter (where value is null or value = 0) / count(*), 2) end,
      count(*), count(*) filter (where value is null or value = 0), v_now
    from public.deals where brand_id = rec.brand_id;
    v_inserted := v_inserted + 1;

    -- appointments: scaduti senza outcome
    insert into public.data_quality_metrics(brand_id, entity, metric, value, total, bad, computed_at)
    select rec.brand_id, 'appointments', 'past_no_outcome',
      case when count(*)=0 then 0 else round(100.0 * count(*) filter (where scheduled_at < v_now and (outcome is null or outcome = '')) / count(*), 2) end,
      count(*),
      count(*) filter (where scheduled_at < v_now and (outcome is null or outcome = '')),
      v_now
    from public.appointments where brand_id = rec.brand_id;
    v_inserted := v_inserted + 1;

    -- leads: senza contact_id
    insert into public.data_quality_metrics(brand_id, entity, metric, value, total, bad, computed_at)
    select rec.brand_id, 'leads', 'contact_missing',
      case when count(*)=0 then 0 else round(100.0 * count(*) filter (where contact_id is null) / count(*), 2) end,
      count(*), count(*) filter (where contact_id is null), v_now
    from public.leads where brand_id = rec.brand_id;
    v_inserted := v_inserted + 1;
  end loop;

  return v_inserted;
end;
$$;

revoke all on function public.compute_data_quality() from public;
grant execute on function public.compute_data_quality() to authenticated;