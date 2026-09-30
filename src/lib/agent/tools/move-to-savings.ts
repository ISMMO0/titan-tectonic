import { z } from "zod";
import { defineTool } from "./types";

export const moveToSavings = defineTool({
  name: "move_to_savings",
  description:
    "Prepare moving money from the current account to the savings account. " +
    "Creates a request the user must confirm in the app.",
  schema: z.object({
    amount: z.number().positive().max(10_000).describe("Amount in EUR"),
    reason: z.string().max(80).optional().describe("What the money is for, e.g. 'Tokyo trip'"),
  }),
  async run({ amount, reason }, { supabase, userId }) {
    const rounded = Math.round(amount * 100) / 100;
    const summary = `Move €${rounded.toFixed(2)} to savings${reason ? ` (${reason})` : ""}`;

    const { data: action, error } = await supabase
      .from("pending_actions")
      .insert({ user_id: userId, type: "move_to_savings", payload: { amount: rounded, reason }, summary })
      .select("id, type, summary")
      .single();
    if (error) throw error;

    return { data: { status: "awaiting_user_confirmation", summary }, pendingAction: action };
  },
});
