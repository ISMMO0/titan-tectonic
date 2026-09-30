import { redirect } from "next/navigation";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { createClient, getUserId } from "@/lib/supabase/server";

// Chat-only home: Titan is the whole app. The balance in the top bar
// refreshes after every confirmed action.
export default async function HomePage() {
  const supabase = await createClient();
  const userId = await getUserId(supabase);
  if (!userId) redirect("/login");

  const [{ data: profile }, { data: accounts }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("accounts").select("id, type, name, balance").order("type"),
  ]);

  const firstName = profile?.full_name?.split(" ")[0] ?? "";

  return <ChatWindow firstName={firstName} accounts={accounts ?? []} />;
}
