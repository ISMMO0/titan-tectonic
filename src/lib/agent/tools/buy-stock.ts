import { z } from "zod";
import { defineTool } from "./types";

// Max per trade without extra verification. Also enforced in SQL (confirm_action).
const MAX_TRADE = 1000;
const RISK_RANK = { low: 1, medium: 2, high: 3 } as const;

export const buyStock = defineTool({
  name: "buy_stock",
  description:
    "Prepare buying an asset (stock/ETF) for an amount in EUR from the current account. " +
    "This does NOT buy anything: it creates a request the user must confirm in the app. " +
    "Look up the symbol with get_stock_price first if unsure.",
  schema: z.object({
    symbol: z.string().min(1).max(10).describe("Asset symbol, e.g. AAPL, IWDA"),
    amount_eur: z.number().positive().max(MAX_TRADE).describe("Amount to invest in EUR"),
  }),
  async run({ symbol, amount_eur }, { supabase, userId }) {
    const { data: stock } = await supabase
      .from("stocks")
      .select("symbol, name, price, risk_level")
      .eq("symbol", symbol.toUpperCase())
      .maybeSingle();
    if (!stock) return { data: { error: `Unknown symbol ${symbol}. Use get_stock_price to search.` } };

    const { data: profile } = await supabase.from("profiles").select("risk_level").eq("id", userId).single();
    const profileRisk = (profile?.risk_level ?? "medium") as keyof typeof RISK_RANK;
    const riskier = RISK_RANK[stock.risk_level as keyof typeof RISK_RANK] > RISK_RANK[profileRisk];

    const amount = Math.round(amount_eur * 100) / 100;
    const quantity = amount / Number(stock.price);
    const summary =
      `Buy €${amount.toFixed(2)} of ${stock.name} (${stock.symbol}) ≈ ${quantity.toFixed(4)} × €${Number(stock.price).toFixed(2)}` +
      (riskier ? ` — ⚠️ higher risk than your ${profileRisk}-risk profile` : "");

    // Price shown here is indicative; confirm_action re-reads it from the database.
    const { data: action, error } = await supabase
      .from("pending_actions")
      .insert({ user_id: userId, type: "buy_stock", payload: { symbol: stock.symbol, amount }, summary })
      .select("id, type, summary")
      .single();
    if (error) throw error;

    return {
      data: {
        status: "awaiting_user_confirmation",
        summary,
        risk_warning: riskier
          ? `${stock.symbol} is ${stock.risk_level} risk; the user's profile is ${profileRisk}. Mention this.`
          : null,
      },
      pendingAction: action,
    };
  },
});
