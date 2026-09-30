import { z } from "zod";
import { loadLifeMoments } from "../insights";
import { defineTool } from "./types";

export const detectLifeMomentsTool = defineTool({
  name: "detect_life_moments",
  description:
    "Detect what is happening in the user's life right now (upcoming trip, celebration, low balance, " +
    "salary received) with concrete suggestions. Use it to be proactive or when the user asks for advice.",
  schema: z.object({}),
  async run(_args, ctx) {
    return { data: { moments: await loadLifeMoments(ctx) } };
  },
});
