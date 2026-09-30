-- Synthetic EUR prices for a hackathon demo. Not live market quotes or FX rates.
create table public.stocks (
  symbol text primary key,
  name text not null,
  price numeric(14, 2) not null check (price > 0 and price < 1000000000000),
  currency text not null default 'EUR' check (currency = 'EUR'),
  sector text not null,
  risk_level text not null check (risk_level in ('low', 'medium', 'high'))
);
alter table public.stocks enable row level security;
revoke all on public.stocks from public, anon, authenticated;
grant select on public.stocks to authenticated;
create policy "authenticated market read" on public.stocks for select to authenticated using (true);

-- No client write policy. Only database administration can seed/change prices.
insert into public.stocks (symbol, name, price, currency, sector, risk_level) values
  ('AAPL', 'Apple', 190.00, 'EUR', 'technology', 'high'),
  ('MSFT', 'Microsoft', 410.00, 'EUR', 'technology', 'high'),
  ('NVDA', 'NVIDIA', 120.00, 'EUR', 'technology', 'high'),
  ('KBC', 'KBC Group', 68.50, 'EUR', 'financials', 'high'),
  ('ABI', 'AB InBev', 56.00, 'EUR', 'consumer staples', 'high'),
  ('UCB', 'UCB', 150.00, 'EUR', 'healthcare', 'high'),
  ('IWDA', 'iShares Core MSCI World UCITS ETF', 88.40, 'EUR', 'world equity ETF', 'medium'),
  ('VWCE', 'Vanguard FTSE All-World UCITS ETF', 120.00, 'EUR', 'world equity ETF', 'medium'),
  ('AGGH', 'iShares Core Global Aggregate Bond UCITS ETF', 4.80, 'EUR', 'bonds ETF', 'low'),
  ('EUNL', 'iShares Core MSCI World UCITS ETF EUR listing', 90.00, 'EUR', 'world equity ETF', 'medium');

-- Preserve the latest 0002 internal-transfer implementation below.
-- =============================================================================
-- Internal transfers: when the contact's IBAN belongs to another Titan user,
-- credit their current account too (Emma −€30 → Tom +€30).
-- Transfers to IBANs outside Titan keep working as before (debit only).
-- =============================================================================

-- IBANs are compared without spaces/case.
create or replace function public.normalize_iban(p_iban text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(replace(coalesce(p_iban, ''), ' ', ''));
$$;

create or replace function public.confirm_action(p_action_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_action    public.pending_actions;
  v_amount    numeric(14, 2);
  v_from      public.accounts;
  v_to        public.accounts;
  v_contact   public.contacts;
  v_sender    text;
  v_stock public.stocks;
  v_quantity numeric(18, 6);
  v_raw_amount numeric;
  c_max_transfer constant numeric := 500;   -- above this: extra verification (TODO)
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Lock the action row and make sure it belongs to the caller.
  select * into v_action
  from public.pending_actions
  where id = p_action_id and user_id = v_uid
  for update;

  if not found then
    raise exception 'action not found' using errcode = 'P0002';
  end if;
  if v_action.status <> 'pending' then
    raise exception 'action already %', v_action.status using errcode = '22023';
  end if;
  if v_action.expires_at < now() then
    update public.pending_actions set status = 'failed', resolved_at = now() where id = v_action.id;
    return jsonb_build_object('ok', false, 'error', 'action expired');
  end if;

  v_raw_amount := (v_action.payload ->> 'amount')::numeric;
  if v_raw_amount is null or v_raw_amount::text in ('NaN', 'Infinity', '-Infinity')
    or v_raw_amount <= 0 or v_raw_amount <> round(v_raw_amount, 2) then
    raise exception 'invalid amount' using errcode = '22023';
  end if;
  v_amount := v_raw_amount;
  if v_amount is null or v_amount <= 0 then
    raise exception 'invalid amount' using errcode = '22023';
  end if;

  if v_action.type = 'transfer' then
    if v_amount > c_max_transfer then
      raise exception 'amount above limit' using errcode = '22023';
    end if;

    select * into v_contact from public.contacts
    where id = (v_action.payload ->> 'contact_id')::uuid and user_id = v_uid;
    if not found then
      raise exception 'contact not found' using errcode = 'P0002';
    end if;

    select * into v_from from public.accounts
    where user_id = v_uid and type = 'checking' for update;
    if v_from.balance < v_amount then
      raise exception 'insufficient funds' using errcode = '22023';
    end if;

    update public.accounts set balance = balance - v_amount where id = v_from.id;
    insert into public.transactions (user_id, account_id, amount, description, category)
    values (v_uid, v_from.id, -v_amount, 'Transfer to ' || v_contact.name, 'transfer');

    -- Receiver is a Titan customer? Credit their current account.
    select * into v_to from public.accounts
    where type = 'checking'
      and user_id <> v_uid
      and public.normalize_iban(iban) = public.normalize_iban(v_contact.iban)
    for update;

    if found then
      select coalesce(nullif(full_name, ''), 'a Titan customer') into v_sender
      from public.profiles where id = v_uid;

      update public.accounts set balance = balance + v_amount where id = v_to.id;
      insert into public.transactions (user_id, account_id, amount, description, category)
      values (v_to.user_id, v_to.id, v_amount, 'Transfer from ' || v_sender, 'transfer');
    end if;

  elsif v_action.type = 'move_to_savings' then
    select * into v_from from public.accounts where user_id = v_uid and type = 'checking' for update;
    select * into v_to   from public.accounts where user_id = v_uid and type = 'savings'  for update;
    if v_from.balance < v_amount then
      raise exception 'insufficient funds' using errcode = '22023';
    end if;

    update public.accounts set balance = balance - v_amount where id = v_from.id;
    update public.accounts set balance = balance + v_amount where id = v_to.id;
    insert into public.transactions (user_id, account_id, amount, description, category) values
      (v_uid, v_from.id, -v_amount, 'Moved to savings', 'savings'),
      (v_uid, v_to.id,    v_amount, 'From current account', 'savings');

  elsif v_action.type = 'buy_stock' then
    if v_amount > 1000 then
      raise exception 'amount above stock purchase limit' using errcode = '22023';
    end if;
    -- All market data comes from the database, never from action payload prices.
    select * into v_stock from public.stocks
    where symbol = upper(v_action.payload ->> 'symbol') for share;
    if not found or v_stock.currency <> 'EUR' then
      raise exception 'asset not available' using errcode = '22023';
    end if;
    select * into v_from from public.accounts
    where user_id = v_uid and type = 'checking' for update;
    if not found or v_from.currency <> 'EUR' then
      raise exception 'current EUR account not found' using errcode = '22023';
    end if;
    if v_from.balance < v_amount then
      raise exception 'insufficient funds' using errcode = '22023';
    end if;
    v_quantity := round(v_amount / v_stock.price, 6);
    if v_quantity <= 0 then
      raise exception 'amount too small for fractional units' using errcode = '22023';
    end if;
    update public.accounts set balance = balance - v_amount where id = v_from.id;
    insert into public.holdings as held (user_id, symbol, quantity, avg_price)
    values (v_uid, v_stock.symbol, v_quantity, v_amount / v_quantity)
    on conflict (user_id, symbol) do update set
      avg_price = round((held.quantity * held.avg_price + v_amount) / (held.quantity + excluded.quantity), 2),
      quantity = held.quantity + excluded.quantity;
    insert into public.transactions (user_id, account_id, amount, description, category, merchant)
    values (v_uid, v_from.id, -v_amount, 'Bought ' || v_quantity::text || ' × ' || v_stock.symbol, 'investment', v_stock.name);

  else
    -- update_address remains unsupported.
    raise exception 'action type % not supported yet', v_action.type using errcode = '0A000';
  end if;

  update public.pending_actions set status = 'confirmed', resolved_at = now() where id = v_action.id;
  insert into public.agent_logs (user_id, event, details)
  values (v_uid, 'action_confirmed', jsonb_build_object('action_id', v_action.id, 'type', v_action.type, 'amount', v_amount));

  return jsonb_build_object('ok', true, 'type', v_action.type, 'amount', v_amount);
end;
$$;

-- Same grants as 0001 (create or replace keeps them, but be explicit).
revoke execute on function public.confirm_action(uuid) from public, anon;
grant  execute on function public.confirm_action(uuid) to authenticated;
