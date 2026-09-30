import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { jsonError, requireUser } from "@/lib/security";
import { synthesize } from "@/lib/voice/gemini";

const bodySchema = z.object({ text: z.string().trim().min(1).max(1000) });

// Text → speech. Returns audio the browser can play. The API key never leaves the server.
// If this fails, the client falls back to the browser's built-in speech.
export async function POST(request: Request) {
  const auth = await requireUser(request, { rateLimit: 30 });
  if ("error" in auth) return auth.error;

  const provider = serverEnv().VOICE_PROVIDER;
  if (provider !== "gemini") {
    // TODO(elevenlabs): call ElevenLabs TTS here when VOICE_PROVIDER=elevenlabs.
    return jsonError(`Text-to-speech provider "${provider}" not available`, 501);
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError("Invalid request", 400);

  try {
    const { audio, mimeType } = await synthesize(body.data.text);
    return new Response(new Uint8Array(audio), {
      headers: { "Content-Type": mimeType, "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[api/voice/tts]", err);
    return jsonError("Could not generate speech", 502);
  }
}
