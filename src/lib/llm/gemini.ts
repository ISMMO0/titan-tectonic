import "server-only";
import { GoogleGenAI } from "@google/genai";
import { serverEnv } from "@/lib/env";

// Thin wrapper so the rest of the app doesn't depend on the SDK setup.
// Switch to Vertex AI later with: new GoogleGenAI({ vertexai: true, project, location }).
let client: GoogleGenAI | undefined;

export function gemini() {
  client ??= new GoogleGenAI({ apiKey: serverEnv().GEMINI_API_KEY });
  return { client, model: serverEnv().GEMINI_MODEL };
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
