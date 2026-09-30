import { FX_RATES } from "./fx";

export type InsightInput = {
  calendarOptIn: boolean;
  checkingBalance: number;
  savingsBalance: number;
  events: { title: string; kind: string; starts_at: string; amount_eur?: number | null }[];
  transactions: { amount: number | string; category: string; booked_at: string; description: string }[];
};
export type LifeMoment = {
  kind: "travel" | "celebration" | "low_balance" | "salary_received";
  priority: number;
  title: string;
  days_away?: number;
  amount_eur?: number;
  evidence: string;
};

export function detectLifeMoments(input: InsightInput, now = new Date()): LifeMoment[] {
  const moments: LifeMoment[] = [];
  const upcoming = input.calendarOptIn
    ? input.events.filter((event) => {
        const delta = Date.parse(event.starts_at) - now.getTime();
        return delta >= 0 && delta <= 14 * 86400000;
      })
    : [];
  for (const event of upcoming) {
    const days = Math.ceil((Date.parse(event.starts_at) - now.getTime()) / 86400000);
    if (event.kind === "travel" || (event.kind === "celebration" && days <= 7)) {
      moments.push({
        kind: event.kind,
        priority: event.kind === "travel" ? 80 : 60,
        title: event.title,
        days_away: days,
        evidence: "Opted-in upcoming calendar event",
      });
    }
  }
  // Calendar schema has no bill amount: use a known amount if provided, otherwise
  // infer rent only from the latest housing transaction and label it an estimate.
  const latestRent = [...input.transactions]
    .filter(
      (tx) => tx.category === "housing" && Number(tx.amount) < 0 && Date.parse(tx.booked_at) <= now.getTime(),
    )
    .sort((a, b) => Date.parse(b.booked_at) - Date.parse(a.booked_at))[0];
  const bills = upcoming.filter((event) => event.kind === "bill");
  const estimatedBills = bills.reduce(
    (sum, event) =>
      sum +
      (event.amount_eur != null && Number.isFinite(event.amount_eur) && event.amount_eur > 0
        ? event.amount_eur
        : /rent|huur|loyer/i.test(event.title) && latestRent
          ? -Number(latestRent.amount)
          : 0),
    0,
  );
  if (input.checkingBalance < 200 || input.checkingBalance < estimatedBills) {
    moments.push({
      kind: "low_balance",
      priority: 100,
      title: "Current account may need a top-up",
      amount_eur: input.checkingBalance,
      evidence:
        input.checkingBalance < estimatedBills
          ? `Upcoming bills estimated at EUR ${estimatedBills.toFixed(2)}; verify amounts before acting.`
          : "Current account balance is below EUR 200.",
    });
  }
  const income = input.transactions.filter(
    (tx) =>
      tx.category === "income" &&
      Number(tx.amount) > 0 &&
      Date.parse(tx.booked_at) <= now.getTime() &&
      Date.parse(tx.booked_at) >= now.getTime() - 7 * 86400000,
  );
  if (income.length)
    moments.push({
      kind: "salary_received",
      priority: 40,
      title: "Income received recently",
      amount_eur: Math.round(income.reduce((sum, tx) => sum + Number(tx.amount), 0) * 100) / 100,
      evidence: "Positive income transactions in the last seven days; not necessarily recurring salary.",
    });
  return moments.sort((a, b) => b.priority - a.priority || (a.days_away ?? 0) - (b.days_away ?? 0));
}

export function suggestionsFor(moments: LifeMoment[], savingsBalance: number) {
  return moments.map((moment) => ({
    ...moment,
    suggestions:
      moment.kind === "travel"
        ? [
            `Review exchange needs: illustrative mock EUR→JPY rate is ${FX_RATES.JPY} JPY per EUR, not a live or best-rate quote.`,
            "Review travel insurance and card use abroad; no product has been purchased.",
          ]
        : moment.kind === "celebration"
          ? ["Ask how much to set aside for a gift; a savings move requires confirmation."]
          : moment.kind === "low_balance"
            ? [
                savingsBalance > 0
                  ? "Consider moving money from savings to the current account. This reverse-transfer tool is not available yet; do not call move_to_savings for this."
                  : "Review upcoming spending and bills; no savings balance is available to top up.",
              ]
            : [
                "Discuss saving or investing part of the income toward the saved goals, after keeping a cash buffer. Investment values can fall; this is not personal financial advice.",
              ],
  }));
}
