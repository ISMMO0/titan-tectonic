import { z } from "zod";
import { defineTool } from "./types";

// TODO(Phase 4 — proactive agent): use these events to suggest FX, travel
// insurance, gift savings… See PROJECT_PLAN.md.
export const getCalendarEvents = defineTool({
  name: "get_calendar_events",
  description:
    "Get the user's upcoming calendar events (trips, celebrations, bills). Only works if the user opted in.",
  schema: z.object({
    days_ahead: z.number().int().min(1).max(90).default(30),
  }),
  async run({ days_ahead }, { supabase, userId }) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("calendar_opt_in")
      .eq("id", userId)
      .single();
    if (!profile?.calendar_opt_in) {
      return { data: { error: "The user has not given calendar access." } };
    }

    const until = new Date(Date.now() + days_ahead * 86_400_000).toISOString();
    const { data, error } = await supabase
      .from("calendar_events")
      .select("title, location, starts_at, ends_at, kind")
      .gte("starts_at", new Date().toISOString())
      .lte("starts_at", until)
      .order("starts_at");
    if (error) throw error;
    return { data: { events: data } };
  },
});
