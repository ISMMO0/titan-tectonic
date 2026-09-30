import { z } from "zod";
import { defineTool } from "./types";

export const getStockPrice = defineTool({
  name: "get_stock_price",
  description:
    "Look up assets available to invest in (stocks, ETFs, bond ETFs): price in EUR and risk level. " +
    "Search by symbol or name (e.g. 'Apple', 'AAPL', 'world ETF'). Leave query empty to list everything.",
  schema: z.object({
    query: z.string().max(40).optional().describe("Symbol or name; empty = list all"),
  }),
  async run({ query }, { supabase }) {
    let q = supabase
      .from("stocks")
      .select("symbol, name, price, currency, sector, asset_type, risk_level")
      .order("symbol");
    // Only letters/digits/spaces reach the filter — no PostgREST filter injection.
    const clean = query?.replace(/[^\p{L}\p{N} ]/gu, "").trim();
    if (clean) q = q.or(`symbol.ilike.%${clean}%,name.ilike.%${clean}%,sector.ilike.%${clean}%`);
    const { data, error } = await q.limit(10);
    if (error) throw error;
    if (!data?.length) return { data: { error: `No asset matches "${query}".` } };
    return { data: { assets: data, note: "Demo prices" } };
  },
});
