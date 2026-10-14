-- ============================================================================
-- Migration: per-user task limit resets daily (Asia/Dhaka midnight)
-- ============================================================================
-- Previously the per-user cap counted ALL-time submissions, so users who had
-- already submitted N reviews before the limit existed were locked out
-- forever and nobody could submit. The cap now counts only today's
-- (Asia/Dhaka) submissions, cycling together with the task's daily limit.

-- 1) task_board_counts: add my_today (this user's count for today only)
--    Return type changes, so the function must be dropped and recreated.

drop function if exists public.task_board_counts(uuid[], uuid);

create function public.task_board_counts(
  p_task_ids uuid[],
  p_user_id uuid
)
returns table (task_id uuid, today_cnt bigint, my_cnt bigint, my_today bigint)
language sql
stable
security definer
set search_path = public
as $$
  select s.task_id,
         count(*) filter (where s.submitted_date = public.dhaka_today())::bigint,
         count(*) filter (where s.user_id = p_user_id)::bigint,
         count(*) filter (
           where s.user_id = p_user_id
             and s.submitted_date = public.dhaka_today()
         )::bigint
  from public.submissions s
  where s.task_id = any (p_task_ids)
  group by s.task_id;
$$;

revoke execute on function public.task_board_counts(uuid[], uuid)
  from public, anon;

grant execute on function public.task_board_counts(uuid[], uuid)
  to authenticated, service_role;

-- 2) create_submission: count only today's submissions for the per-user cap

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
