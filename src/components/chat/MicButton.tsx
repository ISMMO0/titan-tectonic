"use client";

import { useRef, useState } from "react";
import { startRecording, stopSpeaking, type Recording } from "@/lib/voice/browser";

type Props = {
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
  disabled?: boolean;
};

type State = "idle" | "recording" | "transcribing";

// Tap to talk, tap again to send. Audio → /api/voice/stt → onTranscript(text).
export function MicButton({ onTranscript, onError, disabled }: Props) {
  const [state, setState] = useState<State>("idle");
  const recording = useRef<Recording | null>(null);

  async function finish() {
    const rec = recording.current;
    recording.current = null;
    if (!rec) return;
    setState("transcribing");
    try {
      const wav = await rec.stop();
      const form = new FormData();
      form.append("audio", wav, "voice.wav");
      const res = await fetch("/api/voice/stt", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not understand the audio");
      if (data.text) onTranscript(data.text);
      else onError("I didn't hear anything — try again?");
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setState("idle");
    }
  }

  async function toggle() {
    if (state === "recording") return finish();
    if (state !== "idle") return;
    try {
      stopSpeaking(); // don't record Titan's own voice
      recording.current = await startRecording(() => void finish());
      setState("recording");
    } catch {
      onError("Microphone access was blocked. Allow it in your browser to talk to Titan.");
    }
  }

  const label =
    state === "recording" ? "Stop and send" : state === "transcribing" ? "Transcribing…" : "Talk to Titan";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled || state === "transcribing"}
      title={label}
      aria-label={label}
      aria-pressed={state === "recording"}
      className={`relative grid h-12 w-12 shrink-0 place-items-center rounded-full transition disabled:opacity-50 ${
        state === "recording" ? "bg-red-500 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
      }`}
    >
      {state === "recording" && (
        <span className="absolute inset-0 animate-ping rounded-full bg-red-400 opacity-40" />
      )}
      {state === "transcribing" ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
      ) : state === "recording" ? (
        <span className="relative h-3.5 w-3.5 rounded-sm bg-white" />
      ) : (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
