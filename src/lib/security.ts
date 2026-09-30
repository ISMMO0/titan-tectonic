import "server-only";
import { NextResponse } from "next/server";
import { createClient, getUserId } from "@/lib/supabase/server";

// CSRF protection for cookie-authenticated route handlers:
// reject state-changing requests coming from another origin.
function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// Naive in-memory rate limiter (per server instance). Good enough for a demo;
// swap for Redis/Upstash if we scale to several instances.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit = 20, windowMs = 60_000) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Standard guard for every API route:
 * same-origin check → verified user → rate limit.
 * Returns the user-scoped Supabase client + userId, or an error response.
 */
export async function requireUser(request: Request, opts: { rateLimit?: number } = {}) {
  if (request.method !== "GET" && !isSameOrigin(request)) {
    return { error: jsonError("Forbidden", 403) } as const;
  }
  const supabase = await createClient();
  const userId = await getUserId(supabase);
  if (!userId) {
    return { error: jsonError("Unauthorized", 401) } as const;
  }
  if (opts.rateLimit && !rateLimit(`${new URL(request.url).pathname}:${userId}`, opts.rateLimit)) {
    return { error: jsonError("Too many requests", 429) } as const;
  }
  return { supabase, userId } as const;
}
