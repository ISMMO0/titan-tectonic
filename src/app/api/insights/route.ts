import { NextResponse } from "next/server";
import { runAgent } from "@/lib/agent/run";
import { PROACTIVE_OPENING } from "@/lib/agent/prompt";
import { jsonError, requireUser } from "@/lib/security";

// "Titan speaks first": called when the app opens. The opening instruction is
// built server-side; the client sends nothing the agent could be steered with.
export async function POST(request: Request) {
  const auth = await requireUser(request, { rateLimit: 10 });
  if ("error" in auth) return auth.error;

  try {
    const result = await runAgent([{ role: "user", content: PROACTIVE_OPENING }], auth);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/insights]", err);
    return jsonError("Insights unavailable right now", 500);
  }
}
