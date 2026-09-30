import { z } from "zod";
import { defineTool } from "./types";

export type BudgetPeriod = "this_month" | "last_30_days" | "last_month";
type Transaction = { amount: number | string; category: string; merchant: string | null };
const money = (value: number) => Math.round(value * 100) / 100;

/** UTC boundaries, with a matching elapsed-month comparison for this_month. */
export function budgetWindows(period: BudgetPeriod, now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const monthStart = new Date(Date.UTC(year, month));
  if (period === "last_month") {
    return {
      start: new Date(Date.UTC(year, month - 1)),
      end: monthStart,
      previousStart: new Date(Date.UTC(year, month - 2)),
      previousEnd: new Date(Date.UTC(year, month - 1)),
    };
  }
  if (period === "last_30_days") {
    const length = 30 * 86400000;
    const start = new Date(now.getTime() - length);
    return { start, end: now, previousStart: new Date(start.getTime() - length), previousEnd: start };
  }
  const previousStart = new Date(Date.UTC(year, month - 1));
  const previousEnd = new Date(
    Math.min(monthStart.getTime(), previousStart.getTime() + now.getTime() - monthStart.getTime()),
  );
  return { start: monthStart, end: now, previousStart, previousEnd };
}

export function summarizeTransactions(rows: Transaction[]) {
  let income = 0;
  let spent = 0;
  const categories = new Map<string, number>();
  const merchants = new Map<string, number>();
  for (const row of rows) {
    // Internal savings/investment movements are not income or consumption.
    if (["savings", "investment", "investments", "internal_transfer"].includes(row.category)) continue;
    const cents = Math.round(Number(row.amount) * 100);
    if (!Number.isSafeInteger(cents)) throw new Error("Invalid transaction amount");
    if (cents > 0) income += cents;
    else if (cents < 0) {
      spent -= cents;
      categories.set(row.category, (categories.get(row.category) ?? 0) - cents);
      if (row.merchant) merchants.set(row.merchant, (merchants.get(row.merchant) ?? 0) - cents);
    }
  }
  return {
    total_income_eur: income / 100,
    total_spent_eur: spent / 100,
    spending_per_category: Object.fromEntries([...categories].map(([key, cents]) => [key, cents / 100])),
    top_merchants: [...merchants]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([merchant, cents]) => ({ merchant, spent_eur: cents / 100 })),
  };
}

export const getBudgetSummary = defineTool({
  name: "get_budget_summary",
  description:
    "Summarize income, spending by category, top merchants and change versus the previous period. Uses UTC; this_month compares elapsed time with the previous month. Excludes internal savings and investment movements.",
  schema: z.object({ period: z.enum(["this_month", "last_30_days", "last_month"]).default("this_month") }),
  async run({ period }, { supabase, userId }) {
    const windows = budgetWindows(period);
    async function read(start: Date, end: Date) {
      const rows: Transaction[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase
          .from("transactions")
          .select("amount, category, merchant")
          .eq("user_id", userId)
          .gte("booked_at", start.toISOString())
          .lt("booked_at", end.toISOString())
          .order("booked_at")
          .order("id")
          .range(offset, offset + 499);
        if (error) throw error;
        rows.push(...(data ?? []));
        if (!data || data.length < 500) break;
      }
      return summarizeTransactions(rows);
    }
    const current = await read(windows.start, windows.end);
    const previous = await read(windows.previousStart, windows.previousEnd);
    const difference = money(current.total_spent_eur - previous.total_spent_eur);
    return {
      data: {
        period,
        currency: "EUR",
        timezone: "UTC",
        windows,
        ...current,
        previous,
        difference: {
          income_eur: money(current.total_income_eur - previous.total_income_eur),
          spent_eur: difference,
          spent_percent:
            previous.total_spent_eur === 0 ? null : money((difference / previous.total_spent_eur) * 100),
        },
      },
    };
  },
});
