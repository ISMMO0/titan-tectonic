import { jsonError, requireUser } from "@/lib/security";

// TODO(Phase 2 — voice): receive recorded audio (FormData "audio"), send it to
// ElevenLabs Speech-to-Text (Scribe) with serverEnv().ELEVENLABS_API_KEY,
// return { text }. Validate size (< 10 MB) and mime type (audio/*).
export async function POST(request: Request) {
  const auth = await requireUser(request, { rateLimit: 20 });
  if ("error" in auth) return auth.error;
  return jsonError("Speech-to-text not implemented yet", 501);
}
