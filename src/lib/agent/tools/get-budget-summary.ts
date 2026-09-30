import { z } from "zod";
import { defineTool } from "./types";

function periodRange(period: "this_month" | "last_month" | "last_30_days", now = new Date()) {
  if (period === "last_30_days") return { from: new Date(now.getTime() - 30 * 86_400_000), to: now };
  const start = new Date(now.getFullYear(), now.getMonth() + (period === "last_month" ? -1 : 0), 1);
  const end = period === "last_month" ? new Date(now.getFullYear(), now.getMonth(), 1) : now;
  return { from: start, to: end };
}

const round = (n: number) => Math.round(n * 100) / 100;

export const getBudgetSummary = defineTool({
  name: "get_budget_summary",
  description:
    "Summarize income and spending for a period: total in/out, spending per category, top merchants. " +
    "Use it for 'where does my money go?' or 'how much did I spend on X?'.",
  schema: z.object({
    period: z.enum(["this_month", "last_month", "last_30_days"]).default("last_30_days"),
  }),
  async run({ period }, { supabase }) {
    const { from, to } = periodRange(period);
    const { data, error } = await supabase
      .from("transactions")
      .select("amount, category, merchant")
      .gte("booked_at", from.toISOString())
      .lt("booked_at", to.toISOString());
    if (error) throw error;

    let income = 0;
    let spent = 0;
    const byCategory = new Map<string, number>();
    const byMerchant = new Map<string, number>();

    for (const t of data ?? []) {
      const amount = Number(t.amount);
      // Moving money between own accounts / investing isn't "spending".
      if (["savings", "investment"].includes(t.category)) continue;
      if (amount > 0) {
        income += amount;
        continue;
      }
      spent += -amount;
      byCategory.set(t.category, (byCategory.get(t.category) ?? 0) - amount);
      if (t.merchant) byMerchant.set(t.merchant, (byMerchant.get(t.merchant) ?? 0) - amount);
    }

    const sorted = (m: Map<string, number>) =>
      [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, total]) => ({ name, total: round(total) }));

    return {
      data: {
        period,
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
        income: round(income),
        spent: round(spent),
        net: round(income - spent),
        by_category: sorted(byCategory).map((c) => ({
          ...c,
          share: spent ? `${Math.round((c.total / spent) * 100)}%` : "0%",
        })),
        top_merchants: sorted(byMerchant).slice(0, 3),
      },
    };
  },
});
