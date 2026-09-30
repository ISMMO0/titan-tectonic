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
