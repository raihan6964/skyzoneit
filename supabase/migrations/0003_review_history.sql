-- ============================================================================
-- 0003: review_history — tracks AI-generated reviews per task so every new
-- generation can avoid repeating earlier wording (uniqueness guarantee).
-- ============================================================================

create table if not exists public.review_history (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks (id) on delete cascade,
  review      text not null,
  created_at  timestamptz not null default now()
);

create index if not exists review_history_task_idx
  on public.review_history (task_id, created_at desc);

alter table public.review_history enable row level security;
-- no policies on purpose: only service_role (bypasses RLS) may touch this table

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

revoke execute on function public.save_review_history(uuid, text)
from public, anon, authenticated;

grant execute on function public.save_review_history(uuid, text)
to service_role;
