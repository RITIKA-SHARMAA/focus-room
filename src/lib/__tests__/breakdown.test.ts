import { describe, expect, it } from "vitest";
import { breakdownRequestSchema, buildUserPrompt, modelChain, normalize, parseGeminiResponse } from "../breakdown";

const gemini = (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }] });

describe("breakdown request validation", () => {
  it("accepts a normal request and fills the default session length", () => {
    const r = breakdownRequestSchema.parse({ task: "  Write my thesis intro  " });
    expect(r).toEqual({ task: "Write my thesis intro", focusMin: 25 });
  });

  it("rejects tasks that are too short or too long", () => {
    expect(breakdownRequestSchema.safeParse({ task: "hi" }).success).toBe(false);
    expect(breakdownRequestSchema.safeParse({ task: "x".repeat(201) }).success).toBe(false);
  });

  it("includes the time budget in the prompt when given", () => {
    const p = buildUserPrompt({ task: "Study", minutes: 120, focusMin: 25 });
    expect(p).toContain("Task: Study");
    expect(p).toContain("4 focus sessions");
  });
});

describe("normalize (the guardrails around the model)", () => {
  it("keeps a well-formed plan and totals the sessions", () => {
    const plan = normalize({
      steps: [
        { title: "Read chapter 3", pomodoros: 2 },
        { title: "Make notes", pomodoros: 1 },
      ],
    });
    expect(plan).toEqual({
      steps: [
        { title: "Read chapter 3", pomodoros: 2 },
        { title: "Make notes", pomodoros: 1 },
      ],
      totalPomodoros: 3,
    });
  });

  it("clamps session counts into 1..4 and rounds them", () => {
    const plan = normalize({
      steps: [
        { title: "A step", pomodoros: 9 },
        { title: "B step", pomodoros: 0 },
        { title: "C step", pomodoros: 2.6 },
      ],
    });
    expect(plan.steps.map((s) => s.pomodoros)).toEqual([4, 1, 3]);
  });

  it("strips list markers, trims, capitalises and drops duplicates", () => {
    const plan = normalize({
      steps: [
        { title: "1. outline the essay", pomodoros: 1 },
        { title: "- Outline the essay", pomodoros: 1 },
        { title: "  • draft   intro ", pomodoros: 1 },
      ],
    });
    expect(plan.steps.map((s) => s.title)).toEqual(["Outline the essay", "Draft intro"]);
  });

  it("caps the plan at 8 steps and long titles at 80 characters", () => {
    const steps = Array.from({ length: 12 }, (_, i) => ({ title: `Step number ${i} ` + "x".repeat(100), pomodoros: 1 }));
    const plan = normalize({ steps });
    expect(plan.steps).toHaveLength(8);
    expect(plan.steps[0].title.length).toBeLessThanOrEqual(80);
    expect(plan.steps[0].title.endsWith("…")).toBe(true);
  });

  it("accepts numbers sent as strings", () => {
    expect(
      normalize({
        steps: [
          { title: "One", pomodoros: "2" },
          { title: "Two", pomodoros: "1" },
        ],
      }).totalPomodoros,
    ).toBe(3);
  });

  it("rejects plans with fewer than 2 usable steps", () => {
    expect(() => normalize({ steps: [{ title: "Only one", pomodoros: 1 }] })).toThrow();
    expect(() =>
      normalize({
        steps: [
          { title: "Same", pomodoros: 1 },
          { title: "same", pomodoros: 1 },
        ],
      }),
    ).toThrow();
  });

  it("rejects responses with the wrong shape", () => {
    expect(() => normalize({ tasks: [] })).toThrow();
    expect(() => normalize("not json")).toThrow();
  });
});

describe("parseGeminiResponse", () => {
  it("reads JSON from the first candidate", () => {
    const body = gemini(
      JSON.stringify({
        steps: [
          { title: "Plan", pomodoros: 1 },
          { title: "Do", pomodoros: 2 },
        ],
      }),
    );
    expect(parseGeminiResponse(body).totalPomodoros).toBe(3);
  });

  it("tolerates a ```json code fence", () => {
    const body = gemini('```json\n{"steps":[{"title":"Plan","pomodoros":1},{"title":"Do","pomodoros":1}]}\n```');
    expect(parseGeminiResponse(body).steps).toHaveLength(2);
  });

  it("throws on an empty or blocked response", () => {
    expect(() => parseGeminiResponse({ candidates: [] })).toThrow("Empty response");
    expect(() => parseGeminiResponse({})).toThrow();
  });

  it("ignores thought parts from thinking models", () => {
    const body = {
      candidates: [
        {
          content: {
            parts: [
              { text: "Let me plan this...", thought: true },
              { text: '{"steps":[{"title":"Plan","pomodoros":1},{"title":"Do","pomodoros":1}]}' },
            ],
          },
        },
      ],
    };
    expect(parseGeminiResponse(body).steps).toHaveLength(2);
  });

  it("explains why a response was empty", () => {
    expect(() => parseGeminiResponse({ candidates: [{ finishReason: "SAFETY", content: { parts: [] } }] })).toThrow("SAFETY");
  });

  it("throws on malformed JSON", () => {
    expect(() => parseGeminiResponse(gemini("{steps: oops"))).toThrow();
  });
});

describe("modelChain", () => {
  it("uses the default model then the fallbacks", () => {
    expect(modelChain({})).toEqual(["gemini-flash-lite-latest", "gemini-flash-latest", "gemini-2.5-flash"]);
  });

  it("lets env override both, trimming and de-duplicating", () => {
    expect(modelChain({ GEMINI_MODEL: "gemini-2.5-flash", GEMINI_FALLBACK_MODELS: " gemini-2.5-flash , gemini-x " })).toEqual([
      "gemini-2.5-flash",
      "gemini-x",
    ]);
  });

  it("an empty fallback list turns fallbacks off", () => {
    expect(modelChain({ GEMINI_FALLBACK_MODELS: "" })).toEqual(["gemini-flash-lite-latest"]);
  });
});
