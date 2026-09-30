import { z } from "zod";
import { defineTool } from "./types";

export const getTransactions = defineTool({
  name: "get_transactions",
  description:
    "List the user's most recent transactions (negative amount = money out). Use it for spending questions.",
  schema: z.object({
    limit: z.number().int().min(1).max(50).default(15).describe("How many transactions to return"),
    category: z.string().max(40).optional().describe("Optional category filter, e.g. food, travel"),
  }),
  async run({ limit, category }, { supabase }) {
    let query = supabase
      .from("transactions")
      .select("amount, description, category, merchant, booked_at")
      .order("booked_at", { ascending: false })
      .limit(limit);
    if (category) query = query.eq("category", category);
    const { data, error } = await query;
    if (error) throw error;
    return { data: { transactions: data } };
  },
});
