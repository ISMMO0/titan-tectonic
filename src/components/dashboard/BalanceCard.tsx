import { formatEUR } from "@/lib/format";

type Account = { id: string; type: string; name: string; balance: number };

export function BalanceCard({ accounts }: { accounts: Account[] }) {
  const checking = accounts.find((a) => a.type === "checking");
  const others = accounts.filter((a) => a.type !== "checking");

  return (
    <div className="rounded-2xl bg-brand p-5 text-white shadow">
      <p className="text-sm opacity-80">{checking?.name ?? "Current account"}</p>
      <p className="mt-1 text-3xl font-semibold">{formatEUR(checking?.balance ?? 0)}</p>
      <div className="mt-4 flex gap-6 text-sm">
        {others.map((a) => (
          <div key={a.id}>
            <p className="opacity-70">{a.name}</p>
            <p className="font-medium">{formatEUR(a.balance)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
