-- Reliable 5-minute approval pings straight from Postgres (pg_cron + pg_net).
-- The secret lives in approval_pings (RLS with no policies: service role only);
-- the scheduled command references it, so nothing sensitive is stored in cron.job.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.approval_pings (
  id     boolean primary key default true,
  secret text not null
);

alter table public.approval_pings enable row level security;
revoke all on public.approval_pings from public, anon, authenticated;

insert into public.approval_pings (id, secret)
values (true, 'placeholder')
on conflict (id) do nothing;

select cron.unschedule('approval-ping')
where exists (select 1 from cron.job where jobname = 'approval-ping');

select cron.schedule(
  'approval-ping',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://skyzoneitltd.online/api/cron/verify',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select secret from public.approval_pings where id),
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 5000
  ) as request_id;
  $$
);
