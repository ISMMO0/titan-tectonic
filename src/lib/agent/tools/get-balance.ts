import { z } from "zod";
import { defineTool } from "./types";

export const getBalance = defineTool({
  name: "get_balance",
  description: "Get the balances of the user's accounts (checking, savings, investment).",
  schema: z.object({}),
  async run(_args, { supabase }) {
    const { data, error } = await supabase
      .from("accounts")
      .select("type, name, balance, currency")
      .order("type");
    if (error) throw error;
    return { data: { accounts: data } };
  },
});
