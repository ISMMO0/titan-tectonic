import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { jsonError, requireUser } from "@/lib/security";
import { transcribe } from "@/lib/voice/gemini";

const MAX_BYTES = 5 * 1024 * 1024; // ~2.5 min of 16 kHz mono WAV

// Speech → text. The browser records, converts to 16 kHz mono WAV, and posts it here.
export async function POST(request: Request) {
  const auth = await requireUser(request, { rateLimit: 20 });
  if ("error" in auth) return auth.error;

  const provider = serverEnv().VOICE_PROVIDER;
  if (provider !== "gemini") {
    // TODO(elevenlabs): call ElevenLabs Scribe here when VOICE_PROVIDER=elevenlabs.
    return jsonError(`Speech-to-text provider "${provider}" not available`, 501);
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("audio");
  if (!(file instanceof Blob)) return jsonError("Missing audio", 400);
  if (file.size === 0 || file.size > MAX_BYTES) return jsonError("Audio too large or empty", 413);
  if (file.type !== "audio/wav") return jsonError("Audio must be audio/wav", 415);

  try {
    const text = await transcribe(Buffer.from(await file.arrayBuffer()), file.type);
    return NextResponse.json({ text });
  } catch (err) {
    console.error("[api/voice/stt]", err);
    return jsonError("Could not transcribe the audio", 502);
  }
}
