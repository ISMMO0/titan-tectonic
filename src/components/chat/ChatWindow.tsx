"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { speak, stopSpeaking } from "@/lib/voice/browser";
import { ConfirmCard, type ActionStatus } from "./ConfirmCard";
import { MessageBubble } from "./MessageBubble";
import { MicButton } from "./MicButton";

type PendingAction = { id: string; type: string; summary: string };
type Message = { role: "user" | "assistant"; content: string; actions?: PendingAction[] };

// The first message is Titan's greeting. The API expects the conversation to start with
// the user, so we add a short opener — this keeps the proactive greeting as context
// (e.g. the user answering "yes" to "want yen for Tokyo?").
function toHistory(messages: Message[]) {
  const history = messages.map(({ role, content }) => ({ role, content }));
  return [{ role: "user" as const, content: "(opened the app)" }, ...history].slice(-30);
}

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
  const [voiceOn, setVoiceOn] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Proactive greeting ("Titan speaks first"): replaces the static greeting once loaded.
  const proactive = useRef<"idle" | "loading" | "done">("idle");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (proactive.current !== "idle") return; // React dev mode runs effects twice
    proactive.current = "loading";
    fetch("/api/insights", { method: "POST" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.reply) {
          setMessages((m) => [
            { role: "assistant", content: data.reply, actions: data.pendingActions },
            ...m.slice(1),
          ]);
        }
      })
      .catch(() => {}) // keep the static greeting
      .finally(() => (proactive.current = "done"));
  }, []);

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
    stopSpeaking();

    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: toHistory(next) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
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
    if (!res.ok) {
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
