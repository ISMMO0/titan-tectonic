/* eslint-disable @typescript-eslint/no-require-imports -- Optional Node CommonJS database test harness. */
// Optional isolated SQL suite: set PGLITE_MODULE to an installed @electric-sql/pglite directory.
// Run: node --test src/lib/agent/database.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test(
  "market RLS, stock confirmation and preserved internal transfers",
  { skip: !process.env.PGLITE_MODULE },
  async () => {
    const { PGlite } = require(process.env.PGLITE_MODULE);
    const db = new PGlite();
    const emma = "00000000-0000-4000-8000-000000000001";
    const tom = "00000000-0000-4000-8000-000000000002";
    try {
      await db.exec(`create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth, public to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;`);
      const migration = (name) =>
        fs.readFileSync(path.resolve(__dirname, "../../..", "supabase/migrations", name), "utf8");
      // gen_random_uuid is built into this test PostgreSQL; only pgcrypto extension loading is omitted.
      await db.exec(migration("0001_init.sql").replace("create extension if not exists pgcrypto;", ""));
      await db.exec(migration("0003_market.sql"));
      await db.query("insert into auth.users(id,email) values ($1,$2),($3,$4)", [
        emma,
        "emma@titan.demo",
        tom,
        "tom@titan.demo",
      ]);
      await db.query(
        "update public.accounts set balance=1000, iban=case when user_id=$1 then 'BE EMMA' else 'BE TOM' end where type='checking'",
        [emma],
      );
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [emma]);
      await db.exec("set role authenticated");
      assert.equal((await db.query("select * from public.stocks")).rows.length, 10);
      await assert.rejects(
        db.query("update public.stocks set price=1 where symbol='AAPL'"),
        /permission denied/,
      );
      await db.exec("reset role; set role anon");
      await assert.rejects(db.query("select * from public.stocks"), /permission denied/);
      await db.exec("reset role");
      const balance = async (uid = emma) =>
        Number(
          (await db.query("select balance from public.accounts where user_id=$1 and type='checking'", [uid]))
            .rows[0].balance,
        );
      const action = async (payload, owner = emma, type = "buy_stock", expired = false) =>
        (
          await db.query(
            "insert into public.pending_actions(user_id,type,payload,summary,expires_at) values($1,$2,$3,'test',now()+$4::interval) returning id",
            [owner, type, JSON.stringify(payload), expired ? "-1 minute" : "10 minutes"],
          )
        ).rows[0].id;
      const confirm = async (id) => {
        await db.exec("set role authenticated");
        try {
          return await db.query("select public.confirm_action($1) as result", [id]);
        } finally {
          await db.exec("reset role");
        }
      };
      const id = await action({ symbol: "AAPL", amount: 200, price: 0.01, quantity: 99999 });
      assert.equal(await balance(), 1000);
      await db.exec("update public.stocks set price=100 where symbol='AAPL'");
      await confirm(id);
      assert.equal(await balance(), 800);
      let holding = (await db.query("select * from public.holdings where user_id=$1", [emma])).rows[0];
      assert.equal(Number(holding.quantity), 2);
      assert.equal(Number(holding.avg_price), 100);
      await assert.rejects(confirm(id), /already confirmed/);
      assert.equal(await balance(), 800);
      await db.exec("update public.stocks set price=200 where symbol='AAPL'");
      await confirm(await action({ symbol: "AAPL", amount: 200 }));
      holding = (await db.query("select * from public.holdings where user_id=$1", [emma])).rows[0];
      assert.equal(Number(holding.quantity), 3);
      assert.equal(Number(holding.avg_price), 133.33);
      assert.equal(await balance(), 600);
      for (const amount of [0, -1, 0.001, 1000.01, "NaN", "Infinity"]) {
        await assert.rejects(confirm(await action({ symbol: "AAPL", amount })));
        assert.equal(await balance(), 600);
      }
      await assert.rejects(confirm(await action({ symbol: "AAPL", amount: 700 })), /insufficient funds/);
      await assert.rejects(confirm(await action({ symbol: "FAKE", amount: 10 })), /asset not available/);
      await assert.rejects(confirm(await action({ symbol: "AAPL", amount: 10 }, tom)), /action not found/);
      const expired = await confirm(await action({ symbol: "AAPL", amount: 10 }, emma, "buy_stock", true));
      assert.equal(expired.rows[0].result.ok, false);
      assert.equal(await balance(), 600);
      const contact = (
        await db.query(
          "insert into public.contacts(user_id,name,iban) values($1,'Tom','be tom') returning id",
          [emma],
        )
      ).rows[0].id;
      await confirm(await action({ contact_id: contact, amount: 30 }, emma, "transfer"));
      assert.equal(await balance(), 570);
      assert.equal(await balance(tom), 1030);
      await confirm(await action({ amount: 100 }, emma, "move_to_savings"));
      assert.equal(await balance(), 470);
      assert.equal(
        Number(
          (await db.query("select balance from public.accounts where user_id=$1 and type='savings'", [emma]))
            .rows[0].balance,
        ),
        100,
      );
      assert.match(
        (await db.query("select description from public.transactions where category='investment' limit 1"))
          .rows[0].description,
        /Bought.*AAPL/,
      );
      assert.equal(
        (await db.query("select * from public.agent_logs where event='action_confirmed'")).rows.length,
        4,
      );
    } finally {
      await db.close();
    }
  },
);
