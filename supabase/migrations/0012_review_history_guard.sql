-- Review uniqueness guarantee:
--   - save_review_history now refuses to record an identical review twice
--     (protects against two concurrent generations slipping past the app
--     level check), and keeps 1000 reviews per task instead of 300 so old
--     wording stays off-limits much longer.

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
  v_norm   text;
begin
  if v_claims is not null and v_claims <> '' then
    if coalesce(v_claims::jsonb ->> 'role', '') not in ('service_role', 'postgres') then
      raise exception 'not authorized';
    end if;
  end if;

  v_norm := lower(regexp_replace(coalesce(p_review, ''), '\s+', ' ', 'g'));

  -- Concurrency guard: never record (or hand out) an identical review twice.
  if exists (
    select 1
    from public.review_history
    where task_id = p_task_id
      and lower(regexp_replace(review, '\s+', ' ', 'g')) = v_norm
  ) then
    raise exception 'Duplicate review: regeneration required';
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
