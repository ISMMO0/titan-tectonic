import "server-only";
import { GoogleGenAI } from "@google/genai";
import { serverEnv } from "@/lib/env";

// Thin wrapper so the rest of the app doesn't depend on the SDK setup.
let client: GoogleGenAI | undefined;

export function gemini() {
  const env = serverEnv();
  if (!client) {
    if (env.GOOGLE_GENAI_USE_VERTEXAI) {
      if (!env.GOOGLE_CLOUD_PROJECT) throw new Error("GOOGLE_CLOUD_PROJECT is required for Vertex AI");
      client = new GoogleGenAI({
        vertexai: true,
        project: env.GOOGLE_CLOUD_PROJECT,
        location: env.GOOGLE_CLOUD_LOCATION,
      });
    } else {
      if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required for the Gemini Developer API");
      client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    }
  }
  return { client, model: env.GEMINI_MODEL };
}

const RETRYABLE = new Set([429, 500, 503]);

/**
 * Retries temporary Gemini errors ("model experiencing high demand", rate limits)
 * with a short backoff, so a busy moment doesn't break the chat mid-demo.
 */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (i >= attempts || !status || !RETRYABLE.has(status)) throw err;
      await new Promise((r) => setTimeout(r, 700 * 2 ** (i - 1))); // 0.7s, 1.4s
    }
  }
}
