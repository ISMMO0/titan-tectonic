import "server-only";
import { gemini } from "@/lib/llm/gemini";
import { serverEnv } from "@/lib/env";
import { pcmToWav } from "./wav";

/** Speech → text. Audio is WAV (the browser converts recordings before upload). */
export async function transcribe(audio: Buffer, mimeType: string) {
  const { client } = gemini();
  const response = await client.models.generateContent({
    model: serverEnv().GEMINI_STT_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType, data: audio.toString("base64") } },
          {
            text:
              "Transcribe this voice message exactly, in the language it is spoken " +
              "(English, Dutch or French). Return only the transcription, nothing else. " +
              "If there is no speech, return an empty string.",
          },
        ],
      },
    ],
  });
  return (response.text ?? "").trim();
}

/** Text → speech. Returns playable audio. */
export async function synthesize(text: string) {
  const { client } = gemini();
  const env = serverEnv();
  const response = await client.models.generateContent({
    model: env.GEMINI_TTS_MODEL,
    // Send only the reply: this model reads everything it gets out loud.
    contents: [{ role: "user", parts: [{ text }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: env.GEMINI_TTS_VOICE } } },
    },
  });

  const part = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
  if (!part?.data) throw new Error("No audio returned");

  const bytes = Buffer.from(part.data, "base64");
  const mime = part.mimeType ?? "";
  // Some models return raw PCM ("audio/L16;rate=24000") — wrap it so browsers can play it.
  if (/l16|pcm/i.test(mime)) {
    const rate = Number(/rate=(\d+)/.exec(mime)?.[1] ?? 24_000);
    return { audio: pcmToWav(bytes, rate), mimeType: "audio/wav" };
  }
  return { audio: bytes, mimeType: mime || "audio/wav" };
}
