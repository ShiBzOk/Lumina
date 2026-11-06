// Prompt versions. The current file-explanation prompt and the retired one,
// run over the same dataset of real inputs as two separate experiments, so
// LangSmith shows them side by side and this prints the difference.
//
//   pnpm eval:prompts build [--limit 30] [--replace]   dataset from recent real file explanations
//   pnpm eval:prompts [run]                            both experiments, scored, compared
//
// Two scores, and they are not equally hard:
// - no_invented_paths is exact. Set membership, the same code that runs live.
// - judged_specific is a model's opinion. "Specific enough to be useful" has
//   no exact answer, so a judge is unavoidable, and its number is softer than
//   the first: a different judge, or the same one on another day, could move it.

import { createHash } from "node:crypto";
import { evaluate } from "langsmith/evaluation";
import { ai, MODEL } from "../lib/ai/client.ts";
import { complete, FILE_PROMPT } from "../lib/ai/explain.ts";
import { inventedPaths } from "../lib/ai/invented-paths.ts";
import { freshDataset, flag, langsmith, option, percent, recentExplanations, requireNoErrors } from "./langsmith.ts";
import { RETIRED_FILE_PROMPT } from "./retired-prompt.ts";

const DATASET = "lumina-file-explanations";

// A larger model than the one judged, pinned like every model here, so the
// explainer isn't marking its own work.
const JUDGE_MODEL = "gpt-5-2025-08-07";

const JUDGE_PROMPT = `You judge one explanation of a source file, written for a developer reading a dependency map of the repository.

You get exactly what the explainer was given (the file's path, its neighbour lists and its source) and the explanation it wrote.

Answer one question: is the explanation specific enough to be useful? Specific means a developer learns things about this file they couldn't guess from its name: what it actually does, and what its named neighbours take from it or give it. Not specific means generic statements that would fit many files, restating the path, or vague words like "handles logic" or "various utilities".

Ignore formatting entirely: some explanations use markdown and some are plain prose. Ignore length unless it hides the content. Don't reward claims that aren't supported by the source.`;

async function build(): Promise<void> {
  const limit = option("--limit", 30);
  // Read more than needed: the same file explained twice is one example.
  const runs = await recentExplanations(limit * 3, "file");
  const seen = new Set<string>();
  const examples = runs.filter((r) => {
    const hash = createHash("sha256").update(r.input).digest("hex");
    if (seen.has(hash)) return false;
    seen.add(hash);
    return true;
  }).slice(0, limit);
  if (examples.length === 0) throw new Error("No file explanations in the traces yet. Explain a few files in the app first.");

  const datasetId = await freshDataset(DATASET, "The exact inputs of real file explanations, read from the traces. No reference answers: each prompt is scored on its own output.", flag("--replace"));
  await langsmith.createExamples(
    examples.map((e) => ({ dataset_id: datasetId, inputs: { input: e.input }, metadata: { subject: e.subject, source_run: e.runId } })),
  );
  console.log(`Uploaded ${examples.length} real file explanation inputs to the "${DATASET}" dataset`);
  if (examples.length < 20) console.log(`That's few: one example moves a score by ${(100 / examples.length).toFixed(0)} points. Explain more files and rebuild with --replace.`);
}

interface Judgement {
  specific: boolean;
  reasoning: string;
}

async function judge(input: string, answer: string): Promise<Judgement> {
  const completion = await ai.chat.completions.create({
    model: JUDGE_MODEL,
    reasoning_effort: "low",
    messages: [
      { role: "developer", content: JUDGE_PROMPT },
      { role: "user", content: `What the explainer was given:\n\n${input}\n\n---\n\nThe explanation:\n\n${answer}` },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "judgement",
        strict: true,
        schema: {
          type: "object",
          properties: { reasoning: { type: "string" }, specific: { type: "boolean" } },
          required: ["reasoning", "specific"],
          additionalProperties: false,
        },
      },
    },
  });
  const content = completion.choices[0]?.message.content;
  if (!content) throw new Error(`The judge returned nothing (finish reason: ${completion.choices[0]?.finish_reason ?? "none"})`);
  const parsed: unknown = JSON.parse(content);
  const specific: unknown = typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "specific") : undefined;
  const reasoning: unknown = typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "reasoning") : undefined;
  if (typeof specific !== "boolean" || typeof reasoning !== "string") throw new Error(`The judge's answer isn't a judgement: ${content.slice(0, 200)}`);
  return { specific, reasoning };
}

const text = (v: unknown, what: string): string => {
  if (typeof v !== "string") throw new Error(`Expected ${what} to be text, got ${JSON.stringify(v)?.slice(0, 100)}`);
  return v;
};

type Scores = Map<string, number[]>;

async function experiment(version: "current" | "retired", prompt: string): Promise<{ name: string; scores: Scores; n: number }> {
  const results = await evaluate(
    async (inputs: Record<string, unknown>) => ({ answer: await complete(prompt, text(inputs.input, "the example input")) }),
    {
      data: DATASET,
      evaluators: [
        ({ inputs, outputs }: { inputs: Record<string, unknown>; outputs: Record<string, unknown> }) => {
          const invented = inventedPaths(text(inputs.input, "the example input"), text(outputs.answer, "the answer"));
          return { key: "no_invented_paths", score: invented.length === 0 ? 1 : 0, comment: invented.length === 0 ? "exact check: none" : `exact check: ${invented.join(", ")}` };
        },
        async ({ inputs, outputs }: { inputs: Record<string, unknown>; outputs: Record<string, unknown> }) => {
          const j = await judge(text(inputs.input, "the example input"), text(outputs.answer, "the answer"));
          return { key: "judged_specific", score: j.specific ? 1 : 0, comment: `model judge (${JUDGE_MODEL}): ${j.reasoning}` };
        },
      ],
      experimentPrefix: `explain-file-${version}`,
      description: `The ${version} file-explanation prompt. no_invented_paths is an exact check; judged_specific is ${JUDGE_MODEL}'s opinion.`,
      metadata: { prompt: version, model: MODEL, judge: JUDGE_MODEL },
      maxConcurrency: 4,
    },
  );
  requireNoErrors(results.experimentName, results.results);
  const scores: Scores = new Map();
  for (const row of results.results) {
    for (const r of row.evaluationResults.results) {
      if (typeof r.score !== "number" && typeof r.score !== "boolean") throw new Error(`${r.key} has no score on example ${row.example.id}`);
      scores.set(r.key, [...(scores.get(r.key) ?? []), Number(r.score)]);
    }
  }
  return { name: results.experimentName, scores, n: results.results.length };
}

async function run(): Promise<void> {
  // One after the other: the same examples, the same model, only the prompt differs.
  const current = await experiment("current", FILE_PROMPT);
  const retired = await experiment("retired", RETIRED_FILE_PROMPT);
  if (current.n === 0 || current.n !== retired.n) throw new Error(`The experiments scored ${current.n} and ${retired.n} examples; they must be the same, non-zero set`);

  const n = current.n;
  console.log(`\nPrompt versions over ${n} real file explanations (${MODEL}). One example is ${(100 / n).toFixed(1)} points.\n`);
  console.log(`  ${"".padEnd(20)} ${"current".padStart(15)} ${"retired".padStart(15)}   difference`);
  for (const key of ["no_invented_paths", "judged_specific"]) {
    const a = current.scores.get(key) ?? [];
    const b = retired.scores.get(key) ?? [];
    const sa = a.reduce((s, x) => s + x, 0);
    const sb = b.reduce((s, x) => s + x, 0);
    const diff = (100 * sa) / n - (100 * sb) / n;
    const cell = (s: number) => `${s}/${n} ${percent(s, n)}`.padStart(15);
    console.log(`  ${key.padEnd(20)} ${cell(sa)} ${cell(sb)}   ${diff >= 0 ? "+" : ""}${diff.toFixed(1)} points for current`);
  }
  console.log(`\n  no_invented_paths is exact: set membership against what each call was shown.`);
  console.log(`  judged_specific is ${JUDGE_MODEL}'s opinion, not a measurement. Read it as a direction, and a gap of a`);
  console.log(`  couple of examples as noise.`);
  console.log(`\nExperiments: ${current.name}, ${retired.name}`);
  console.log(`Compare them in LangSmith: Datasets & Experiments → ${DATASET} → select both → Compare.`);
}

// Running is the everyday case, so it needs no word; building replaces data and does.
// At the bottom so every helper above exists before the first await reaches it.
const command = process.argv[2] ?? "run";
if (command === "build") await build();
else if (command === "run") await run();
else {
  console.error("Usage: pnpm eval:prompts build [--limit 30] [--replace]\n       pnpm eval:prompts [run]");
  process.exitCode = 2;
}
