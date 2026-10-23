-- 0018: Fixed user mode - restrict a task to an admin-selected list of
-- users, each with their own daily review limit. While the mode is on, the
-- global daily limit and the normal per-user limit are ignored; only the
-- per-selected-user limit is enforced. Non-members cannot see, generate
-- for, or submit to the task.

alter table public.tasks
  add column if not exists fixed_user_mode boolean not null default false;

create table if not exists public.task_fixed_users (
  task_id     uuid not null references public.tasks (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  daily_limit integer not null check (daily_limit > 0),
  primary key (task_id, user_id)
);

create index if not exists task_fixed_users_user_idx
  on public.task_fixed_users (user_id);

alter table public.task_fixed_users enable row level security;
-- task_fixed_users has no policies: only service_role may access it

-- create_submission: enforce membership + per-user fixed limit in fixed mode
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
  v_fixed      integer;
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
    raise exception 'Task is locked - opens at % (Asia/Dhaka)',
      to_char(v_task.start_time, 'HH24:MI');
  end if;
  if v_task.end_time is not null and v_now > v_task.end_time then
    raise exception 'Task is locked for today - closed at %, opens again at %',
      to_char(v_task.end_time, 'HH24:MI'),
      coalesce(to_char(v_task.start_time, 'HH24:MI'), '00:00');
  end if;

  if v_task.fixed_user_mode then
    select daily_limit into v_fixed
    from public.task_fixed_users
    where task_id = v_task.id
      and user_id = v_uid;

    if v_fixed is null then
      raise exception 'This app is not available for your account';
    end if;

    select count(*) into v_count
    from public.submissions
    where task_id = v_task.id
      and user_id = v_uid
      and submitted_date = public.dhaka_today();

    if v_count >= v_fixed then
      raise exception 'You reached the daily limit of % reviews for this task',
        v_fixed;
    end if;
  else
    if v_task.daily_limit is not null then
      select count(*) into v_count
      from public.submissions
      where task_id = v_task.id
        and submitted_date = public.dhaka_today();

      if v_count >= v_task.daily_limit then
        raise exception 'Daily review limit reached for this app';
      end if;
    end if;

    if v_task.per_user_limit is not null then
      select count(*) into v_count
      from public.submissions
      where task_id = v_task.id
        and user_id = v_uid
        and submitted_date = public.dhaka_today();

      if v_count >= v_task.per_user_limit then
        raise exception 'You reached the daily limit of % reviews for this task',
          v_task.per_user_limit;
      end if;
    end if;
  end if;

  insert into public.submissions (
    user_id, task_id, reviewer_name, reviewer_gmail,
    screenshot_url, submitted_date, reward
  )
  values (
    v_uid, v_task.id, trim(p_reviewer_name),
    case when trim(coalesce(p_reviewer_gmail, '')) = '' then null
         else lower(trim(p_reviewer_gmail)) end,
    p_screenshot_url, public.dhaka_today(), v_task.reward
  )
  returning * into v_submission;

  return v_submission;
end;
$$;
