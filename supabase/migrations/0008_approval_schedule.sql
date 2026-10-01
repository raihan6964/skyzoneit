-- Per-task approval start time (cron_time) drives auto-approval.
-- verify_attempted_at lets each pending row be retried once per day
-- (instead of a single lifetime attempt), and records when it was tried.

alter table public.submissions
  add column if not exists verify_attempted_at timestamptz;

update public.submissions
   set verify_attempted_at = now()
 where verify_attempted
   and verify_attempted_at is null;

-- Throttle lock for background approval triggers (3+ min cooldown).
insert into public.app_settings (key, value)
values ('approval_lock', '{"locked_at": "1970-01-01T00:00:00Z"}'::jsonb)
on conflict (key) do nothing;
