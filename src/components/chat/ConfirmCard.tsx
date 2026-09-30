export type ActionStatus = "pending" | "working" | "confirmed" | "cancelled" | "failed";

// "The agent proposes, the human approves."
export function ConfirmCard({
  summary,
  status,
  onConfirm,
  onCancel,
}: {
  summary: string;
  status: ActionStatus;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="max-w-[80%] rounded-2xl border border-brand/20 bg-sky-50 p-4">
      <p className="text-sm text-slate-500">Confirm this action</p>
      <p className="mt-1 font-medium">{summary}</p>

      {status === "pending" || status === "working" ? (
        <div className="mt-3 flex gap-2">
          <button
            onClick={onConfirm}
            disabled={status === "working"}
            className="rounded-full bg-brand px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            Confirm
          </button>
          <button
            onClick={onCancel}
            disabled={status === "working"}
            className="rounded-full px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>
      ) : (
        <p className="mt-2 text-sm font-medium">
          {status === "confirmed" && "✅ Done"}
          {status === "cancelled" && "Cancelled"}
          {status === "failed" && "❌ Failed"}
        </p>
      )}
    </div>
  );
}
