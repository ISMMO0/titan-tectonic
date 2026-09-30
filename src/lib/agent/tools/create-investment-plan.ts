import { z } from "zod";
import { defineTool } from "./types";

const riskSchema = z.enum(["low", "medium", "high"]);
const assets = ["savings", "bonds_etf", "world_etf", "stocks"] as const;
const allocations = { low: [60, 30, 10, 0], medium: [20, 30, 40, 10], high: [10, 10, 50, 30] };
// Illustrative fixed annual returns for this mock banking demo, not forecasts.
const returns = [0.02, 0.03, 0.06, 0.08];
const round = (value: number) => Math.round(value * 100) / 100;

export function investmentProjection(
  risk: z.infer<typeof riskSchema>,
  amount: number,
  monthly: number,
  years: number,
) {
  let cumulativeWeight = 0;
  const allocation = assets.map((asset, index) => {
    const weight = allocations[risk][index] / 100;
    const previousWeight = cumulativeWeight;
    cumulativeWeight += weight;
    const initialCents =
      Math.round(amount * 100 * cumulativeWeight) - Math.round(amount * 100 * previousWeight);
    const monthlyCents =
      Math.round(monthly * 100 * cumulativeWeight) - Math.round(monthly * 100 * previousWeight);
    const rate = returns[index];
    const monthlyRate = (1 + rate) ** (1 / 12) - 1;
    const months = Math.floor(years * 12);
    const projected =
      (initialCents / 100) * (1 + rate) ** years +
      ((monthlyCents / 100) * ((1 + monthlyRate) ** months - 1)) / monthlyRate;
    return {
      asset,
      percent: allocations[risk][index],
      amount_eur: initialCents / 100,
      monthly_eur: monthlyCents / 100,
      assumed_annual_return: rate,
      projected_value_eur: round(projected),
    };
  });
  return {
    allocation,
    projected_value_eur: round(allocation.reduce((sum, row) => sum + row.projected_value_eur, 0)),
    total_contributions_eur: round(amount + monthly * Math.floor(years * 12)),
  };
}

export const createInvestmentPlan = defineTool({
  name: "create_investment_plan",
  description:
    "Create a read-only illustrative allocation and projection using the authenticated customer's stored risk level. Use their stored goal when relevant; ask for missing amount or horizon. Does not buy or move money.",
  schema: z.object({
    goal: z.string().trim().min(1).max(300),
    amount_eur: z.number().min(0.01).max(10000000).multipleOf(0.01),
    monthly_eur: z.number().min(0).max(1000000).multipleOf(0.01).optional(),
    horizon_years: z
      .number()
      .min(1 / 12)
      .max(60),
  }),
  async run({ goal, amount_eur, monthly_eur = 0, horizon_years }, { supabase, userId }) {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("risk_level, goals")
      .eq("id", userId)
      .single();
    if (error) throw error;
    const risk = riskSchema.safeParse(profile?.risk_level);
    if (!risk.success)
      return { data: { error: "A valid saved risk profile is required before making a plan." } };
    return {
      data: {
        status: "proposal_only",
        currency: "EUR",
        goal,
        profile_goals: profile.goals,
        risk_level: risk.data,
        horizon_years,
        ...investmentProjection(risk.data, amount_eur, monthly_eur, horizon_years),
        assumptions:
          "Mock illustration with fixed annual returns, end-of-month contributions and no fees, taxes or inflation. Returns are not guaranteed; investments can lose value. No money has moved.",
        short_horizon_warning:
          horizon_years < 5
            ? "For a near-term goal, market losses may occur before the money is needed. Discuss keeping the required amount in savings."
            : null,
      },
    };
  },
});
