"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading) return;

    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Skip the local greeting; send only role + content.
        body: JSON.stringify({ messages: next.slice(1).map(({ role, content }) => ({ role, content })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setMessages((m) => [...m, { role: "assistant", content: data.reply, actions: data.pendingActions }]);
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${(err as Error).message}` }]);
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
      setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${data.error ?? "That didn't work"}` }]);
      return;
    }
    setActionStatus((s) => ({ ...s, [id]: decision === "confirm" ? "confirmed" : "cancelled" }));
    router.refresh(); // update balances + transactions
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-2xl bg-white shadow-sm">
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
        <MicButton onTranscript={send} disabled={loading} />
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
