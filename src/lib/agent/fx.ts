// Mock KBC exchange rates (1 EUR = x). Good enough for the demo; swap for a real feed later.
export const FX_RATES: Record<string, number> = {
  USD: 1.08,
  GBP: 0.85,
  CHF: 0.94,
  JPY: 162.4,
  CAD: 1.47,
  AUD: 1.63,
  CNY: 7.82,
  MAD: 10.85,
  TRY: 36.2,
};

// Destination (as written in a calendar event) → currency.
const DESTINATIONS: [RegExp, string][] = [
  [/japan|tokyo|osaka|kyoto/i, "JPY"],
  [/usa|united states|new york|san francisco|los angeles|miami/i, "USD"],
  [/uk|united kingdom|london|edinburgh|manchester/i, "GBP"],
  [/switzerland|zurich|geneva/i, "CHF"],
  [/canada|toronto|montreal|vancouver/i, "CAD"],
  [/australia|sydney|melbourne/i, "AUD"],
  [/china|beijing|shanghai/i, "CNY"],
  [/morocco|marrakech|casablanca/i, "MAD"],
  [/turkey|istanbul|antalya/i, "TRY"],
];

export function currencyForDestination(location: string | null | undefined) {
  if (!location) return null;
  return DESTINATIONS.find(([re]) => re.test(location))?.[1] ?? null;
}
