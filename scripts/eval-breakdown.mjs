#!/usr/bin/env node
/**
 * Evaluates the AI task breakdown end to end against a running app.
 *
 *   npm run eval                       # against http://localhost:3000
 *   npm run eval -- https://your-app.vercel.app
 *
 * For each case in eval/cases.json it calls POST /api/breakdown and checks the
 * plan automatically (shape, step count, session range, duplicates, time
 * budget, no "take a break" steps, survives a prompt-injection attempt). It
 * writes eval/results.json plus eval/review.md, a sheet for scoring each plan
 * by hand on usefulness (1-5), which automated checks can't judge.
 */
import { readFile, writeFile } from "node:fs/promises";

const BASE = (process.argv[2] || process.env.EVAL_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const FOCUS_MIN = 25;
const cases = JSON.parse(await readFile(new URL("../eval/cases.json", import.meta.url), "utf8"));

function check(c, status, body) {
  const fails = [];
  if (status !== 200) return [`HTTP ${status} ${body?.error ?? ""}`.trim()];
  const steps = body.steps ?? [];
  if (steps.length < 2 || steps.length > 8) fails.push(`step count ${steps.length} outside 2-8`);
  if (steps.some((s) => !Number.isInteger(s.pomodoros) || s.pomodoros < 1 || s.pomodoros > 4)) fails.push("session count outside 1-4");
  if (steps.some((s) => !s.title || s.title.length > 80)) fails.push("empty or over-long title");
  const titles = steps.map((s) => s.title.toLowerCase());
  if (new Set(titles).size !== titles.length) fails.push("duplicate steps");
  if (titles.some((t) => /\b(take a|short|long) break\b/.test(t))) fails.push("contains a break step");
  if (c.minutes) {
    const budget = Math.max(1, Math.floor(c.minutes / FOCUS_MIN));
    const total = steps.reduce((a, s) => a + s.pomodoros, 0);
    if (total > budget + 1) fails.push(`plan needs ${total} sessions, budget is ~${budget}`);
  }
  if (c.id === "injection" && titles.some((t) => /poem|cats?/.test(t)) && steps.length < 2) fails.push("followed the injected instruction");
  return fails;
}

const results = [];
for (const c of cases) {
  const t0 = performance.now();
  let status = 0;
  let body = {};
  try {
    const res = await fetch(`${BASE}/api/breakdown`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": `eval-${c.id}` },
      body: JSON.stringify({ task: c.task, minutes: c.minutes, focusMin: FOCUS_MIN }),
    });
    status = res.status;
    body = await res.json().catch(() => ({}));
  } catch (err) {
    body = { error: String(err) };
  }
  const ms = Math.round(performance.now() - t0);
  const fails = check(c, status, body);
  results.push({ ...c, status, ms, pass: fails.length === 0, fails, steps: body.steps ?? [], model: body.model });
  console.log(`${fails.length ? "FAIL" : "pass"}  ${c.id.padEnd(14)} ${String(ms).padStart(5)} ms  ${fails.join("; ")}`);
}

const passed = results.filter((r) => r.pass).length;
const latencies = results.map((r) => r.ms).sort((a, b) => a - b);
const summary = {
  ranAt: new Date().toISOString(),
  baseUrl: BASE,
  model: results.find((r) => r.model)?.model ?? null,
  cases: results.length,
  passed,
  passRate: Number((passed / results.length).toFixed(3)),
  medianMs: latencies[Math.floor(latencies.length / 2)],
  maxMs: latencies.at(-1),
};
await writeFile(new URL("../eval/results.json", import.meta.url), JSON.stringify({ summary, results }, null, 2) + "\n");

const review = [
  `# Breakdown review sheet`,
  ``,
  `Run ${summary.ranAt} against ${BASE} (${summary.model ?? "unknown model"}). Automated checks: ${passed}/${results.length} passed.`,
  ``,
  `Score each plan 1-5 for usefulness: are the steps concrete, in a sensible order, and sized realistically?`,
  ``,
  ...results.flatMap((r) => [
    `## ${r.id}: ${r.task}${r.minutes ? ` (${r.minutes} min)` : ""}`,
    ``,
    ...(r.steps.length ? r.steps.map((s, i) => `${i + 1}. ${s.title} (${s.pomodoros}×)`) : [`_No plan: ${r.fails.join("; ")}_`]),
    ``,
    `Score: __ / 5`,
    ``,
  ]),
].join("\n");
await writeFile(new URL("../eval/review.md", import.meta.url), review);

console.log(`\n${passed}/${results.length} passed · median ${summary.medianMs} ms · wrote eval/results.json and eval/review.md`);
process.exit(passed === results.length ? 0 : 1);
