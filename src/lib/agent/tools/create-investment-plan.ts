import { z } from "zod";
import { defineTool } from "./types";

// Model portfolios per risk profile. "SAVINGS" = KBC savings account; others are symbols in public.stocks.
const PORTFOLIOS = {
  low: { SAVINGS: 0.6, AGGH: 0.3, IWDA: 0.1 },
  medium: { SAVINGS: 0.2, AGGH: 0.3, IWDA: 0.4, KBC: 0.1 },
  high: { SAVINGS: 0.1, AGGH: 0.1, IWDA: 0.5, AAPL: 0.1, NVDA: 0.1, MSFT: 0.1 },
} as const;

// Assumed yearly returns for the projection (illustrative, not a promise).
const EXPECTED_RETURN: Record<string, number> = { savings: 0.02, bond_etf: 0.03, etf: 0.07, stock: 0.09 };

const round = (n: number) => Math.round(n * 100) / 100;

function futureValue(lump: number, monthly: number, rate: number, years: number) {
  const growth = (1 + rate) ** years;
  const contributions = rate === 0 ? monthly * 12 * years : monthly * 12 * ((growth - 1) / rate);
  return lump * growth + contributions;
}

export const createInvestmentPlan = defineTool({
  name: "create_investment_plan",
  description:
    "Build a diversified investment plan for an amount (and optional monthly contribution), based on the " +
    "user's risk profile (read from their profile, not chosen by you). Returns the split per asset and a projection. " +
    "This only PROPOSES a plan; to invest, use buy_stock / move_to_savings after the user agrees.",
  schema: z.object({
    amount_eur: z.number().positive().max(1_000_000).describe("Amount to invest now"),
    monthly_eur: z.number().min(0).max(100_000).default(0).describe("Optional monthly contribution"),
    horizon_years: z.number().int().min(1).max(40).describe("How many years until the money is needed"),
    goal: z.string().max(80).optional().describe("What it's for, e.g. 'buy a house'"),
  }),
  async run({ amount_eur, monthly_eur, horizon_years, goal }, { supabase, userId }) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("risk_level, goals")
      .eq("id", userId)
      .single();
    const risk = (profile?.risk_level ?? "medium") as keyof typeof PORTFOLIOS;
    // Short horizons are never invested aggressively.
    const effectiveRisk = horizon_years < 3 ? "low" : risk;
    const weights = PORTFOLIOS[effectiveRisk];

    const symbols = Object.keys(weights).filter((s) => s !== "SAVINGS");
    const { data: assets } = await supabase
      .from("stocks")
      .select("symbol, name, price, asset_type, risk_level")
      .in("symbol", symbols);
    const bySymbol = new Map(assets?.map((a) => [a.symbol, a]) ?? []);

    const lines = Object.entries(weights).map(([symbol, weight]) => {
      const asset = bySymbol.get(symbol);
      const type = symbol === "SAVINGS" ? "savings" : (asset?.asset_type ?? "etf");
      const now = amount_eur * weight;
      const monthly = monthly_eur * weight;
      return {
        symbol,
        name: symbol === "SAVINGS" ? "KBC savings account" : (asset?.name ?? symbol),
        share: `${Math.round(weight * 100)}%`,
        amount_now: round(now),
        monthly: round(monthly),
        expected_yearly_return: `${EXPECTED_RETURN[type] * 100}%`,
        projected_value: round(futureValue(now, monthly, EXPECTED_RETURN[type], horizon_years)),
      };
    });

    const invested = amount_eur + monthly_eur * 12 * horizon_years;
    const projected = lines.reduce((s, l) => s + l.projected_value, 0);

    return {
      data: {
        goal: goal ?? null,
        risk_profile: risk,
        ...(effectiveRisk !== risk ? { note: "Horizon under 3 years: using a low-risk mix." } : {}),
        horizon_years,
        allocation: lines,
        total_invested: round(invested),
        projected_value: round(projected),
        disclaimer: "Illustrative projection with assumed returns; not personal financial advice.",
        next_step:
          "If the user agrees, execute with buy_stock per asset and move_to_savings for the savings part.",
      },
    };
  },
});
