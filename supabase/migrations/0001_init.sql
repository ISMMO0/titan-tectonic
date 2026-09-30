-- =============================================================================
-- Titan Tectonic — initial schema
--
-- Security model:
--   * Every table has RLS enabled and rows are scoped to auth.uid().
--   * Clients (browser or server with the user's session) can only READ money
--     data. Balances are never updated directly by clients.
--   * Money moves only through `confirm_action`, a SECURITY DEFINER function
--     that re-validates everything (owner, status, expiry, limits, balance).
--   * The AI agent can only create `pending_actions`; a human must confirm.
--
-- Never edit this file after it has been applied — add 0002_*.sql instead.
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  full_name       text not null default '',
  risk_level      text not null default 'medium' check (risk_level in ('low', 'medium', 'high')),
  goals           jsonb not null default '[]'::jsonb,
  calendar_opt_in boolean not null default false,
  created_at      timestamptz not null default now()
);

create table public.accounts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  type       text not null check (type in ('checking', 'savings', 'investment')),
  name       text not null,
  iban       text,
  balance    numeric(14, 2) not null default 0 check (balance >= 0),
  currency   text not null default 'EUR',
  created_at timestamptz not null default now(),
  unique (user_id, type)
);

create table public.transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  account_id  uuid not null references public.accounts (id) on delete cascade,
  amount      numeric(14, 2) not null,           -- negative = money out
  description text not null,
  category    text not null default 'other',
  merchant    text,
  booked_at   timestamptz not null default now()
);
create index transactions_user_booked_idx on public.transactions (user_id, booked_at desc);

create table public.contacts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  iban       text not null,
  created_at timestamptz not null default now()
);

create table public.holdings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  symbol     text not null,
  quantity   numeric(18, 6) not null check (quantity >= 0),
  avg_price  numeric(14, 2) not null,
  created_at timestamptz not null default now(),
  unique (user_id, symbol)
);

create table public.calendar_events (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users (id) on delete cascade,
  title     text not null,
  location  text,
  starts_at timestamptz not null,
  ends_at   timestamptz,
  kind      text not null default 'event' check (kind in ('event', 'travel', 'bill', 'celebration'))
);

-- Actions proposed by the agent, waiting for the human to confirm.
create table public.pending_actions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  type         text not null check (type in ('transfer', 'move_to_savings', 'buy_stock', 'update_address')),
  payload      jsonb not null,
  summary      text not null,
  status       text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'failed')),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '10 minutes',
  resolved_at  timestamptz
);

-- Audit trail of everything the agent did (visible to the user).
create table public.agent_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  event      text not null,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles        enable row level security;
alter table public.accounts        enable row level security;
alter table public.transactions    enable row level security;
alter table public.contacts        enable row level security;
alter table public.holdings        enable row level security;
alter table public.calendar_events enable row level security;
alter table public.pending_actions enable row level security;
alter table public.agent_logs      enable row level security;

-- Read-only for the owner (money data is only mutated by confirm_action).
create policy "own profile read"    on public.profiles        for select to authenticated using (id = (select auth.uid()));
create policy "own accounts read"   on public.accounts        for select to authenticated using (user_id = (select auth.uid()));
create policy "own tx read"         on public.transactions    for select to authenticated using (user_id = (select auth.uid()));
create policy "own holdings read"   on public.holdings        for select to authenticated using (user_id = (select auth.uid()));
create policy "own calendar read"   on public.calendar_events for select to authenticated using (user_id = (select auth.uid()));
create policy "own contacts read"   on public.contacts        for select to authenticated using (user_id = (select auth.uid()));
create policy "own actions read"    on public.pending_actions for select to authenticated using (user_id = (select auth.uid()));
create policy "own logs read"       on public.agent_logs      for select to authenticated using (user_id = (select auth.uid()));

-- Limited writes.
create policy "own profile update"  on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "own contacts insert" on public.contacts for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "own actions insert"  on public.pending_actions for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending');
create policy "own logs insert"     on public.agent_logs for insert to authenticated
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- New user → profile + default accounts
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));

  insert into public.accounts (user_id, type, name) values
    (new.id, 'checking', 'Current account'),
    (new.id, 'savings', 'Savings account'),
    (new.id, 'investment', 'Investment account');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Confirm / cancel a pending action (the ONLY way money moves)
-- ---------------------------------------------------------------------------

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

  else
    -- buy_stock / update_address: TODO (see PROJECT_PLAN.md phases 3–4)
    raise exception 'action type % not supported yet', v_action.type using errcode = '0A000';
  end if;

  update public.pending_actions set status = 'confirmed', resolved_at = now() where id = v_action.id;
  insert into public.agent_logs (user_id, event, details)
  values (v_uid, 'action_confirmed', jsonb_build_object('action_id', v_action.id, 'type', v_action.type, 'amount', v_amount));

  return jsonb_build_object('ok', true, 'type', v_action.type, 'amount', v_amount);
end;
$$;

create or replace function public.cancel_action(p_action_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.pending_actions
  set status = 'cancelled', resolved_at = now()
  where id = p_action_id and user_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'action not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Only signed-in users may call these; never anon / public.
revoke execute on function public.confirm_action(uuid)  from public, anon;
revoke execute on function public.cancel_action(uuid)   from public, anon;
revoke execute on function public.handle_new_user()     from public, anon, authenticated;
grant  execute on function public.confirm_action(uuid)  to authenticated;
grant  execute on function public.cancel_action(uuid)   to authenticated;
