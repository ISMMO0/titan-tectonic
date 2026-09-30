import { z } from "zod";
import { defineTool } from "./types";

const riskRank: Record<string, number> = { low: 0, medium: 1, high: 2 };
export const buyStock = defineTool({
  name: "buy_stock",
  description:
    "Propose a mock stock purchase from the current account, up to EUR 1,000. Creates a pending confirmation card only. Use get_stock_price to resolve names to symbols first.",
  schema: z.object({
    symbol: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9.-]{1,12}$/),
    amount_eur: z.number().min(0.01).max(1000).multipleOf(0.01),
  }),
  async run({ symbol, amount_eur }, { supabase, userId }) {
    const { data: stock, error } = await supabase
      .from("stocks")
      .select("symbol, name, currency, risk_level")
      .eq("symbol", symbol)
      .maybeSingle();
    if (error) throw error;
    if (!stock) return { data: { error: "Asset not found in the mock market." } };
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("risk_level")
      .eq("id", userId)
      .single();
    if (profileError) throw profileError;
    if (!(profile?.risk_level in riskRank) || !(stock.risk_level in riskRank) || stock.currency !== "EUR") {
      return { data: { error: "A valid risk profile and EUR asset are required." } };
    }
    const warning =
      riskRank[stock.risk_level] > riskRank[profile.risk_level] ? " ⚠️ Higher risk than your profile" : "";
    const summary = `Buy €${amount_eur.toFixed(2)} of ${stock.name} (${symbol}) from your current account — mock investment.${warning} Capital at risk; this is not personal financial advice.`;
    const { data: action, error: insertError } = await supabase
      .from("pending_actions")
      .insert({ user_id: userId, type: "buy_stock", payload: { symbol, amount: amount_eur }, summary })
      .select("id, type, summary")
      .single();
    if (insertError) throw insertError;
    return {
      data: { status: "awaiting_user_confirmation", summary, price_source: "database_at_confirmation" },
      pendingAction: action,
    };
  },
});
