import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const req = (body: unknown, ip = "1.2.3.4") =>
  new Request("http://localhost/api/breakdown", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const geminiOk = (steps: unknown) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ steps }) }] } }] }), { status: 200 });

describe("POST /api/breakdown", () => {
  beforeEach(() => {
    vi.resetModules(); // fresh rate limiter per test
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns a normalized plan from the model", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      geminiOk([
        { title: "outline", pomodoros: 1 },
        { title: "Draft", pomodoros: 7 },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("../route");
    const res = await POST(req({ task: "Write the essay", minutes: 60 }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.steps).toEqual([
      { title: "Outline", pomodoros: 1 },
      { title: "Draft", pomodoros: 4 },
    ]);
    // The key goes in a header, never in the URL.
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain("test-key");
    expect(init.headers["x-goog-api-key"]).toBe("test-key");
    const sent = JSON.parse(init.body).generationConfig;
    expect(sent.responseMimeType).toBe("application/json");
    // The default lite model keeps its own (minimal) thinking level.
    expect(sent.thinkingConfig).toBeUndefined();
  });

  it("asks full Flash models for a low thinking level", async () => {
    vi.stubEnv("GEMINI_MODEL", "gemini-flash-latest");
    const fetchMock = vi.fn().mockResolvedValue(
      geminiOk([
        { title: "Outline", pomodoros: 1 },
        { title: "Draft", pomodoros: 2 },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("../route");
    await POST(req({ task: "Write the essay" }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).generationConfig.thinkingConfig).toEqual({ thinkingLevel: "low" });
  });

  it("retries without thinkingConfig if the model rejects it", async () => {
    vi.stubEnv("GEMINI_MODEL", "gemini-flash-latest");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"error":{"message":"Invalid value at thinking_config.thinking_level"}}', { status: 400 }))
      .mockResolvedValueOnce(
        geminiOk([
          { title: "Outline", pomodoros: 1 },
          { title: "Draft", pomodoros: 2 },
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("../route");
    const res = await POST(req({ task: "Write the essay" }));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).generationConfig.thinkingConfig).toBeUndefined();
  });

  it("does not retry other 400 errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"error":{"message":"API key not valid"}}', { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("../route");
    expect((await POST(req({ task: "Write the essay" }))).status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the next model when the first is overloaded", async () => {
    const busy = '{"error":{"code":503,"message":"This model is currently experiencing high demand."}}';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(busy, { status: 503 }))
      .mockResolvedValueOnce(
        geminiOk([
          { title: "Outline", pomodoros: 1 },
          { title: "Draft", pomodoros: 2 },
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { POST } = await import("../route");
    const res = await POST(req({ task: "Write the essay" }));
    expect(res.status).toBe(200);
    expect((await res.json()).model).toBe("gemini-flash-latest");
    expect(String(fetchMock.mock.calls[0][0])).toContain("gemini-flash-lite-latest:");
    expect(String(fetchMock.mock.calls[1][0])).toContain("gemini-flash-latest:");
  });

  it("503 ai_busy when every model is overloaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => new Response("{}", { status: 503 })),
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { POST } = await import("../route");
    const res = await POST(req({ task: "Write the essay" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "ai_busy" });
  });

  it("moves on to the next model when one is too slow", async () => {
    const err = new Error("The operation was aborted due to timeout");
    err.name = "TimeoutError";
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce(
        geminiOk([
          { title: "Outline", pomodoros: 1 },
          { title: "Draft", pomodoros: 2 },
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { POST } = await import("../route");
    const res = await POST(req({ task: "Write the essay" }));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("504 with a timeout code when every model is too slow", async () => {
    const err = new Error("The operation was aborted due to timeout");
    err.name = "TimeoutError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(err));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { POST } = await import("../route");
    const res = await POST(req({ task: "Study for exam" }));
    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({ error: "ai_timeout" });
  });

  it("400 on invalid input, without calling the model", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("../route");
    expect((await POST(req({ task: "x" }))).status).toBe(400);
    expect((await POST(req("not json"))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("503 when no API key is configured", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const { POST } = await import("../route");
    const res = await POST(req({ task: "Study for exam" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "ai_unavailable" });
  });

  it("502 when the model returns something unusable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiOk([{ title: "Just one", pomodoros: 1 }])));
    const { POST } = await import("../route");
    expect((await POST(req({ task: "Study for exam" }))).status).toBe(502);
  });

  it("502 when the upstream call fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => new Response("boom", { status: 500 })),
    );
    const { POST } = await import("../route");
    expect((await POST(req({ task: "Study for exam" }))).status).toBe(502);
  });

  it("429 after 8 requests from the same visitor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () =>
        geminiOk([
          { title: "Alpha", pomodoros: 1 },
          { title: "Beta", pomodoros: 1 },
        ]),
      ),
    );
    const { POST } = await import("../route");
    for (let i = 0; i < 8; i++) expect((await POST(req({ task: "Study for exam" }))).status).toBe(200);
    const res = await POST(req({ task: "Study for exam" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect((await POST(req({ task: "Study for exam" }, "9.9.9.9"))).status).toBe(200);
  });
});
