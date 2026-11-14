import {
  SYSTEM_PROMPT,
  breakdownRequestSchema,
  buildUserPrompt,
  modelChain,
  geminiResponseSchema,
  parseGeminiResponse,
  type BreakdownErrorCode,
  type BreakdownRequest,
} from "@/lib/breakdown";
import { createRateLimiter } from "@/lib/rateLimit";

// Let the Vercel function run long enough for a few model attempts.
export const maxDuration = 60;

// 8 plans per visitor per 10 minutes, per server instance.
const limiter = createRateLimiter(8, 10 * 60_000);

/** Total time for one request, across all model attempts. */
const TOTAL_MS = 45_000;
/** Time one model gets before we give up on it and try the next. */
const ATTEMPT_MS = 14_000;

function fail(code: BreakdownErrorCode, status: number, headers?: HeadersInit) {
  return Response.json({ error: code }, { status, headers });
}

function clientKey(req: Request): string {
  // Vercel sets x-forwarded-for; the first address is the visitor.
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "anonymous";
}

function isTimeout(err: unknown): boolean {
  return err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError" || /timeout|aborted/i.test(err.message));
}

/** Status codes that mean "this model can't serve right now", so the next model is worth trying. */
const TRY_NEXT = new Set([404, 500, 503, 504]);

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

  const deadline = Date.now() + TOTAL_MS;
  const models = modelChain();
  let sawBusy = false;
  let sawTimeout = false;

  for (const model of models) {
    const timeLeft = deadline - Date.now();
    if (timeLeft < 3000) break;
    const attemptDeadline = Date.now() + Math.min(ATTEMPT_MS, timeLeft);
    try {
      const res = await callModel(model, apiKey, input.data, attemptDeadline);

      if (res.ok) {
        const plan = parseGeminiResponse(await res.json());
        return Response.json({ ...plan, model });
      }
      if (res.status === 429) return fail("rate_limited", 429);

      const detail = (await res.text()).slice(0, 300);
      if (TRY_NEXT.has(res.status)) {
        // Overloaded ("high demand"), missing or erroring model: move down the chain.
        sawBusy ||= res.status === 503;
        console.warn(`[breakdown] ${model} returned ${res.status}, trying next model`, detail);
        continue;
      }
      console.error(`[breakdown] ${model} error ${res.status}`, detail);
      return fail("ai_failed", 502);
    } catch (err) {
      if (isTimeout(err)) {
        // A slow model (common under high demand) shouldn't use up the whole budget.
        sawTimeout = true;
        console.warn(`[breakdown] ${model} timed out after ${Math.round(ATTEMPT_MS / 1000)}s, trying next model`);
        continue;
      }
      console.error(`[breakdown] ${model} failed:`, err instanceof Error ? err.message : err);
      return fail("ai_failed", 502);
    }
  }
  if (sawBusy) return fail("ai_busy", 503);
  if (sawTimeout) return fail("ai_timeout", 504);
  return fail("ai_failed", 502);
}

/**
 * One model attempt. Full Flash models "think" before answering by default,
 * which made a simple plan take 20 s or more, so ask them for a low thinking
 * level. Lite models already default to minimal thinking, so leave them alone.
 * If a model rejects the setting, retry once without it.
 */
async function callModel(model: string, apiKey: string, input: BreakdownRequest, deadline: number): Promise<Response> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const send = (withThinking: boolean) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: buildUserPrompt(input) }] }],
        generationConfig: {
          temperature: 0.4,
          responseMimeType: "application/json",
          responseSchema: geminiResponseSchema,
          ...(withThinking ? { thinkingConfig: { thinkingLevel: "low" } } : {}),
        },
      }),
      signal: AbortSignal.timeout(Math.max(1000, deadline - Date.now())),
    });

  const res = await send(!/lite/i.test(model));
  if (res.status !== 400) return res;
  const text = await res.text();
  if (/thinking/i.test(text)) {
    console.warn(`[breakdown] ${model} rejected thinkingConfig, retrying without it`);
    return send(false);
  }
  // Re-wrap so the caller can still read the body.
  return new Response(text, { status: 400 });
}
