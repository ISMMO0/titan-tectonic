import "server-only";
import { z } from "zod";

// Server-side secrets. Validated lazily so `next build` works without keys.
// NEVER import this file from a client component.
const serverSchema = z
  .object({
    GEMINI_API_KEY: z.string().min(1).optional(),
    GEMINI_MODEL: z.string().default("gemini-3.5-flash-lite"),
    GOOGLE_GENAI_USE_VERTEXAI: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    GOOGLE_CLOUD_PROJECT: z.string().min(1).optional(),
    GOOGLE_CLOUD_LOCATION: z.string().min(1).default("global"),
    // Voice: "gemini" now, "elevenlabs" once credits are back, "browser" = let the browser speak.
    VOICE_PROVIDER: z.enum(["gemini", "elevenlabs", "browser"]).default("gemini"),
    GEMINI_STT_MODEL: z.string().default("gemini-3.5-flash-lite"),
    GEMINI_TTS_MODEL: z.string().default("gemini-3.8-flash-tts"),
    GEMINI_TTS_VOICE: z.string().default("Kore"),
    ELEVENLABS_API_KEY: z.string().optional(),
    ELEVENLABS_VOICE_ID: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.GOOGLE_GENAI_USE_VERTEXAI && !env.GOOGLE_CLOUD_PROJECT) {
      ctx.addIssue({
        code: "custom",
        path: ["GOOGLE_CLOUD_PROJECT"],
        message: "GOOGLE_CLOUD_PROJECT is required when Vertex AI is enabled",
      });
    }
    if (!env.GOOGLE_GENAI_USE_VERTEXAI && !env.GEMINI_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["GEMINI_API_KEY"],
        message: "GEMINI_API_KEY is missing — see .env.example",
      });
    }
  });

let cached: z.infer<typeof serverSchema> | undefined;

export function serverEnv() {
  cached ??= serverSchema.parse(process.env);
  return cached;
}
