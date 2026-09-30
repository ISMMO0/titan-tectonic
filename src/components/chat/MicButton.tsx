"use client";

type Props = { onTranscript: (text: string) => void; disabled?: boolean };

// TODO(Phase 2 — voice): record with MediaRecorder, POST the audio to
// /api/voice/stt, then call onTranscript(text). Play replies via /api/voice/tts.
// Disabled until implemented.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- wired up in Phase 2
export function MicButton(_props: Props) {
  return (
    <button
      type="button"
      disabled
      title="Voice coming soon"
      aria-label="Speak to Titan"
      className="rounded-full bg-slate-100 p-3 text-slate-400"
    >
      🎤
    </button>
  );
}
