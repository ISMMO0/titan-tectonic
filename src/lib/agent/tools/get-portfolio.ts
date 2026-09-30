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

    const { data: prices, error: priceError } = await supabase
      .from("stocks")
      .select("symbol, name, price")
      .in(
        "symbol",
        holdings.map((h) => h.symbol),
      );
    if (priceError) throw priceError;
    const bySymbol = new Map(prices?.map((p) => [p.symbol, p]) ?? []);

    const rows = holdings.map((h) => {
      const qty = Number(h.quantity);
      const cost = qty * Number(h.avg_price);
      const price = bySymbol.has(h.symbol) ? Number(bySymbol.get(h.symbol)?.price) : null;
      const value = price === null ? null : qty * price;
      return {
        symbol: h.symbol,
        name: bySymbol.get(h.symbol)?.name ?? h.symbol,
        quantity: qty,
        value: value === null ? null : round(value),
        gain_loss: value === null ? null : round(value - cost),
      };
    });

    return {
      data: {
        source: "mock",
        currency: "EUR",
        holdings: rows,
        total_value: rows.some((r) => r.value === null)
          ? null
          : round(rows.reduce((s, r) => s + (r.value ?? 0), 0)),
      },
    };
  },
});
