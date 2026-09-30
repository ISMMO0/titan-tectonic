import { NextResponse } from "next/server";
import { runAgent } from "@/lib/agent/run";
import { jsonError, requireUser } from "@/lib/security";

export async function POST(request: Request) {
  const auth = await requireUser(request, { rateLimit: 5 });
  if ("error" in auth) return auth.error;
  const requestedLanguage = request.headers
    .get("accept-language")
    ?.split(",")[0]
    ?.split("-")[0]
    ?.toLowerCase();
  const language = requestedLanguage === "nl" ? "Dutch" : requestedLanguage === "fr" ? "French" : "English";
  try {
    const result = await runAgent(
      [
        {
          role: "user",
          content: `Use get_suggestions to greet me in ${language} with my most important life moment and one relevant question. This is an automatic read-only greeting, not authorization to create an action.`,
        },
      ],
      auth,
      { readOnly: true },
    );
    return NextResponse.json({ reply: result.reply }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[api/insights]", error);
    return jsonError("Personalized greeting unavailable", 503);
  }
}
