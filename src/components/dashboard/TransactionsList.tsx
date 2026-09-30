import { formatEUR } from "@/lib/format";

type Transaction = { id: string; amount: number; description: string; category: string; booked_at: string };

export function TransactionsList({ transactions }: { transactions: Transaction[] }) {
  return (
    <div className="hidden rounded-2xl bg-white p-4 shadow-sm md:block">
      <h2 className="mb-2 text-sm font-medium text-slate-500">Recent activity</h2>
      <ul className="divide-y divide-slate-100">
        {transactions.map((t) => (
          <li key={t.id} className="flex justify-between py-2 text-sm">
            <span>{t.description}</span>
            <span className={Number(t.amount) < 0 ? "text-slate-900" : "text-emerald-600"}>
              {formatEUR(t.amount)}
            </span>
          </li>
        ))}
        {transactions.length === 0 && <li className="py-2 text-sm text-slate-400">No transactions yet</li>}
      </ul>
    </div>
  );
}
