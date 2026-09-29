-- ============================================================================
-- 0004: daily active window for tasks (start_time / end_time, Asia/Dhaka)
--   - admin sets a daily start/end time per task from the panel
--   - outside that window submissions are rejected server-side (task locked)
--   - existing daily_limit check keeps locking the task when the cap is hit
-- ============================================================================

alter table public.tasks
  add column if not exists start_time time,
  add column if not exists end_time time;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tasks_daily_window_check'
  ) then
    alter table public.tasks
      add constraint tasks_daily_window_check
      check (start_time is null or end_time is null or end_time > start_time);
  end if;
end $$;

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
