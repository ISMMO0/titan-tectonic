import { redirect } from "next/navigation";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { BalanceCard } from "@/components/dashboard/BalanceCard";
import { TransactionsList } from "@/components/dashboard/TransactionsList";
import { createClient, getUserId } from "@/lib/supabase/server";
import { logout } from "../login/actions";

// Chat-first home: the agent is the main screen, the mini dashboard shows
// the effect of what it does (refreshed after every confirmed action).
export default async function HomePage() {
  const supabase = await createClient();
  const userId = await getUserId(supabase);
  if (!userId) redirect("/login");

  const [{ data: profile }, { data: accounts }, { data: transactions }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("accounts").select("id, type, name, balance, currency").order("type"),
    supabase
      .from("transactions")
      .select("id, amount, description, category, booked_at")
      .order("booked_at", { ascending: false })
      .limit(5),
  ]);

  const firstName = profile?.full_name?.split(" ")[0] ?? "";

  return (
    <main className="mx-auto flex h-dvh max-w-5xl flex-col gap-4 p-4 md:flex-row">
      <aside className="flex flex-col gap-4 md:w-80">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-brand">Titan</h1>
          <form action={logout}>
            <button className="text-sm text-slate-500 hover:text-slate-800">Sign out</button>
          </form>
        </header>
        <BalanceCard accounts={accounts ?? []} />
        <TransactionsList transactions={transactions ?? []} />
      </aside>
      <section className="flex min-h-0 flex-1">
        <ChatWindow firstName={firstName} />
      </section>
    </main>
  );
}
