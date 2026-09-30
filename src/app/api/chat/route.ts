import { NextResponse } from "next/server";
import { z } from "zod";
import { runAgent } from "@/lib/agent/run";
import { jsonError, requireUser } from "@/lib/security";

const bodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(2000) }))
    .min(1)
    .max(30),
});

export async function POST(request: Request) {
  const auth = await requireUser(request, { rateLimit: 20 });
  if ("error" in auth) return auth.error;

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError("Invalid request", 400);

  try {
    const result = await runAgent(body.data.messages, auth);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/chat]", err);
    return jsonError("The agent is unavailable right now", 500);
  }
}
