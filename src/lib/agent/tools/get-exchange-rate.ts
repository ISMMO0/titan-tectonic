import { z } from "zod";
import { FX_RATES } from "../fx";
import { defineTool } from "./types";

export const getExchangeRate = defineTool({
  name: "get_exchange_rate",
  description:
    "Get an illustrative mock exchange rate from EUR to another currency and optionally convert an amount. Not a live KBC quote, and does not exchange money.",
  schema: z.object({
    currency: z.string().length(3).describe("ISO currency code, e.g. JPY, USD, GBP"),
    amount_eur: z.number().positive().max(100_000).optional().describe("Amount in EUR to convert"),
  }),
  async run({ currency, amount_eur }) {
    const code = currency.toUpperCase();
    const rate = FX_RATES[code];
    if (!rate)
      return { data: { error: `No rate for ${code}. Available: ${Object.keys(FX_RATES).join(", ")}` } };
    return {
      data: {
        source: "mock",
        live: false,
        rate: `1 EUR = ${rate} ${code}`,
        ...(amount_eur ? { converted: `€${amount_eur} = ${(amount_eur * rate).toFixed(2)} ${code}` } : {}),
      },
    };
  },
});
