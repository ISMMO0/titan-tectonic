"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { speak, stopSpeaking } from "@/lib/voice/browser";
import { ConfirmCard, type ActionStatus } from "./ConfirmCard";
import { MessageBubble } from "./MessageBubble";
import { MicButton } from "./MicButton";

type PendingAction = { id: string; type: string; summary: string };
type Message = { role: "user" | "assistant"; content: string; actions?: PendingAction[] };

export function ChatWindow({ firstName }: { firstName: string }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: `Hi${firstName ? ` ${firstName}` : ""}! I'm Titan, your banking agent. Ask me about your money, or tell me what to do.`,
    },
  ]);
  const [actionStatus, setActionStatus] = useState<Record<string, ActionStatus>>({});
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [voiceOn, setVoiceOn] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const greetingRequest = useRef<Promise<string | null> | null>(null);
  const conversationStarted = useRef(false);

  useEffect(() => {
    let active = true;
    // Keep one request through Strict Mode effect replay. Never overwrite a conversation.
    greetingRequest.current ??= fetch("/api/insights", {
      method: "POST",
      headers: { "Accept-Language": navigator.language },
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          setConnectionError(data.error ?? "Personalized greeting unavailable");
          return null;
        }
        return typeof data.reply === "string" && data.reply.trim() ? data.reply : null;
      })
      .catch(() => null);
    greetingRequest.current.then((reply) => {
      if (active && reply && !conversationStarted.current) {
        setMessages([{ role: "assistant", content: reply }]);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function addAssistant(content: string, actions?: PendingAction[], speakIt = voiceOn) {
    setMessages((m) => [...m, { role: "assistant", content, actions }]);
    if (speakIt) void speak(content);
  }

  // Talking to Titan turns spoken replies on.
  function sendVoice(text: string) {
    setVoiceOn(true);
    void send(text, true);
  }

  async function send(text: string, speakReply = voiceOn) {
    const content = text.trim();
    if (!content || loading) return;
    conversationStarted.current = true;
    stopSpeaking();

    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Retain the greeting so follow-ups about the suggested moment have context.
        body: JSON.stringify({
          messages: [
            { role: "user", content: "(opened the app)" },
            ...next.map(({ role, content }) => ({ role, content })),
          ].slice(-30),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setConnectionError(null);
      addAssistant(data.reply, data.pendingActions, speakReply);
    } catch (err) {
      addAssistant(`⚠️ ${(err as Error).message}`, undefined, false);
    } finally {
      setLoading(false);
    }
  }

  async function resolveAction(id: string, decision: "confirm" | "cancel") {
    setActionStatus((s) => ({ ...s, [id]: "working" }));
    const res = await fetch(`/api/actions/${id}/${decision}`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      setActionStatus((s) => ({ ...s, [id]: "failed" }));
      addAssistant(`⚠️ ${data.error ?? "That didn't work"}`, undefined, false);
      return;
    }
    setActionStatus((s) => ({ ...s, [id]: decision === "confirm" ? "confirmed" : "cancelled" }));
    if (voiceOn) void speak(decision === "confirm" ? "Done." : "Cancelled.");
    router.refresh(); // update balances + transactions
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-2xl bg-white shadow-sm">
      {connectionError && (
        <p role="status" className="rounded-t-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {connectionError}
        </p>
      )}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
        <span className="text-sm font-medium text-slate-500">Titan</span>
        <button
          type="button"
          onClick={() => {
            if (voiceOn) stopSpeaking();
            setVoiceOn(!voiceOn);
          }}
          aria-pressed={voiceOn}
          title={voiceOn ? "Voice replies on" : "Voice replies off"}
          className={`rounded-full px-3 py-1 text-sm ${voiceOn ? "bg-brand text-white" : "bg-slate-100 text-slate-500"}`}
        >
          {voiceOn ? "🔊 Voice on" : "🔈 Voice off"}
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div key={i} className="space-y-2">
            <MessageBubble role={m.role} content={m.content} />
            {m.actions?.map((a) => (
              <ConfirmCard
                key={a.id}
                summary={a.summary}
                status={actionStatus[a.id] ?? "pending"}
                onConfirm={() => resolveAction(a.id, "confirm")}
                onCancel={() => resolveAction(a.id, "cancel")}
              />
            ))}
          </div>
        ))}
        {loading && <MessageBubble role="assistant" content="…" />}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 border-t border-slate-100 p-3"
      >
        <MicButton
          onTranscript={sendVoice}
          onError={(message) => addAssistant(`⚠️ ${message}`, undefined, false)}
          disabled={loading}
        />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Titan anything…"
          maxLength={2000}
          className="flex-1 rounded-full bg-slate-100 px-4 py-3 outline-none"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-full bg-brand px-5 py-3 text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
