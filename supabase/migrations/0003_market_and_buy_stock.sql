-- =============================================================================
-- Market data (mock) + buying stocks through confirm_action.
--   * public.stocks: ~10 assets with a fixed demo price and a risk level.
--   * confirm_action(): new 'buy_stock' branch. Price is re-read from
--     public.stocks at confirmation; max €1000 per trade.
-- Based on the 0002 version of confirm_action (keeps internal transfers).
-- =============================================================================

create table public.stocks (
  symbol     text primary key,
  name       text not null,
  price      numeric(14, 2) not null check (price > 0),
  currency   text not null default 'EUR',
  sector     text not null,
  asset_type text not null check (asset_type in ('stock', 'etf', 'bond_etf')),
  risk_level text not null check (risk_level in ('low', 'medium', 'high'))
);

alter table public.stocks enable row level security;
-- Everyone signed in can read prices; nobody can change them through the API.
create policy "stocks readable" on public.stocks for select to authenticated using (true);

insert into public.stocks (symbol, name, price, sector, asset_type, risk_level) values
  ('AGGH', 'iShares Core Global Aggregate Bond ETF', 5.12,   'Bonds',        'bond_etf', 'low'),
  ('IWDA', 'iShares Core MSCI World ETF',            102.35, 'Global',       'etf',      'medium'),
  ('VWCE', 'Vanguard FTSE All-World ETF',            131.90, 'Global',       'etf',      'medium'),
  ('KBC',  'KBC Group',                              72.30,  'Financials',   'stock',    'medium'),
  ('ABI',  'AB InBev',                               56.80,  'Consumer',     'stock',    'medium'),
  ('UCB',  'UCB',                                    165.20, 'Healthcare',   'stock',    'medium'),
  ('AAPL', 'Apple',                                  198.40, 'Technology',   'stock',    'high'),
  ('MSFT', 'Microsoft',                              412.10, 'Technology',   'stock',    'high'),
  ('NVDA', 'NVIDIA',                                 128.75, 'Technology',   'stock',    'high'),
  ('TSLA', 'Tesla',                                  245.60, 'Automotive',   'stock',    'high');

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
  v_stock     public.stocks;
  v_quantity  numeric(18, 6);
  c_max_transfer constant numeric := 500;   -- above this: extra verification (TODO)
  c_max_trade    constant numeric := 1000;  -- max per stock purchase
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

  v_amount := (v_action.payload ->> 'amount')::numeric(14, 2);
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
    if v_amount > c_max_trade then
      raise exception 'amount above limit' using errcode = '22023';
    end if;

    -- Price is ALWAYS read from our table at confirmation time, never from the payload.
    select * into v_stock from public.stocks where symbol = upper(v_action.payload ->> 'symbol');
    if not found then
      raise exception 'stock not found' using errcode = 'P0002';
    end if;

    select * into v_from from public.accounts
    where user_id = v_uid and type = 'checking' for update;
    if v_from.balance < v_amount then
      raise exception 'insufficient funds' using errcode = '22023';
    end if;

    v_quantity := round(v_amount / v_stock.price, 6);

    update public.accounts set balance = balance - v_amount where id = v_from.id;

    insert into public.holdings (user_id, symbol, quantity, avg_price)
    values (v_uid, v_stock.symbol, v_quantity, v_stock.price)
    on conflict (user_id, symbol) do update
      set avg_price = round(
            (public.holdings.quantity * public.holdings.avg_price + v_amount)
            / (public.holdings.quantity + excluded.quantity), 2),
          quantity  = public.holdings.quantity + excluded.quantity;

    insert into public.transactions (user_id, account_id, amount, description, category)
    values (v_uid, v_from.id, -v_amount,
            'Bought ' || trim(to_char(v_quantity, 'FM999999990.0999')) || ' × ' || v_stock.symbol, 'investment');

  else
    -- update_address: TODO
    raise exception 'action type % not supported yet', v_action.type using errcode = '0A000';
  end if;

  update public.pending_actions set status = 'confirmed', resolved_at = now() where id = v_action.id;
  insert into public.agent_logs (user_id, event, details)
  values (v_uid, 'action_confirmed', jsonb_build_object('action_id', v_action.id, 'type', v_action.type, 'amount', v_amount));

  return jsonb_build_object('ok', true, 'type', v_action.type, 'amount', v_amount);
end;
$$;

revoke execute on function public.confirm_action(uuid) from public, anon;
grant  execute on function public.confirm_action(uuid) to authenticated;
