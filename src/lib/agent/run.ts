import "server-only";
import { z } from "zod";
import type { Content, FunctionDeclaration, Part } from "@google/genai";
import { gemini, withRetry } from "@/lib/llm/gemini";
import { systemPrompt } from "./prompt";
import { tools, toolsByName } from "./tools";
import type { PendingAction, ToolContext } from "./tools/types";

export type ChatMessage = { role: "user" | "assistant"; content: string };

const MAX_STEPS = 5;

const functionDeclarations: FunctionDeclaration[] = tools.map((t) => ({
  name: t.name,
  description: t.description,
  parametersJsonSchema: z.toJSONSchema(t.schema, { io: "input" }),
}));

async function callTool(name: string, args: unknown, ctx: ToolContext) {
  const tool = toolsByName.get(name);
  if (!tool) return { data: { error: `Unknown tool ${name}` } };

  const parsed = tool.schema.safeParse(args ?? {});
  if (!parsed.success) return { data: { error: "Invalid arguments", issues: z.treeifyError(parsed.error) } };

  try {
    return await tool.run(parsed.data, ctx);
  } catch (err) {
    console.error(`[agent] tool ${name} failed`, err);
    return { data: { error: "Tool failed. Tell the user something went wrong." } };
  }
}

/** Runs the agent loop: LLM ↔ tools until the LLM answers in text. */
export async function runAgent(messages: ChatMessage[], ctx: ToolContext) {
  const { client, model } = gemini();

  const { data: profile } = await ctx.supabase
    .from("profiles")
    .select("full_name, risk_level, goals")
    .eq("id", ctx.userId)
    .single();

  const contents: Content[] = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const pendingActions: PendingAction[] = [];
  const toolsUsed: string[] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await withRetry(() =>
      client.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: systemPrompt(profile ?? { full_name: "", risk_level: "medium", goals: [] }),
          tools: [{ functionDeclarations }],
        },
      }),
    );

    const calls = response.functionCalls ?? [];
    if (calls.length === 0) {
      await ctx.supabase.from("agent_logs").insert({
        user_id: ctx.userId,
        event: "agent_reply",
        details: { tools: toolsUsed, pending_actions: pendingActions.map((a) => a.id) },
      });
      return { reply: response.text ?? "", pendingActions };
    }

    contents.push(
      response.candidates?.[0]?.content ?? { role: "model", parts: calls.map((c) => ({ functionCall: c })) },
    );

    const results: Part[] = [];
    for (const call of calls) {
      const name = call.name ?? "";
      toolsUsed.push(name);
      const result = await callTool(name, call.args, ctx);
      if (result.pendingAction) pendingActions.push(result.pendingAction);
      results.push({ functionResponse: { id: call.id, name, response: { result: result.data } } });
    }
    contents.push({ role: "user", parts: results });
  }

  return { reply: "Sorry, I couldn't finish that. Could you rephrase?", pendingActions };
}
