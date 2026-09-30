import { z } from "zod";
import { defineTool } from "./types";

export const getStockPrice = defineTool({
  name: "get_stock_price",
  description:
    "Look up a symbol or company/fund name in the mock market catalogue. These are synthetic EUR demo prices, never live quotes.",
  schema: z.object({ query: z.string().trim().min(1).max(100) }),
  async run({ query }, { supabase }) {
    const { data, error } = await supabase
      .from("stocks")
      .select("symbol, name, price, currency, sector, risk_level")
      .order("symbol");
    if (error) throw error;
    const normalized = query.toLowerCase();
    const exact = (data ?? []).filter((stock) => stock.symbol.toLowerCase() === normalized);
    const matches = exact.length
      ? exact
      : (data ?? []).filter((stock) => stock.name.toLowerCase().includes(normalized));
    return {
      data: {
        source: "mock",
        live: false,
        matches,
        ...(matches.length ? {} : { error: "No matching asset in the demo catalogue." }),
      },
    };
  },
});
