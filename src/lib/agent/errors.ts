/** Return actionable public messages without exposing raw provider responses or keys. */
export function agentFailure(error: unknown) {
  const failure = error as { status?: number; message?: string } | null;
  if (failure?.status === 429)
    return {
      status: 503,
      message:
        "Google's AI quota is unavailable for this project's API key. Ask the team to configure a Gemini key with available quota; account data remains accessible.",
    };
  if (failure?.status === 401 || failure?.status === 403)
    return {
      status: 503,
      message:
        "Google rejected the AI credentials or permissions. Check the Gemini API key configured on this machine.",
    };
  if (failure?.message?.includes("GEMINI_API_KEY"))
    return { status: 503, message: "This machine needs a Gemini API key before AI chat can run." };
  return { status: 503, message: "The agent is unavailable right now. Please try again shortly." };
}
