/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS test harness loads isolated TypeScript modules. */
// Run: node --test src/lib/agent/agent.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
// Compile the isolated, pure tool modules using the project's installed TypeScript.
require.extensions[".ts"] = (module, filename) => {
  const result = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  module._compile(result.outputText, filename);
};
const { budgetWindows, summarizeTransactions } = require("./tools/get-budget-summary.ts");
const { investmentProjection, createInvestmentPlan } = require("./tools/create-investment-plan.ts");
const { detectLifeMoments, suggestionsFor } = require("./insights.ts");
const { buyStock } = require("./tools/buy-stock.ts");
const { getStockPrice } = require("./tools/get-stock-price.ts");
const { loadInsights } = require("./tools/detect-life-moments.ts");

test("proactive runner rejects a model's attempted purchase even when not advertised", async () => {
  const runPath = require("node:path").join(__dirname, "run.ts");
  const localRequire = require("node:module").createRequire(runPath);
  const code = ts.transpileModule(fs.readFileSync(runPath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let calls = 0;
  const client = {
    models: {
      async generateContent(request) {
        assert.ok(
          request.config.tools[0].functionDeclarations.every(
            (tool) => !["buy_stock", "transfer_money", "move_to_savings"].includes(tool.name),
          ),
        );
        calls++;
        if (calls === 1)
          return { functionCalls: [{ name: "buy_stock", args: { symbol: "AAPL", amount_eur: 200 } }] };
        assert.match(JSON.stringify(request.contents), /Actions are not permitted/);
        return { text: "Hello Emma" };
      },
    },
  };
  const exports = {};
  new Function("require", "exports", code)((name) => {
    if (name === "server-only") return {};
    if (name === "@/lib/llm/gemini") return { gemini: () => ({ client, model: "mock" }) };
    return localRequire(name);
  }, exports);
  const supabase = {
    from(table) {
      assert.ok(["profiles", "agent_logs"].includes(table), "greeting must not write pending actions");
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        async single() {
          return { data: { full_name: "Emma", risk_level: "medium", goals: [] } };
        },
        async insert() {
          return { error: null };
        },
      };
    },
  };
  const result = await exports.runAgent(
    [{ role: "user", content: "Greet me" }],
    { supabase, userId: "emma" },
    { readOnly: true },
  );
  assert.deepEqual(result.pendingActions, []);
  assert.equal(result.reply, "Hello Emma");
});

test("budget boundaries handle year rollover, leap years and previous elapsed month", () => {
  const january = budgetWindows("last_month", new Date("2026-01-20T12:00:00Z"));
  assert.equal(january.start.toISOString(), "2025-12-01T00:00:00.000Z");
  assert.equal(january.previousStart.toISOString(), "2025-11-01T00:00:00.000Z");
  const march = budgetWindows("this_month", new Date("2024-03-31T12:00:00Z"));
  assert.equal(march.previousEnd.toISOString(), "2024-03-01T00:00:00.000Z");
  const rolling = budgetWindows("last_30_days", new Date("2026-09-30T12:00:00Z"));
  assert.equal(rolling.end - rolling.start, 30 * 86400000);
  assert.equal(rolling.start - rolling.previousStart, 30 * 86400000);
});
test("budget groups expenses, keeps cents exact and excludes savings and purchases", () => {
  const summary = summarizeTransactions([
    { amount: 3150, category: "income", merchant: "Employer" },
    { amount: -84.3, category: "food", merchant: "Shop" },
    { amount: -46.2, category: "food", merchant: "Restaurant" },
    { amount: -950, category: "housing", merchant: "Rent" },
    { amount: -642, category: "travel", merchant: "Airline" },
    { amount: -200, category: "savings", merchant: null },
    { amount: 200, category: "savings", merchant: null },
    { amount: -200, category: "investment", merchant: "Apple" },
  ]);
  assert.equal(summary.total_income_eur, 3150);
  assert.equal(summary.total_spent_eur, 1722.5);
  assert.equal(summary.spending_per_category.food, 130.5);
  assert.deepEqual(
    summary.top_merchants.map((x) => x.merchant),
    ["Rent", "Airline", "Shop"],
  );
  assert.equal(summarizeTransactions([]).total_spent_eur, 0);
});
test("investment projection preserves cents and zero stock allocation for low risk", () => {
  const plan = investmentProjection("medium", 2000, 0, 1);
  assert.deepEqual(
    plan.allocation.map((x) => x.amount_eur),
    [400, 600, 800, 200],
  );
  assert.equal(plan.projected_value_eur, 2090);
  assert.equal(investmentProjection("medium", 2000, 100, 1).total_contributions_eur, 3200);
  for (let cents = 1; cents <= 100; cents++) {
    const tiny = investmentProjection("low", cents / 100, 0, 1);
    assert.equal(Math.round(tiny.allocation.reduce((sum, x) => sum + x.amount_eur, 0) * 100), cents);
    assert.equal(tiny.allocation[3].amount_eur, 0);
    assert.ok(tiny.allocation.every((x) => x.amount_eur >= 0));
  }
});
test("investment tool takes risk from the authenticated profile, not model arguments", async () => {
  const supabase = {
    from(table) {
      assert.equal(table, "profiles");
      return {
        select() {
          return this;
        },
        eq(field, value) {
          assert.equal(field, "id");
          assert.equal(value, "emma");
          return this;
        },
        async single() {
          return { data: { risk_level: "low", goals: [{ title: "House" }] } };
        },
      };
    },
  };
  const args = createInvestmentPlan.schema.parse({
    goal: "House",
    amount_eur: 2000,
    horizon_years: 3,
    risk_level: "high",
  });
  const { data } = await createInvestmentPlan.run(args, { userId: "emma", supabase });
  assert.equal(data.risk_level, "low");
  assert.equal(data.allocation[3].percent, 0);
  assert.ok(data.short_horizon_warning);
});
const now = new Date("2026-09-30T12:00:00Z");
const base = {
  calendarOptIn: true,
  checkingBalance: 3240.5,
  savingsBalance: 12800,
  events: [
    { title: "Flight to Tokyo", kind: "travel", starts_at: "2026-10-08T12:00:00Z" },
    { title: "Wedding", kind: "celebration", starts_at: "2026-10-04T12:00:00Z" },
  ],
  transactions: [
    { amount: 3150, category: "income", description: "Salary", booked_at: "2026-09-25T12:00:00Z" },
  ],
};
test("Emma gets Tokyo first; calendar opt-out removes all calendar signals", () => {
  const moments = detectLifeMoments(base, now);
  assert.equal(moments[0].kind, "travel");
  assert.equal(moments[0].days_away, 8);
  assert.deepEqual(
    detectLifeMoments({ ...base, calendarOptIn: false }, now).map((x) => x.kind),
    ["salary_received"],
  );
  assert.match(suggestionsFor(moments, 12800)[0].suggestions[0], /mock/);
});
test("low balance beats travel; past and distant events and future income are ignored", () => {
  assert.equal(detectLifeMoments({ ...base, checkingBalance: 150 }, now)[0].kind, "low_balance");
  const input = {
    ...base,
    events: [
      { title: "Past", kind: "travel", starts_at: "2026-09-29T12:00:00Z" },
      { title: "Distant", kind: "travel", starts_at: "2026-10-15T12:00:00Z" },
    ],
    transactions: [
      { amount: 5000, category: "income", booked_at: "2026-10-01T12:00:00Z", description: "Future" },
    ],
  };
  assert.deepEqual(detectLifeMoments(input, now), []);
  const bill = {
    ...base,
    checkingBalance: 500,
    events: [{ title: "Rent due", kind: "bill", starts_at: "2026-10-01T12:00:00Z" }],
    transactions: [
      { amount: -950, category: "housing", booked_at: "2026-09-01T12:00:00Z", description: "Rent" },
    ],
  };
  assert.equal(detectLifeMoments(bill, now)[0].kind, "low_balance");
  assert.deepEqual(detectLifeMoments({ ...bill, calendarOptIn: false }, now), []);
});
test("stock purchase rejects unsafe amounts and creates only a user-scoped pending action", async () => {
  for (const amount of [-1, 0, 0.001, 1000.01, Infinity, NaN])
    assert.equal(buyStock.schema.safeParse({ symbol: "AAPL", amount_eur: amount }).success, false);
  let inserted;
  const supabase = {
    from(table) {
      assert.ok(["stocks", "profiles", "pending_actions"].includes(table));
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        insert(row) {
          inserted = row;
          return this;
        },
        async maybeSingle() {
          return { data: { symbol: "AAPL", name: "Apple", currency: "EUR", risk_level: "high" } };
        },
        async single() {
          return {
            data:
              table === "profiles"
                ? { risk_level: "medium" }
                : { id: "action", type: inserted.type, summary: inserted.summary },
          };
        },
      };
    },
  };
  const result = await buyStock.run({ symbol: "AAPL", amount_eur: 200 }, { supabase, userId: "emma" });
  assert.equal(inserted.user_id, "emma");
  assert.deepEqual(inserted.payload, { symbol: "AAPL", amount: 200 });
  assert.match(result.pendingAction.summary, /Higher risk than your profile/);
  assert.equal(result.data.status, "awaiting_user_confirmation");
});
test("market lookup resolves company names, unknown queries and exact symbols", async () => {
  const supabase = {
    from() {
      return {
        select() {
          return this;
        },
        async order() {
          return { data: [{ symbol: "AAPL", name: "Apple", price: 190, risk_level: "high" }] };
        },
      };
    },
  };
  assert.equal((await getStockPrice.run({ query: "Apple" }, { supabase })).data.matches[0].symbol, "AAPL");
  assert.equal((await getStockPrice.run({ query: "aapl" }, { supabase })).data.matches.length, 1);
  assert.equal((await getStockPrice.run({ query: "%" }, { supabase })).data.matches.length, 0);
});
test("insight loader never queries calendar when consent is absent", async () => {
  const supabase = {
    from(table) {
      assert.notEqual(table, "calendar_events");
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        gte() {
          return this;
        },
        lte() {
          return this;
        },
        order() {
          return this;
        },
        async range() {
          return { data: [] };
        },
        async single() {
          return { data: { calendar_opt_in: false } };
        },
        then(resolve) {
          resolve({
            data: [
              { type: "checking", balance: 300 },
              { type: "savings", balance: 100 },
            ],
          });
        },
      };
    },
  };
  assert.deepEqual((await loadInsights({ supabase, userId: "emma" })).moments, []);
});
