-- ============================================================================
-- Skyzone IT — Supabase Schema (run this whole file in the Supabase SQL Editor)
-- ============================================================================

create extension if not exists pgcrypto;

create sequence if not exists public.sky_id_seq start 1000;

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  sky_id      text not null unique,
  full_name   text,
  email       text,
  role        text not null default 'user' check (role in ('user', 'admin')),
  balance     numeric(12, 2) not null default 0 check (balance >= 0),
  status      text not null default 'active' check (status in ('active', 'suspended')),
  access_test_passed   boolean not null default false,
  access_test_attempts integer not null default 0,
  created_at  timestamptz not null default now()
);

create table public.tasks (
  id                uuid primary key default gen_random_uuid(),
  app_name          text not null,
  app_link          text not null,
  package_name      text not null,
  platform          text not null default 'android' check (platform in ('android', 'ios')),
  banner_url        text,
  description       text,
  reward            numeric(10, 2) not null default 0 check (reward >= 0),
  daily_limit       integer check (daily_limit is null or daily_limit > 0),
  ai_prompt         text not null default '',
  cron_time         time not null default '21:00',
  fail_action       text not null default 'rejected' check (fail_action in ('pending', 'rejected')),
  start_at          timestamptz,
  end_at            timestamptz,
  start_time        time,
  end_time          time,
  status            text not null default 'active' check (status in ('active', 'inactive')),
  last_verify_date  date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (end_at is null or start_at is null or end_at > start_at),
  check (start_time is null or end_time is null or end_time > start_time)
);

create table public.submissions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  task_id           uuid not null references public.tasks (id) on delete cascade,
  reviewer_name     text not null,
  reviewer_gmail    text not null,
  screenshot_url    text not null,
  status            text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_date    date not null,
  submitted_at      timestamptz not null default now(),
  verified_at       timestamptz,
  verified_by       text check (verified_by is null or verified_by in ('admin', 'cron')),
  reward            numeric(10, 2) not null default 0,
  verify_attempted  boolean not null default false,
  rejection_reason  text,
  synced_to_sheet   boolean not null default false
);

create table public.withdrawals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  method        text not null default 'bkash' check (method in ('bkash')),
  bkash_number  text not null check (bkash_number ~ '^01[3-9][0-9]{8}$'),
  amount        numeric(10, 2) not null check (amount >= 50),
  status        text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  note          text,
  created_at    timestamptz not null default now(),
  processed_at  timestamptz
);

create table public.balance_transactions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  type           text not null check (type in ('credit', 'debit')),
  amount         numeric(12, 2) not null check (amount > 0),
  reason         text not null,
  ref_id         text,
  balance_after  numeric(12, 2),
  created_at     timestamptz not null default now()
);

create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

insert into public.app_settings (key, value)
values
  ('min_withdrawal', '50'::jsonb),
  ('verify_tz', '"Asia/Dhaka"'::jsonb),
  ('auto_sync_sheets', 'true'::jsonb),
  ('admin_emails', '["skyzoneitltd@gmail.com"]'::jsonb),
  ('access_test', '{
    "notice": "Ei question er answer video te direct word-to-word bola hoyni, kintu video te bojhaiya deya hoyeche. Tai apni ja bujhte parsen tar basis e answer din.\n\nKintu kono vabei group er keo theke answer jigges korben na. Jodi keo ke disturb koren, ba answer jigges kore, ba cheating kore answer janar chesta koren, tahole group theke banned kora hobe ar kaj o deya hobe na.\n\nMone rakhben: apni chaile karor kache kaj ta ektu bojhe nite parben, but direct answer jigges kora jabe na.",
    "questions": [
      { "id": "watched", "q": "Apni ki video ta monojog diye dekhechen?" },
      { "id": "part2", "q": "Video te dekhano second part er nam ki?" },
      { "id": "parts", "q": "Video total koita part er kotha bola hoise?" },
      { "id": "method", "q": "Get free review method ta ki, bojhaiya koren." },
      { "id": "min_withdraw", "q": "Website er minimum withdrawal koto TK?" }
    ],
    "correct": {
      "watched": "The user must clearly say YES that they watched the video. Any affirmative counts (hea, ha, ha ji, ji, yes, dekhechi, etc).",
      "part2": "Account creation. Accept any wording meaning the same: account creation, account create, account toiri, signup, sign up, register, account banano.",
      "parts": "3 parts. Accept: 3, three, tin.",
      "method": "Facebook group e post/marketing kore, shekhan theke manusher ke inbox/chat e niye, tai der kache review niye, tarpor oi review gulo website e submit kora. Key points: (a) Facebook or group e marketing/post (b) inbox/chat e niye jawa (c) manush theke review newa (d) website e submit kora. A casual answer substantially covering these points must pass.",
      "min_withdraw": "50 TK. Accept: 50, 50 taka, 50tk, 50 tk."
    }
  }'::jsonb)
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- Review history (tracks generated reviews per task for uniqueness)
-- ----------------------------------------------------------------------------

create table public.review_history (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks (id) on delete cascade,
  review      text not null,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------

create index profiles_email_idx on public.profiles (lower(email));
create index profiles_created_idx on public.profiles (created_at desc);
create index tasks_status_idx on public.tasks (status);
create index submissions_user_idx on public.submissions (user_id, submitted_at desc);
create index submissions_task_status_idx on public.submissions (task_id, status);
create index submissions_status_date_idx on public.submissions (status, submitted_date);
create index submissions_pending_verify_idx on public.submissions (submitted_date)
  where status = 'pending' and verify_attempted = false;
create index submissions_sheet_idx on public.submissions (submitted_date)
  where status = 'approved' and synced_to_sheet = false;
create index withdrawals_status_idx on public.withdrawals (status, created_at desc);
create index withdrawals_user_idx on public.withdrawals (user_id, created_at desc);
create index balance_tx_user_idx on public.balance_transactions (user_id, created_at desc);
create index review_history_task_idx on public.review_history (task_id, created_at desc);

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------

create or replace function public.jwt_role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    'anon'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.authorize_admin()
returns void
language plpgsql
stable
as $$
begin
  if public.jwt_role() = 'service_role' then
    return;
  end if;
  if auth.uid() is not null and public.is_admin() then
    return;
  end if;
  raise exception 'Forbidden';
end;
$$;

create or replace function public.dhaka_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'Asia/Dhaka')::date;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

create trigger app_settings_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Custom user ID: sky-XXXX assigned automatically on signup
-- ----------------------------------------------------------------------------

create or replace function public.generate_sky_id()
returns text
language plpgsql
as $$
declare
  candidate text;
begin
  loop
    candidate := 'sky-' || lpad(((nextval('public.sky_id_seq') % 10000)::int)::text, 4, '0');
    exit when not exists (select 1 from public.profiles where sky_id = candidate);
  end loop;
  return candidate;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sky_id  text;
  v_name    text;
  v_admin   boolean;
  v_attempts integer := 0;
begin
  v_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    split_part(coalesce(new.email, 'user'), '@', 1)
  );

  select exists (
    select 1 from public.app_settings
    where key = 'admin_emails'
      and value @> to_jsonb(lower(new.email))
  ) into v_admin;

  loop
    begin
      v_sky_id := public.generate_sky_id();
      insert into public.profiles (id, sky_id, full_name, email, role)
      values (
        new.id,
        v_sky_id,
        v_name,
        new.email,
        case when v_admin then 'admin' else 'user' end
      );
      exit;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts >= 5 then
        raise;
      end if;
    end;
  end loop;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.submissions enable row level security;
alter table public.withdrawals enable row level security;
alter table public.balance_transactions enable row level security;
alter table public.app_settings enable row level security;
alter table public.review_history enable row level security;
-- review_history has no policies: only service_role may access it

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy tasks_select on public.tasks
  for select to authenticated
  using (public.is_admin() or status = 'active');

create policy tasks_admin_write on public.tasks
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy submissions_select on public.submissions
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy withdrawals_select on public.withdrawals
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy balance_tx_select on public.balance_transactions
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy settings_select on public.app_settings
  for select to authenticated
  using (public.is_admin() or key <> 'access_test');

create policy settings_admin_write on public.app_settings
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- RPC: create submission (enforces window + global daily limit race-safely)
-- ----------------------------------------------------------------------------

create or replace function public.create_submission(
  p_task_id uuid,
  p_reviewer_name text,
  p_reviewer_gmail text,
  p_screenshot_url text
)
returns public.submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_profile    public.profiles%rowtype;
  v_task       public.tasks%rowtype;
  v_now        time := (now() at time zone 'Asia/Dhaka')::time;
  v_count      integer;
  v_submission public.submissions%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_profile from public.profiles where id = v_uid for update;
  if not found then
    raise exception 'Profile not found';
  end if;
  if v_profile.status <> 'active' then
    raise exception 'Account suspended';
  end if;

  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'Task not found';
  end if;
  if v_task.status <> 'active' then
    raise exception 'Task is inactive';
  end if;
  if v_task.start_at is not null and now() < v_task.start_at then
    raise exception 'Task has not started yet';
  end if;
  if v_task.end_at is not null and now() > v_task.end_at then
    raise exception 'Task has ended';
  end if;

  if v_task.start_time is not null and v_now < v_task.start_time then
    raise exception 'Task is locked — opens at % (Asia/Dhaka)',
      to_char(v_task.start_time, 'HH24:MI');
  end if;
  if v_task.end_time is not null and v_now > v_task.end_time then
    raise exception 'Task is locked for today — closed at % (Asia/Dhaka), opens again at %',
      to_char(v_task.end_time, 'HH24:MI'),
      coalesce(to_char(v_task.start_time, 'HH24:MI'), '00:00');
  end if;

  if v_task.daily_limit is not null then
    select count(*) into v_count
    from public.submissions
    where task_id = v_task.id
      and submitted_date = public.dhaka_today();

    if v_count >= v_task.daily_limit then
      raise exception 'Daily review limit reached for this app';
    end if;
  end if;

  insert into public.submissions (
    user_id, task_id, reviewer_name, reviewer_gmail,
    screenshot_url, submitted_date, reward
  )
  values (
    v_uid, v_task.id, trim(p_reviewer_name), lower(trim(p_reviewer_gmail)),
    p_screenshot_url, public.dhaka_today(), v_task.reward
  )
  returning * into v_submission;

  return v_submission;
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC: approve submissions (credits balance, writes audit trail)
-- ----------------------------------------------------------------------------

create or replace function public.approve_submissions(
  p_ids uuid[],
  p_verified_by text default 'admin'
)
returns setof public.submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.submissions%rowtype;
begin
  perform public.authorize_admin();

  if coalesce(array_length(p_ids, 1), 0) = 0 then
    return;
  end if;
  if p_verified_by not in ('admin', 'cron') then
    p_verified_by := 'admin';
  end if;

  for v_row in
    update public.submissions s
    set status = 'approved',
        verified_at = now(),
        verified_by = p_verified_by,
        rejection_reason = null
    where s.id = any (p_ids)
      and s.status = 'pending'
    returning s.*
  loop
    update public.profiles p
    set balance = p.balance + v_row.reward
    where p.id = v_row.user_id;

    if v_row.reward > 0 then
      insert into public.balance_transactions (user_id, type, amount, reason, ref_id, balance_after)
      select v_row.user_id, 'credit', v_row.reward, 'submission_approved', v_row.id::text, p.balance
      from public.profiles p
      where p.id = v_row.user_id;
    end if;

    return next v_row;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC: reject submissions
-- ----------------------------------------------------------------------------

create or replace function public.reject_submissions(
  p_ids uuid[],
  p_reason text default null
)
returns setof public.submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.submissions%rowtype;
begin
  perform public.authorize_admin();

  if coalesce(array_length(p_ids, 1), 0) = 0 then
    return;
  end if;

  for v_row in
    update public.submissions s
    set status = 'rejected',
        verified_at = now(),
        verified_by = case when public.jwt_role() = 'service_role' then 'cron' else 'admin' end,
        rejection_reason = coalesce(nullif(trim(p_reason), ''), 'Not published on the store')
    where s.id = any (p_ids)
      and s.status = 'pending'
    returning s.*
  loop
    return next v_row;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC: reverse submissions (approved/rejected -> pending, balance adjusted)
-- ----------------------------------------------------------------------------

create or replace function public.reverse_submissions(p_ids uuid[])
returns setof public.submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old      record;
  v_row      public.submissions%rowtype;
  v_bal      numeric;
  v_deducted numeric;
begin
  perform public.authorize_admin();

  if coalesce(array_length(p_ids, 1), 0) = 0 then
    return;
  end if;

  for v_old in
    select id, status, reward, user_id
    from public.submissions
    where id = any (p_ids)
      and status in ('approved', 'rejected')
    for update
  loop
    update public.submissions s
    set status = 'pending',
        verified_at = null,
        verified_by = null,
        rejection_reason = null,
        verify_attempted = true
    where s.id = v_old.id
      and s.status = v_old.status
    returning s.* into v_row;

    if not found then
      continue;
    end if;

    if v_old.status = 'approved' and v_old.reward > 0 then
      select balance into v_bal
      from public.profiles
      where id = v_old.user_id
      for update;

      if found and v_bal is not null then
        v_deducted := least(v_old.reward, v_bal);

        update public.profiles
        set balance = v_bal - v_deducted
        where id = v_old.user_id;

        if v_deducted > 0 then
          insert into public.balance_transactions (
            user_id, type, amount, reason, ref_id, balance_after
          )
          values (
            v_old.user_id, 'debit', v_deducted,
            'submission_reversed', v_old.id::text, v_bal - v_deducted
          );
        end if;
      end if;
    end if;

    return next v_row;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC: mark verification attempts (cron)
-- ----------------------------------------------------------------------------

create or replace function public.set_verify_attempted(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.authorize_admin();

  update public.submissions
  set verify_attempted = true
  where id = any (p_ids)
    and status = 'pending'
    and verify_attempted = false;
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC: mark rows synced to Google Sheet
-- ----------------------------------------------------------------------------

create or replace function public.mark_sheet_synced(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.authorize_admin();

  update public.submissions
  set synced_to_sheet = true
  where id = any (p_ids)
    and status = 'approved'
    and synced_to_sheet = false;
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC: withdrawal request / admin actions
-- ----------------------------------------------------------------------------

create or replace function public.request_withdrawal(
  p_bkash_number text,
  p_amount numeric
)
returns public.withdrawals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  v_profile     public.profiles%rowtype;
  v_min         numeric;
  v_withdrawal  public.withdrawals%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_profile from public.profiles where id = v_uid for update;
  if not found then
    raise exception 'Profile not found';
  end if;
  if v_profile.status <> 'active' then
    raise exception 'Account suspended';
  end if;

  select (value #>> '{}')::numeric into v_min
  from public.app_settings where key = 'min_withdrawal';
  v_min := coalesce(v_min, 50);

  if p_amount < v_min then
    raise exception 'Minimum withdrawal is % TK', v_min;
  end if;
  if not (p_bkash_number ~ '^01[3-9][0-9]{8}$') then
    raise exception 'Invalid bKash number';
  end if;
  if v_profile.balance < p_amount then
    raise exception 'Insufficient balance';
  end if;

  update public.profiles
  set balance = balance - p_amount
  where id = v_uid and balance >= p_amount;

  insert into public.withdrawals (user_id, bkash_number, amount)
  values (v_uid, p_bkash_number, p_amount)
  returning * into v_withdrawal;

  insert into public.balance_transactions (user_id, type, amount, reason, ref_id, balance_after)
  select v_uid, 'debit', p_amount, 'withdrawal_requested', v_withdrawal.id::text, p.balance
  from public.profiles p where p.id = v_uid;

  return v_withdrawal;
end;
$$;

create or replace function public.set_withdrawal_status(
  p_id uuid,
  p_status text
)
returns public.withdrawals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_w public.withdrawals%rowtype;
begin
  perform public.authorize_admin();

  if p_status not in ('paid', 'cancelled') then
    raise exception 'Invalid status';
  end if;

  update public.withdrawals
  set status = p_status,
      processed_at = now()
  where id = p_id and status = 'pending'
  returning * into v_w;

  if not found then
    raise exception 'Withdrawal not found or already processed';
  end if;

  if p_status = 'cancelled' then
    update public.profiles
    set balance = balance + v_w.amount
    where id = v_w.user_id;

    insert into public.balance_transactions (user_id, type, amount, reason, ref_id, balance_after)
    select v_w.user_id, 'credit', v_w.amount, 'withdrawal_cancelled', v_w.id::text, p.balance
    from public.profiles p where p.id = v_w.user_id;
  end if;

  return v_w;
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC: admin user management
-- ----------------------------------------------------------------------------

create or replace function public.admin_adjust_balance(
  p_user_id uuid,
  p_amount numeric,
  p_direction text,
  p_reason text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
begin
  perform public.authorize_admin();

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than 0';
  end if;
  if p_direction not in ('add', 'deduct') then
    raise exception 'Invalid direction';
  end if;

  if p_direction = 'add' then
    update public.profiles
    set balance = balance + p_amount
    where id = p_user_id
    returning * into v_profile;
  else
    update public.profiles
    set balance = balance - p_amount
    where id = p_user_id and balance >= p_amount
    returning * into v_profile;
  end if;

  if not found then
    raise exception 'User not found or insufficient balance';
  end if;

  insert into public.balance_transactions (user_id, type, amount, reason, ref_id, balance_after)
  values (
    p_user_id,
    case when p_direction = 'add' then 'credit' else 'debit' end,
    p_amount,
    coalesce(nullif(trim(p_reason), ''), 'admin_adjustment'),
    null,
    v_profile.balance
  );

  return v_profile;
end;
$$;

create or replace function public.admin_set_user_status(
  p_user_id uuid,
  p_status text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
begin
  perform public.authorize_admin();

  if p_status not in ('active', 'suspended') then
    raise exception 'Invalid status';
  end if;

  update public.profiles
  set status = p_status
  where id = p_user_id
  returning * into v_profile;

  if not found then
    raise exception 'User not found';
  end if;

  return v_profile;
end;
$$;

create or replace function public.admin_set_role(
  p_user_id uuid,
  p_role text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
begin
  perform public.authorize_admin();

  if p_role not in ('user', 'admin') then
    raise exception 'Invalid role';
  end if;

  update public.profiles
  set role = p_role
  where id = p_user_id
  returning * into v_profile;

  if not found then
    raise exception 'User not found';
  end if;

  return v_profile;
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC: task board counters (dashboard, one aggregate call)
-- ----------------------------------------------------------------------------

create or replace function public.task_board_counts(
  p_task_ids uuid[],
  p_user_id uuid
)
returns table (task_id uuid, today_cnt bigint, my_cnt bigint)
language sql
stable
security definer
set search_path = public
as $$
  select s.task_id,
         count(*) filter (where s.submitted_date = public.dhaka_today())::bigint,
         count(*) filter (where s.user_id = p_user_id)::bigint
  from public.submissions s
  where s.task_id = any (p_task_ids)
  group by s.task_id;
$$;

-- ----------------------------------------------------------------------------
-- RPC: save generated review (backend/service only, prunes per-task history)
-- ----------------------------------------------------------------------------

create or replace function public.save_review_history(
  p_task_id uuid,
  p_review  text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claims text := current_setting('request.jwt.claims', true);
begin
  if v_claims is not null and v_claims <> '' then
    if coalesce(v_claims::jsonb ->> 'role', '') not in ('service_role', 'postgres') then
      raise exception 'not authorized';
    end if;
  end if;

  insert into public.review_history (task_id, review)
  values (p_task_id, p_review);

  delete from public.review_history
  where task_id = p_task_id
    and id not in (
      select id
      from public.review_history
      where task_id = p_task_id
      order by created_at desc
      limit 300
    );
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC: CRM stats
-- ----------------------------------------------------------------------------

create or replace function public.get_crm_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  perform public.authorize_admin();

  select jsonb_build_object(
    'system_balance', coalesce((select sum(balance) from public.profiles), 0),
    'total_users', (select count(*) from public.profiles),
    'active_users', (select count(*) from public.profiles where status = 'active'),
    'pending_submissions', (select count(*) from public.submissions where status = 'pending'),
    'approved_submissions', (select count(*) from public.submissions where status = 'approved'),
    'rejected_submissions', (select count(*) from public.submissions where status = 'rejected'),
    'active_tasks', (select count(*) from public.tasks where status = 'active'),
    'pending_withdrawals', (select count(*) from public.withdrawals where status = 'pending'),
    'paid_withdrawals', (select count(*) from public.withdrawals where status = 'paid')
  ) into v_result;

  return v_result;
end;
$$;

-- ----------------------------------------------------------------------------
-- Execution grants (sensitive functions never executable by anon)
-- ----------------------------------------------------------------------------

revoke execute on function
  public.is_admin(), public.authorize_admin(), public.jwt_role(), public.dhaka_today(),
  public.set_updated_at(), public.generate_sky_id(), public.handle_new_user(),
  public.create_submission(uuid, text, text, text),
  public.approve_submissions(uuid[], text),
  public.reject_submissions(uuid[], text),
  public.reverse_submissions(uuid[]),
  public.set_verify_attempted(uuid[]),
  public.mark_sheet_synced(uuid[]),
  public.request_withdrawal(text, numeric),
  public.set_withdrawal_status(uuid, text),
  public.admin_adjust_balance(uuid, numeric, text, text),
  public.admin_set_user_status(uuid, text),
  public.admin_set_role(uuid, text),
  public.get_crm_stats(),
  public.task_board_counts(uuid[], uuid)
from public, anon;

grant execute on function
  public.create_submission(uuid, text, text, text),
  public.request_withdrawal(text, numeric)
to authenticated;

grant execute on function
  public.approve_submissions(uuid[], text),
  public.reject_submissions(uuid[], text),
  public.reverse_submissions(uuid[]),
  public.set_verify_attempted(uuid[]),
  public.mark_sheet_synced(uuid[]),
  public.set_withdrawal_status(uuid, text),
  public.admin_adjust_balance(uuid, numeric, text, text),
  public.admin_set_user_status(uuid, text),
  public.admin_set_role(uuid, text),
  public.get_crm_stats(),
  public.task_board_counts(uuid[], uuid),
  public.is_admin(),
  public.jwt_role(),
  public.dhaka_today()
to authenticated, service_role;

revoke execute on function public.save_review_history(uuid, text)
from public, anon, authenticated;

grant execute on function public.save_review_history(uuid, text)
to service_role;

-- ----------------------------------------------------------------------------
-- Realtime (live task counters + submission history on the user panel)
-- ----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'submissions'
  ) then
    alter publication supabase_realtime add table public.submissions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'withdrawals'
  ) then
    alter publication supabase_realtime add table public.withdrawals;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Admin bootstrap: signing up with an email listed in app_settings.admin_emails
-- automatically gives that profile role = 'admin' (seeded with skyzoneitltd@gmail.com).
-- To grant admin to another email later:
--   update app_settings set value = value || '["you@example.com"]'::jsonb where key = 'admin_emails';
-- ----------------------------------------------------------------------------
