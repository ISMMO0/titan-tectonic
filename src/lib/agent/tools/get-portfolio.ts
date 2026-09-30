import { z } from "zod";
import { defineTool } from "./types";

const round = (n: number) => Math.round(n * 100) / 100;

export const getPortfolio = defineTool({
  name: "get_portfolio",
  description: "Show the user's investments: each holding with quantity, current value and gain/loss.",
  schema: z.object({}),
  async run(_args, { supabase }) {
    const { data: holdings, error } = await supabase
      .from("holdings")
      .select("symbol, quantity, avg_price")
      .order("symbol");
    if (error) throw error;
    if (!holdings?.length) return { data: { holdings: [], total_value: 0 } };

    const { data: prices } = await supabase
      .from("stocks")
      .select("symbol, name, price")
      .in(
        "symbol",
        holdings.map((h) => h.symbol),
      );
    const bySymbol = new Map(prices?.map((p) => [p.symbol, p]) ?? []);

    const rows = holdings.map((h) => {
      const qty = Number(h.quantity);
      const cost = qty * Number(h.avg_price);
      const price = Number(bySymbol.get(h.symbol)?.price ?? h.avg_price);
      const value = qty * price;
      return {
        symbol: h.symbol,
        name: bySymbol.get(h.symbol)?.name ?? h.symbol,
        quantity: qty,
        value: round(value),
        gain_loss: round(value - cost),
      };
    });

    return { data: { holdings: rows, total_value: round(rows.reduce((s, r) => s + r.value, 0)) } };
  },
});
