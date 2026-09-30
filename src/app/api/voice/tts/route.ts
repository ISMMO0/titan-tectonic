import { jsonError, requireUser } from "@/lib/security";

// TODO(Phase 2 — voice): receive { text } (max ~1000 chars), call ElevenLabs
// Text-to-Speech with serverEnv().ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID,
// stream back audio/mpeg. The API key must never reach the browser.
export async function POST(request: Request) {
  const auth = await requireUser(request, { rateLimit: 30 });
  if ("error" in auth) return auth.error;
  return jsonError("Text-to-speech not implemented yet", 501);
}
