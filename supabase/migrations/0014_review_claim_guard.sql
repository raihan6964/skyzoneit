-- ============================================================================
-- Migration: atomic review claim guard (no two users can receive the same review)
-- ============================================================================
-- Problem: concurrent generators loaded the same history snapshot, the AI
-- produced the same (or tiny-tweak) wording, and both users walked away with
-- an identical review. Two layers fix it:
--
--   1. pg_advisory_xact_lock serializes claims per task, so check-then-insert
--      becomes atomic (the old exists()-check had a race window).
--   2. pg_trgm similarity rejects near-clone wording, not just verbatim copies.
--      Calibrated on the real corpus (65,703 pairs):
--        distinct pairs       p95 = 0.33, p99 = 0.46
--        template clones      0.55 - 0.84
--      => similarity >= 0.52 (or a shared prefix span >= 0.70) lets genuinely
--         new reviews through and blocks clones.

create extension if not exists pg_trgm;

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
  v_best   real;
  v_span   real;
begin
  if v_claims is not null and v_claims <> '' then
    if coalesce(v_claims::jsonb ->> 'role', '') not in ('service_role', 'postgres') then
      raise exception 'not authorized';
    end if;
  end if;

  v_norm := lower(regexp_replace(coalesce(p_review, ''), '\s+', ' ', 'g'));
  if v_norm = '' then
    raise exception 'Empty review';
  end if;

  -- Serialize all claims for this task: no check/insert race between users.
  perform pg_advisory_xact_lock(hashtextextended('review_claim:' || p_task_id::text, 0));

  -- Verbatim duplicate.
  if exists (
    select 1
    from public.review_history
    where task_id = p_task_id
      and lower(regexp_replace(review, '\s+', ' ', 'g')) = v_norm
  ) then
    raise exception 'Duplicate review: regeneration required';
  end if;

  -- Near-clone wording (only meaningful for reviews long enough to compare):
  --   similarity     >= 0.52 catches full-sentence clones
  --   word_similarity >= 0.70 catches long shared prefixes ("First number was
  --   a dud, but they sent my refund fast and the..." variants score only
  --   ~0.51 overall). word_similarity is asymmetric, so take the greater of
  --   both directions (0.64 one way, 0.72 the other for that example).
  if length(v_norm) >= 12 then
    select max(similarity(lower(regexp_replace(review, '\s+', ' ', 'g')), v_norm)),
           max(greatest(
             word_similarity(lower(regexp_replace(review, '\s+', ' ', 'g')), v_norm),
             word_similarity(v_norm, lower(regexp_replace(review, '\s+', ' ', 'g')))
           ))
      into v_best, v_span
    from public.review_history
    where task_id = p_task_id
      and length(review) >= 12;

    if coalesce(v_best, 0) >= 0.52 or coalesce(v_span, 0) >= 0.70 then
      raise exception 'Similar review already exists (score %): regeneration required',
        round(greatest(coalesce(v_best, 0), coalesce(v_span, 0))::numeric, 2);
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
      limit 1000
    );
end;
$$;
