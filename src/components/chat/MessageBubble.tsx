export function MessageBubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      {/* Rendered as plain text (no HTML) — never dangerouslySetInnerHTML LLM output. */}
      <p
        className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 ${
          isUser ? "bg-brand text-white" : "bg-slate-100 text-slate-900"
        }`}
      >
        {content}
      </p>
    </div>
  );
}
