# Task A integration

Work stays on `stefano-branch`, per Stefano's instruction.

## Run on a teammate's machine

1. Fetch the repository and check out `stefano-branch`. Pull its latest changes.
   Commit or stash unrelated local work before switching branches.
2. Use Node 22 and run `npm ci`.
3. Copy `.env.example` to `.env.local` only if no local configuration exists.
   Add the team's Supabase URL/publishable key and your own working
   `GEMINI_API_KEY`; use `GEMINI_MODEL=gemini-2.5-flash`.
   No API key or demo password is included in this branch.
4. Have the database owner apply the migration in the order described below.
5. Run `npm run dev`, open `http://localhost:3000`, and sign in as the existing
   Emma demo user using the password shared privately by the team.

## Browser acceptance script

1. Open a fresh session: expect a proactive greeting about Emma's Tokyo trip,
   unless a higher-priority low-balance condition applies.
2. Ask “Where does my money go this month?” Check the category totals.
3. Ask “I have a EUR 2,000 bonus. Make a plan for my house goal over three years.”
   Expect Emma's stored medium-risk allocation: 400 savings, 600 bonds ETF,
   800 world ETF, 200 stocks. This is a proposal, not a purchase.
4. Ask “How much is Apple?” Expect a clearly labeled synthetic EUR quote.
5. Ask “Buy EUR 200 of Apple.” Expect a confirmation card and the higher-risk
   warning for Emma. No balance changes before confirmation.
6. Confirm once: checking decreases by EUR 200, holdings gain AAPL and a purchase
   transaction appears. Inspect holdings in Supabase; there is no holdings panel.
7. Check the existing EUR 30 transfer to Tom on demo data: both accounts change
   when the contact IBAN matches Tom's Titan checking account.
8. Test Dutch/French requests and verify investment risk/disclaimer wording.

These confirmation steps mutate shared demo balances. Record starting balances
and coordinate the demo with teammates; do not rerun the destructive seed script
as a cleanup step. Calendar dates come from the existing seed, so the number of
days until Tokyo changes over time.

## Validation status at handoff

- Ten logic/tool tests and one isolated PostgreSQL integration test passed.
- Lint, TypeScript checks, changed-file formatting and production build passed.
- Read-only checks against shared Supabase returned Emma's budget, stored-risk
  investment proposal and calendar/income moments successfully.
- Full LLM-driven browser acceptance is still unverified: the supplied Google
  project returned zero Gemini API quota, and its key was blocked for Vertex AI.
- At the last shared-database check, the `stocks` table was not yet present.
  Applying the migration and testing with a working Gemini key are required.

## Database

Apply `0003_market.sql` after the team's `0002_internal_transfers.sql`. The new
confirmation function preserves the complete internal-transfer implementation
from Ismail's branch (commit `1fa0d2e`) and adds stock purchases. It also includes
the same IBAN normalizer, so isolated tests can run after `0001_init.sql`.
Never apply the old `0002` after `0003`, because it would replace stock support.

No migration is applied to the shared Supabase database by this change.
Mock stock prices are deliberately denominated in EUR, including US stocks.
Only authenticated users can read them; client writes are revoked.
Stock purchases debit checking, not the investment account. Amounts are capped
at EUR 1,000 and checked again in SQL; submitted prices/quantities are ignored.

## Task B coordination

The only shared component change is `ChatWindow.tsx`: one mount request to
`POST /api/insights`, replacing the initial greeting only before conversation
starts. Preserve this effect when merging voice changes. It leaves the normal
greeting in place if the endpoint fails and keeps the greeting in chat context.
Expired action results (`ok: false`) now show failure instead of “Done”.

The insights route uses the existing session, same-origin and rate-limit guard.
The greeting agent has only read tools; attempted mutation tools are rejected
even if a model calls one that was not advertised. Voice and deployment files
are untouched. No automatic voice playback is implemented by Task A.

## Assumptions

- Budget periods use UTC. This month compares elapsed time with the same elapsed
  time in the preceding month, capped at that month's end. Savings and investment
  movements are excluded from income/spending; external transfers remain cash flows.
- Investment returns are illustrative fixed rates: savings 2%, bonds 3%, world
  ETF 6%, stocks 8%. Monthly contributions occur at month end. Taxes, fees and
  inflation are excluded. Risk comes from the authenticated profile.
- Bill calendar records have no amount field. Rent can be estimated from the
  latest housing debit and is explicitly labeled an estimate. Unknown bill
  amounts are not invented. Calendar signals require opt-in.
- Low-balance suggestions can recommend topping up from savings, but the existing
  tool only moves checking to savings; no reverse transfer is implemented here.
- Holdings are updated in the database; a holdings UI is outside Task A's scope.

## Verification

Run `node --test src/lib/agent/agent.test.cjs` for the logic/tool suite.
For the optional PostgreSQL suite, install `@electric-sql/pglite` in a separate
test directory, set `PGLITE_MODULE` to its absolute package directory, and run
`node --test src/lib/agent/database.test.cjs`. It uses a disposable database with
an auth fixture, not shared Supabase. Only pgcrypto extension loading is omitted;
the test database already provides `gen_random_uuid()`.

Run the project's lint, typecheck and build checks before merging.
Full browser demo requires a configured Gemini key and the applied migration.
Confirm stock holdings through Supabase until the UI owner adds a holdings view.
