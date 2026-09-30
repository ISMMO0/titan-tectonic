"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, SendHorizontal, Volume2, VolumeX } from "lucide-react";
import { logout } from "@/app/login/actions";
import { formatEUR } from "@/lib/format";
import { speak, stopSpeaking } from "@/lib/voice/browser";
import { ConfirmCard, type ActionStatus } from "./ConfirmCard";
import { MessageBubble } from "./MessageBubble";
import { MicButton } from "./MicButton";

type PendingAction = { id: string; type: string; summary: string };
type Message = { role: "user" | "assistant"; content: string; actions?: PendingAction[] };
type Account = { id: string; type: string; name: string; balance: number | string };

const starters = ["Where does my money go?", "I got a €2,000 bonus, what should I do?", "Send €30 to Tom"];

// Gemini expects the conversation to start with the user. Titan speaks first,
// so add a short opener — this keeps the greeting as context for a reply like "yes".
function toHistory(messages: Message[]) {
  const history = messages.map(({ role, content }) => ({ role, content }));
  if (history[0]?.role === "assistant") history.unshift({ role: "user", content: "(opened the app)" });
  return history.slice(-30);
}

// Chat-only home: Titan speaks first, everything else happens in the conversation.
export function ChatWindow({ firstName, accounts }: { firstName: string; accounts: Account[] }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [actionStatus, setActionStatus] = useState<Record<string, ActionStatus>>({});
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true); // true while the proactive greeting loads
  const [voiceOn, setVoiceOn] = useState(false);
  const greetingRequested = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const checking = accounts.find((a) => a.type === "checking");
  const hasUserMessage = messages.some((m) => m.role === "user");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // "Titan speaks first": proactive greeting about the most important life moment.
  useEffect(() => {
    if (greetingRequested.current) return; // React dev mode runs effects twice
    greetingRequested.current = true;
    const fallback = `Hi ${firstName || "there"}! I'm Titan, your banking agent. What can I do for you?`;
    fetch("/api/insights", { method: "POST" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) =>
        setMessages([{ role: "assistant", content: data?.reply || fallback, actions: data?.pendingActions }]),
      )
      .catch(() => setMessages([{ role: "assistant", content: fallback }]))
      .finally(() => setLoading(false));
  }, [firstName]);

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
    router.refresh(); // updates the balance in the top bar
  }

  return (
    <div className="flex h-dvh flex-col bg-[var(--paper)]">
      <header className="border-b border-[var(--line)] bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4">
          <span className="text-xl font-bold text-[var(--ink)]">Titan</span>
          <span className="ml-auto rounded-full bg-[var(--cyan-soft)] px-3 py-1 text-sm font-semibold text-[var(--ink)]">
            {formatEUR(checking?.balance ?? 0)}
          </span>
          <button
            type="button"
            onClick={() => {
              if (voiceOn) stopSpeaking();
              setVoiceOn(!voiceOn);
            }}
            aria-pressed={voiceOn}
            aria-label={voiceOn ? "Turn voice replies off" : "Turn voice replies on"}
            title={voiceOn ? "Voice replies on" : "Voice replies off"}
            className={`grid h-10 w-10 place-items-center rounded-full ${
              voiceOn ? "bg-[var(--ink)] text-white" : "text-[var(--muted)] hover:bg-slate-100"
            }`}
          >
            {voiceOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <form action={logout}>
            <button
              type="submit"
              aria-label="Sign out"
              title="Sign out"
              className="grid h-10 w-10 place-items-center rounded-full text-[var(--muted)] hover:bg-slate-100"
            >
              <LogOut size={18} />
            </button>
          </form>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-6" aria-live="polite">
          {messages.map((message, index) => (
            <div key={index} className="space-y-2">
              <MessageBubble role={message.role} content={message.content} />
              {message.actions?.map((action) => (
                <ConfirmCard
                  key={action.id}
                  summary={action.summary}
                  status={actionStatus[action.id] ?? "pending"}
                  onConfirm={() => resolveAction(action.id, "confirm")}
                  onCancel={() => resolveAction(action.id, "cancel")}
                />
              ))}
            </div>
          ))}

          {loading && (
            <div className="typing" aria-label="Titan is typing">
              <span />
              <span />
              <span />
            </div>
          )}

          {!loading && !hasUserMessage && (
            <div className="flex flex-wrap gap-2 pt-2">
              {starters.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm text-[var(--ink)] hover:border-[var(--cyan)]"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </main>

      <footer className="border-t border-[var(--line)] bg-white">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3"
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
            aria-label="Message Titan"
            className="h-12 min-w-0 flex-1 rounded-full bg-slate-100 px-4 outline-none focus:ring-2 focus:ring-[var(--cyan)]"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            aria-label="Send"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--cyan)] text-white disabled:opacity-40"
          >
            <SendHorizontal size={20} />
          </button>
        </form>
      </footer>
    </div>
  );
}
