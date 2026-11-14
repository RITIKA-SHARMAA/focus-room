import {
  SYSTEM_PROMPT,
  breakdownRequestSchema,
  buildUserPrompt,
  geminiResponseSchema,
  parseGeminiResponse,
  type BreakdownErrorCode,
} from "@/lib/breakdown";
import { createRateLimiter } from "@/lib/rateLimit";

// 8 plans per visitor per 10 minutes, per server instance.
const limiter = createRateLimiter(8, 10 * 60_000);

const DEFAULT_MODEL = "gemini-flash-latest";
const TIMEOUT_MS = 20_000;

function fail(code: BreakdownErrorCode, status: number, headers?: HeadersInit) {
  return Response.json({ error: code }, { status, headers });
}

function clientKey(req: Request): string {
  // Vercel sets x-forwarded-for; the first address is the visitor.
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "anonymous";
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("invalid_input", 400);
  }
  const input = breakdownRequestSchema.safeParse(body);
  if (!input.success) return fail("invalid_input", 400);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fail("ai_unavailable", 503);

  const rl = limiter.check(clientKey(req));
  if (!rl.ok) return fail("rate_limited", 429, { "Retry-After": String(rl.retryAfterSec) });

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: buildUserPrompt(input.data) }] }],
        generationConfig: {
          temperature: 0.4,
          responseMimeType: "application/json",
          responseSchema: geminiResponseSchema,
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.status === 429) return fail("rate_limited", 429);
    if (!res.ok) {
      console.error("[breakdown] Gemini error", res.status, (await res.text()).slice(0, 500));
      return fail("ai_failed", 502);
    }

    const plan = parseGeminiResponse(await res.json());
    return Response.json({ ...plan, model });
  } catch (err) {
    console.error("[breakdown] failed:", err instanceof Error ? err.message : err);
    return fail("ai_failed", 502);
  }
}
