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
    expect(JSON.parse(init.body).generationConfig.responseMimeType).toBe("application/json");
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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 500 })));
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
