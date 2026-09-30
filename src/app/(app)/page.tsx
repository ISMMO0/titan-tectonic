import { redirect } from "next/navigation";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { createClient, getUserId } from "@/lib/supabase/server";

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
      .limit(6),
  ]);

  const firstName = profile?.full_name?.split(" ")[0] ?? "";

  return <ChatWindow firstName={firstName} accounts={accounts ?? []} transactions={transactions ?? []} />;
}
