-- 0016: drop the DB similarity/duplicate gate from save_review_history.
-- Uniqueness now comes from the generator prompt (recent reviews are injected
-- so the model avoids them) plus an in-app identical-text retry. The DB only
-- records what was handed out.

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

  if btrim(coalesce(p_review, '')) = '' then
    raise exception 'Empty review';
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
      limit 1000
    );
end;
$$;
