-- Withdrawal fee: 5 TK below 1000 TK, 10 TK for 1000 TK and above.
-- `amount` stays the gross request (debited from the balance);
-- the user receives amount - fee, the platform keeps the fee.

alter table public.withdrawals
  add column if not exists fee numeric(10, 2) not null default 0 check (fee >= 0);

-- Only still-pending requests are backfilled; already processed rows keep
-- their original payout (fee 0).
update public.withdrawals
   set fee = case when amount >= 1000 then 10 else 5 end
 where status = 'pending'
   and fee = 0;

create or replace function public.request_withdrawal(
  p_bkash_number text,
  p_amount numeric
)
returns public.withdrawals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  v_profile     public.profiles%rowtype;
  v_min         numeric;
  v_fee         numeric;
  v_withdrawal  public.withdrawals%rowtype;
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

  select (value #>> '{}')::numeric into v_min
  from public.app_settings where key = 'min_withdrawal';
  v_min := coalesce(v_min, 50);

  if p_amount < v_min then
    raise exception 'Minimum withdrawal is % TK', v_min;
  end if;
  if not (p_bkash_number ~ '^01[3-9][0-9]{8}$') then
    raise exception 'Invalid bKash number';
  end if;
  if v_profile.balance < p_amount then
    raise exception 'Insufficient balance';
  end if;

  -- Withdrawal fee: 5 TK below 1000 TK, 10 TK for 1000 TK and above.
  v_fee := case when p_amount >= 1000 then 10 else 5 end;

  update public.profiles
  set balance = balance - p_amount
  where id = v_uid and balance >= p_amount;

  insert into public.withdrawals (user_id, bkash_number, amount, fee)
  values (v_uid, p_bkash_number, p_amount, v_fee)
  returning * into v_withdrawal;

  insert into public.balance_transactions (user_id, type, amount, reason, ref_id, balance_after)
  select v_uid, 'debit', p_amount, 'withdrawal_requested', v_withdrawal.id::text, p.balance
  from public.profiles p where p.id = v_uid;

  return v_withdrawal;
end;
$$;
