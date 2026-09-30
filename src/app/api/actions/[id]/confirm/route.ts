import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireUser } from "@/lib/security";

// The human approves an action the agent proposed.
// All checks (owner, status, expiry, limits, balance) happen in SQL: confirm_action().
export async function POST(request: Request, ctx: RouteContext<"/api/actions/[id]/confirm">) {
  const auth = await requireUser(request, { rateLimit: 10 });
  if ("error" in auth) return auth.error;

  const id = z.uuid().safeParse((await ctx.params).id);
  if (!id.success) return jsonError("Invalid action id", 400);

  const { data, error } = await auth.supabase.rpc("confirm_action", { p_action_id: id.data });
  if (error) {
    // Business errors raised in SQL are safe to show; don't leak anything else.
    const safe = ["insufficient funds", "amount above limit", "action not found", "contact not found"];
    const message = safe.find((m) => error.message.includes(m)) ?? "Could not complete the action";
    return jsonError(message, 400);
  }
  return NextResponse.json(data);
}
