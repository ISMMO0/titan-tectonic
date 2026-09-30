import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireUser } from "@/lib/security";

export async function POST(request: Request, ctx: RouteContext<"/api/actions/[id]/cancel">) {
  const auth = await requireUser(request, { rateLimit: 20 });
  if ("error" in auth) return auth.error;

  const id = z.uuid().safeParse((await ctx.params).id);
  if (!id.success) return jsonError("Invalid action id", 400);

  const { error } = await auth.supabase.rpc("cancel_action", { p_action_id: id.data });
  if (error) return jsonError("Could not cancel the action", 400);
  return NextResponse.json({ ok: true });
}
