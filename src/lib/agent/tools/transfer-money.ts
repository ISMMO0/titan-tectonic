import { z } from "zod";
import { defineTool } from "./types";

// Max amount without extra verification. Also enforced in SQL (confirm_action).
const MAX_TRANSFER = 500;

export const transferMoney = defineTool({
  name: "transfer_money",
  description:
    "Prepare a transfer from the user's current account to one of their saved contacts. " +
    "This does NOT send money: it creates a request the user must confirm in the app.",
  schema: z.object({
    contact_name: z.string().min(1).max(80).describe("Name of the saved contact, e.g. 'Tom'"),
    amount: z.number().positive().max(MAX_TRANSFER).describe("Amount in EUR"),
  }),
  async run({ contact_name, amount }, { supabase, userId }) {
    // RLS guarantees we only see this user's contacts.
    const { data: contacts, error } = await supabase
      .from("contacts")
      .select("id, name")
      .ilike("name", `%${contact_name.replace(/[%_]/g, "")}%`)
      .limit(2);
    if (error) throw error;

    if (!contacts?.length) return { data: { error: `No saved contact matches "${contact_name}".` } };
    if (contacts.length > 1) {
      return {
        data: {
          error: "Several contacts match — ask the user which one.",
          matches: contacts.map((c) => c.name),
        },
      };
    }

    const contact = contacts[0];
    const rounded = Math.round(amount * 100) / 100;
    const summary = `Send €${rounded.toFixed(2)} to ${contact.name}`;

    const { data: action, error: insertError } = await supabase
      .from("pending_actions")
      .insert({
        user_id: userId,
        type: "transfer",
        payload: { contact_id: contact.id, amount: rounded },
        summary,
      })
      .select("id, type, summary")
      .single();
    if (insertError) throw insertError;

    return {
      data: { status: "awaiting_user_confirmation", summary },
      pendingAction: action,
    };
  },
});
