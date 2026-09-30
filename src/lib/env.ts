import "server-only";
import { z } from "zod";

// Server-side secrets. Validated lazily so `next build` works without keys.
// NEVER import this file from a client component.
const serverSchema = z.object({
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is missing — see .env.example"),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  // Voice: "gemini" now, "elevenlabs" once credits are back, "browser" = let the browser speak.
  VOICE_PROVIDER: z.enum(["gemini", "elevenlabs", "browser"]).default("gemini"),
  GEMINI_STT_MODEL: z.string().default("gemini-2.5-flash"),
  GEMINI_TTS_MODEL: z.string().default("gemini-3.8-flash-tts"),
  GEMINI_TTS_VOICE: z.string().default("Kore"),
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_VOICE_ID: z.string().optional(),
});

let cached: z.infer<typeof serverSchema> | undefined;

export function serverEnv() {
  cached ??= serverSchema.parse(process.env);
  return cached;
}
