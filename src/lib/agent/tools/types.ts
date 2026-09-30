import type { z } from "zod";
import type { createClient } from "@/lib/supabase/server";

export type ToolContext = {
  /** Supabase client acting as the signed-in user — RLS applies. */
  supabase: Awaited<ReturnType<typeof createClient>>;
  /** Verified from the session. NEVER take a user id from the LLM or the client. */
  userId: string;
};

/** Returned by tools that need the human to approve before anything happens. */
export type PendingAction = {
  id: string;
  type: string;
  summary: string;
};

export type ToolResult = {
  /** Data sent back to the LLM. */
  data: unknown;
  /** Set when the tool created an action awaiting confirmation. */
  pendingAction?: PendingAction;
};

export type Tool<S extends z.ZodType = z.ZodType> = {
  name: string;
  /** Shown to the LLM — explain when to use it. */
  description: string;
  /** Arguments schema. Also validated at runtime before `run`. */
  schema: S;
  run(args: z.infer<S>, ctx: ToolContext): Promise<ToolResult>;
};

export function defineTool<S extends z.ZodType>(tool: Tool<S>): Tool<S> {
  return tool;
}
