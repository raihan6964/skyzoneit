-- ============================================================================
-- Migration: task_board_counts — one aggregate call for the dashboard
-- ============================================================================

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

revoke execute on function public.task_board_counts(uuid[], uuid)
  from public, anon;

grant execute on function public.task_board_counts(uuid[], uuid)
  to authenticated, service_role;
