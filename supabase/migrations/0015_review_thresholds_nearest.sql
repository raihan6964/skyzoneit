-- ============================================================================
-- Migration: relax review claim thresholds + nearest-review feedback
-- ============================================================================
-- Why: leave-one-out on the live corpus (388 reviews) showed 47.7% of
-- already-accepted reviews would be rejected by the 0.52/0.70 guard. AI
-- candidates drawn from the same distribution kept failing all retry rounds
-- and users saw "AI keeps returning a review that already exists".
--
-- New thresholds (same corpus):
--   similarity        >= 0.60  (rejects ~26% of the corpus' nearest pairs)
--   word prefix span  >= 0.78  (long shared runs only)
-- Verbatim duplicates are still always blocked.
--
-- find_nearest_review() gives the generator the actual closest existing
-- review on rejection, so retry feedback can say exactly what to avoid
-- instead of guessing.

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
  --   similarity        >= 0.60 blocks full-sentence clones
  --   word_similarity   >= 0.78 blocks long shared prefixes
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

    if coalesce(v_best, 0) >= 0.60 or coalesce(v_span, 0) >= 0.78 then
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

-- Closest existing review for a candidate (used to build precise retry
-- feedback after a claim rejection).
create or replace function public.find_nearest_review(
  p_task_id uuid,
  p_review  text
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('review', x.nearest, 'score', round(x.score::numeric, 3))
  from (
    select r.review as nearest,
           greatest(
             similarity(lower(regexp_replace(r.review, '\s+', ' ', 'g')),
                        lower(regexp_replace(coalesce(p_review, ''), '\s+', ' ', 'g'))),
             word_similarity(lower(regexp_replace(r.review, '\s+', ' ', 'g')),
                             lower(regexp_replace(coalesce(p_review, ''), '\s+', ' ', 'g'))),
             word_similarity(lower(regexp_replace(coalesce(p_review, ''), '\s+', ' ', 'g')),
                             lower(regexp_replace(r.review, '\s+', ' ', 'g')))
           ) as score
    from public.review_history r
    where r.task_id = p_task_id
      and length(r.review) >= 12
    order by 2 desc
    limit 1
  ) x;
$$;

revoke execute on function public.find_nearest_review(uuid, text)
from public, anon, authenticated;

grant execute on function public.find_nearest_review(uuid, text)
to service_role;
