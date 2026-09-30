-- =============================================================================
-- Demo data for 3 personas. Safe to re-run.
--
-- 1. Create these users first in Supabase → Authentication → Users → "Add user"
--    (tick "Auto Confirm User", choose your own password — never commit it):
--      emma@titan.demo   — 29, loves travel, saving for a house
--      lucas@titan.demo  — 21, student, tight budget
--      sofia@titan.demo  — 34, new parent
--      tom@titan.demo    — 30, Emma's friend (receives her transfers)
-- 2. Then run this file in the SQL editor.
--    The on_auth_user_created trigger already created their profile + accounts.
-- =============================================================================

do $$
declare
  u record;
  v_checking uuid;
  v_savings  uuid;
begin
  for u in
    select id, email from auth.users
    where email in ('emma@titan.demo', 'lucas@titan.demo', 'sofia@titan.demo', 'tom@titan.demo')
  loop
    -- Reset previous demo data for this user
    delete from public.transactions    where user_id = u.id;
    delete from public.contacts        where user_id = u.id;
    delete from public.holdings        where user_id = u.id;
    delete from public.calendar_events where user_id = u.id;
    delete from public.pending_actions where user_id = u.id;
    delete from public.agent_logs      where user_id = u.id;

    select id into v_checking from public.accounts where user_id = u.id and type = 'checking';
    select id into v_savings  from public.accounts where user_id = u.id and type = 'savings';

    if u.email = 'emma@titan.demo' then
      update public.profiles set full_name = 'Emma Peeters', risk_level = 'medium', calendar_opt_in = true,
        goals = '[{"title": "Buy a house", "target": 40000, "deadline": "2029-06-01"}]'
        where id = u.id;
      update public.accounts set balance = 3240.50, iban = 'BE71 0961 2345 6769' where id = v_checking;
      update public.accounts set balance = 12800.00 where id = v_savings;

      insert into public.contacts (user_id, name, iban) values
        (u.id, 'Tom Janssens', 'BE68 5390 0754 7034'),
        (u.id, 'Sarah Maes',   'BE43 0689 9999 9501'),
        (u.id, 'Mom',          'BE62 5100 0754 7061');

      insert into public.transactions (user_id, account_id, amount, description, category, merchant, booked_at) values
        (u.id, v_checking,  3150.00, 'Salary September',  'income',    'Acme NV',      now() - interval '5 days'),
        (u.id, v_checking,  -950.00, 'Rent',              'housing',   'Immo Gent',    now() - interval '4 days'),
        (u.id, v_checking,   -84.30, 'Groceries',         'food',      'Delhaize',     now() - interval '3 days'),
        (u.id, v_checking,  -642.00, 'Flight BRU → NRT',  'travel',    'Lufthansa',    now() - interval '3 days'),
        (u.id, v_checking,   -12.99, 'Spotify',           'subscriptions', 'Spotify',  now() - interval '2 days'),
        (u.id, v_checking,   -46.20, 'Dinner',            'food',      'Ellis Gourmet Burger', now() - interval '1 day'),
        (u.id, v_checking,   -29.00, 'Train tickets',     'transport', 'NMBS/SNCB',    now() - interval '1 day');

      insert into public.holdings (user_id, symbol, quantity, avg_price) values
        (u.id, 'IWDA', 12, 88.40);

      insert into public.calendar_events (user_id, title, location, starts_at, ends_at, kind) values
        (u.id, 'Flight to Tokyo', 'Tokyo, Japan', now() + interval '8 days', now() + interval '22 days', 'travel'),
        (u.id, 'Sarah''s wedding', 'Bruges',      now() + interval '4 days', null, 'celebration'),
        (u.id, 'Rent due',        null,           now() + interval '26 days', null, 'bill');

    elsif u.email = 'lucas@titan.demo' then
      update public.profiles set full_name = 'Lucas Dubois', risk_level = 'low', calendar_opt_in = true,
        goals = '[{"title": "Emergency fund", "target": 1000, "deadline": "2027-01-01"}]'
        where id = u.id;
      update public.accounts set balance = 186.40, iban = 'BE12 7350 0001 2345' where id = v_checking;
      update public.accounts set balance = 250.00 where id = v_savings;

      insert into public.contacts (user_id, name, iban) values
        (u.id, 'Noah (roommate)', 'BE98 0634 1234 5678');

      insert into public.transactions (user_id, account_id, amount, description, category, merchant, booked_at) values
        (u.id, v_checking,  650.00, 'Student job',   'income',  'Colruyt',      now() - interval '10 days'),
        (u.id, v_checking, -420.00, 'Kot rent',      'housing', 'KU Leuven',    now() - interval '9 days'),
        (u.id, v_checking,  -23.50, 'Groceries',     'food',    'Aldi',         now() - interval '2 days'),
        (u.id, v_checking,  -15.00, 'Party ticket',  'leisure', 'Ticketmaster', now() - interval '1 day');

      insert into public.calendar_events (user_id, title, starts_at, kind) values
        (u.id, 'Exams start', now() + interval '60 days', 'event');

    elsif u.email = 'sofia@titan.demo' then
      update public.profiles set full_name = 'Sofia Rossi', risk_level = 'high', calendar_opt_in = false,
        goals = '[{"title": "Education fund for Mia", "target": 25000, "deadline": "2044-09-01"}]'
        where id = u.id;
      update public.accounts set balance = 5120.75, iban = 'BE55 0017 6543 2109' where id = v_checking;
      update public.accounts set balance = 21400.00 where id = v_savings;

      insert into public.contacts (user_id, name, iban) values
        (u.id, 'Daycare Zonnebloem', 'BE21 0012 3456 7803');

      insert into public.transactions (user_id, account_id, amount, description, category, merchant, booked_at) values
        (u.id, v_checking, 4200.00, 'Salary',      'income',   'KBC Group', now() - interval '6 days'),
        (u.id, v_checking, -310.00, 'Daycare',     'childcare','Zonnebloem',now() - interval '5 days'),
        (u.id, v_checking,  -89.90, 'Diapers & baby food', 'childcare', 'Kruidvat', now() - interval '2 days'),
        (u.id, v_checking, -150.00, 'Pharmacy',    'health',   'Apotheek',  now() - interval '1 day');

      insert into public.holdings (user_id, symbol, quantity, avg_price) values
        (u.id, 'AAPL', 5, 190.00),
        (u.id, 'KBC',  20, 68.50);

    elsif u.email = 'tom@titan.demo' then
      update public.profiles set full_name = 'Tom Janssens', risk_level = 'medium', calendar_opt_in = false,
        goals = '[{"title": "New bike", "target": 1500, "deadline": "2027-04-01"}]'
        where id = u.id;
      -- Same IBAN as "Tom Janssens" in Emma's contacts → her transfers land here.
      update public.accounts set balance = 1450.00, iban = 'BE68 5390 0754 7034' where id = v_checking;
      update public.accounts set balance = 3000.00 where id = v_savings;

      insert into public.contacts (user_id, name, iban) values
        (u.id, 'Emma Peeters', 'BE71 0961 2345 6769');

      insert into public.transactions (user_id, account_id, amount, description, category, merchant, booked_at) values
        (u.id, v_checking, 2800.00, 'Salary September', 'income', 'Proximus', now() - interval '6 days'),
        (u.id, v_checking, -780.00, 'Rent',             'housing', 'Immo Leuven', now() - interval '5 days'),
        (u.id, v_checking,  -54.10, 'Groceries',        'food',    'Colruyt',  now() - interval '2 days');
    end if;
  end loop;
end;
$$;
