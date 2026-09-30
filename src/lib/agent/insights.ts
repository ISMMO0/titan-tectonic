import "server-only";
import type { ToolContext } from "./tools/types";
import { FX_RATES, currencyForDestination } from "./fx";

// "Titan anticipates": turn signals (calendar, transactions, balances) into life moments
// with concrete suggestions. Pure rules — easy to explain, test and scale to millions.

export type LifeMoment = {
  type: "travel" | "celebration" | "low_balance" | "salary_received";
  priority: number; // higher = more important
  title: string;
  details: Record<string, unknown>;
  suggestions: string[];
};

type Data = {
  checkingBalance: number;
  savingsBalance: number;
  calendarOptIn: boolean;
  events: {
    title: string;
    location: string | null;
    starts_at: string;
    ends_at: string | null;
    kind: string;
  }[];
  transactions: { amount: number; description: string; category: string; booked_at: string }[];
};

const DAY = 86_400_000;
const daysUntil = (iso: string, now: number) => Math.ceil((new Date(iso).getTime() - now) / DAY);

export function detectLifeMoments(data: Data, now = Date.now()): LifeMoment[] {
  const moments: LifeMoment[] = [];

  if (data.calendarOptIn) {
    for (const e of data.events) {
      const days = daysUntil(e.starts_at, now);
      if (days < 0) continue;

      if (e.kind === "travel" && days <= 21) {
        const currency = currencyForDestination(e.location ?? e.title);
        const tripDays = e.ends_at
          ? Math.max(1, daysUntil(e.ends_at, new Date(e.starts_at).getTime()))
          : null;
        moments.push({
          type: "travel",
          priority: 100 - days,
          title: `${e.title}${e.location ? ` (${e.location})` : ""} in ${days} day${days === 1 ? "" : "s"}`,
          details: {
            destination: e.location,
            starts_in_days: days,
            trip_length_days: tripDays,
            currency,
            eur_rate: currency ? FX_RATES[currency] : null,
          },
          suggestions: [
            currency
              ? `Order ${currency} now at 1 EUR = ${FX_RATES[currency]} ${currency}`
              : "Check local currency",
            "Add travel insurance for the trip",
            "Enable the card for payments abroad",
            "Set aside a travel budget in savings",
          ],
        });
      }

      if (e.kind === "celebration" && days <= 10) {
        moments.push({
          type: "celebration",
          priority: 85 - days,
          title: `${e.title} in ${days} day${days === 1 ? "" : "s"}`,
          details: { event: e.title, location: e.location, starts_in_days: days },
          suggestions: ["Set €100–150 aside for a gift", "Plan transport/accommodation costs"],
        });
      }
    }
  }

  const upcomingBills = data.calendarOptIn
    ? data.events.filter((e) => e.kind === "bill" && daysUntil(e.starts_at, now) <= 30).length
    : 0;
  if (data.checkingBalance < 300) {
    moments.push({
      type: "low_balance",
      priority: 95,
      title: `Low balance: €${data.checkingBalance.toFixed(2)} on the current account`,
      details: {
        checking: data.checkingBalance,
        savings: data.savingsBalance,
        upcoming_bills: upcomingBills,
      },
      suggestions: [
        data.savingsBalance > 200
          ? "Move some money from savings to cover upcoming bills"
          : "Reduce spending until payday",
      ],
    });
  }

  const salary = data.transactions.find(
    (t) => t.category === "income" && t.amount >= 500 && now - new Date(t.booked_at).getTime() <= 7 * DAY,
  );
  if (salary) {
    const suggested = Math.round((salary.amount * 0.2) / 10) * 10;
    moments.push({
      type: "salary_received",
      priority: 60,
      title: `Salary received: €${salary.amount.toFixed(2)}`,
      details: { amount: salary.amount, description: salary.description, suggested_saving: suggested },
      suggestions: [
        `Save 20% (≈ €${suggested}) toward your goal`,
        "Invest part of it according to your risk profile",
      ],
    });
  }

  return moments.sort((a, b) => b.priority - a.priority);
}

/** Loads the signals for the signed-in user (RLS-scoped) and detects moments. */
export async function loadLifeMoments({ supabase, userId }: ToolContext) {
  const since = new Date(Date.now() - 35 * DAY).toISOString();
  const until = new Date(Date.now() + 30 * DAY).toISOString();

  const [{ data: profile }, { data: accounts }, { data: events }, { data: transactions }] = await Promise.all(
    [
      supabase.from("profiles").select("calendar_opt_in").eq("id", userId).single(),
      supabase.from("accounts").select("type, balance"),
      supabase
        .from("calendar_events")
        .select("title, location, starts_at, ends_at, kind")
        .gte("starts_at", new Date().toISOString())
        .lte("starts_at", until)
        .order("starts_at"),
      supabase
        .from("transactions")
        .select("amount, description, category, booked_at")
        .gte("booked_at", since)
        .order("booked_at", { ascending: false }),
    ],
  );

  const balance = (type: string) => Number(accounts?.find((a) => a.type === type)?.balance ?? 0);

  return detectLifeMoments({
    checkingBalance: balance("checking"),
    savingsBalance: balance("savings"),
    calendarOptIn: Boolean(profile?.calendar_opt_in),
    events: events ?? [],
    transactions: (transactions ?? []).map((t) => ({ ...t, amount: Number(t.amount) })),
  });
}
