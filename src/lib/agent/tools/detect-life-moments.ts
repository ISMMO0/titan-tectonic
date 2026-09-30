import { z } from "zod";
import { detectLifeMoments, suggestionsFor, type InsightInput } from "../insights";
import { defineTool, type ToolContext } from "./types";

export async function loadInsights({ supabase, userId }: ToolContext) {
  const now = new Date();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("calendar_opt_in")
    .eq("id", userId)
    .single();
  if (profileError) throw profileError;
  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("type, balance")
    .eq("user_id", userId);
  if (accountsError) throw accountsError;
  const transactions: InsightInput["transactions"] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase
      .from("transactions")
      .select("amount, category, booked_at, description")
      .eq("user_id", userId)
      .gte("booked_at", new Date(now.getTime() - 60 * 86400000).toISOString())
      .lte("booked_at", now.toISOString())
      .order("booked_at")
      .order("id")
      .range(offset, offset + 499);
    if (error) throw error;
    transactions.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  const events: InsightInput["events"] = [];
  if (profile?.calendar_opt_in === true) {
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase
        .from("calendar_events")
        .select("title, kind, starts_at")
        .eq("user_id", userId)
        .gte("starts_at", now.toISOString())
        .lte("starts_at", new Date(now.getTime() + 14 * 86400000).toISOString())
        .order("starts_at")
        .order("id")
        .range(offset, offset + 499);
      if (error) throw error;
      events.push(...(data ?? []));
      if (!data || data.length < 500) break;
    }
  }
  const checking = accounts?.find((account) => account.type === "checking");
  if (!checking) throw new Error("Current account unavailable");
  const input: InsightInput = {
    calendarOptIn: profile?.calendar_opt_in === true,
    checkingBalance: Number(checking.balance),
    savingsBalance: Number(accounts?.find((account) => account.type === "savings")?.balance ?? 0),
    events,
    transactions,
  };
  return { moments: detectLifeMoments(input, now), savingsBalance: input.savingsBalance };
}

export const detectMoments = defineTool({
  name: "detect_life_moments",
  description:
    "Read account and transaction signals plus opted-in calendar events to identify travel, celebrations, low balance and recent income. Read-only.",
  schema: z.object({}),
  async run(_args, ctx) {
    const result = await loadInsights(ctx);
    return { data: { moments: result.moments } };
  },
});
export const getSuggestions = defineTool({
  name: "get_suggestions",
  description:
    "Get prioritized suggestions grounded in the customer's current life moments. Quotes and offers are mock, not live; nothing is purchased or moved.",
  schema: z.object({}),
  async run(_args, ctx) {
    const result = await loadInsights(ctx);
    return { data: { suggestions: suggestionsFor(result.moments, result.savingsBalance) } };
  },
});
