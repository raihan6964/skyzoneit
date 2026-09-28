-- ============================================================================
-- Migration: reverse_submissions — move approved/rejected rows back to pending
-- (reversing an approval deducts the reward from the user's balance)
-- ============================================================================

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

revoke execute on function public.reverse_submissions(uuid[]) from public, anon;

grant execute on function public.reverse_submissions(uuid[])
  to authenticated, service_role;
