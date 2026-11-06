import { Client } from "langsmith";
import type { ExperimentResultRow } from "langsmith/evaluation";
import type { Run } from "langsmith/schemas";
import { tracing } from "../lib/ai/client.ts";

// What the evals share: the LangSmith client that reads traces and writes
// datasets, and the real explanation calls read back out of the traces.

if (!tracing) {
  // Every eval reads or writes LangSmith. Without it there is nothing to score
  // and nowhere to put a score, so this stops rather than reporting zero.
  throw new Error("Tracing is off: set LANGSMITH_TRACING=true and LANGSMITH_API_KEY in .env.local");
}

export const langsmith = new Client();
export const project = process.env.LANGSMITH_PROJECT?.trim() || "default";

export interface RealExplanation {
  runId: string;
  url: string;
  kind: "file" | "folder";
  /** The file path or folder the explanation is about. */
  subject: string;
  /** Exactly the text the model was handed: the user message of the call. */
  input: string;
  answer: string;
}

/**
 * The most recent model calls made inside "explain file" and "explain folder"
 * runs, newest first. Cache hits made no model call, so they aren't here: the
 * call that produced a cached answer is.
 */
export async function recentExplanations(limit: number, only?: "file" | "folder"): Promise<RealExplanation[]> {
  const names = only ? [`explain ${only}`] : ["explain file", "explain folder"];
  const out: RealExplanation[] = [];
  for await (const run of langsmith.listRuns({
    projectName: project,
    runType: "llm",
    error: false,
    traceFilter: names.length === 1 ? `eq(name, "${names[0]}")` : `or(${names.map((n) => `eq(name, "${n}")`).join(", ")})`,
    limit,
  })) {
    out.push(await readExplanation(run));
    if (out.length >= limit) break;
  }
  return out;
}

async function readExplanation(run: Run): Promise<RealExplanation> {
  const fail = (what: string) => new Error(`Run ${run.id} doesn't look like an explanation call: ${what}`);
  const messages: unknown = run.inputs.messages;
  if (!Array.isArray(messages)) throw fail("no messages in its inputs");
  const user: unknown = messages.find((m: unknown) => typeof m === "object" && m !== null && Reflect.get(m, "role") === "user");
  const input: unknown = typeof user === "object" && user !== null ? Reflect.get(user, "content") : undefined;
  if (typeof input !== "string") throw fail("no user message");

  const choices: unknown = run.outputs?.choices;
  const first: unknown = Array.isArray(choices) ? choices[0] : undefined;
  const message: unknown = typeof first === "object" && first !== null ? Reflect.get(first, "message") : undefined;
  const answer: unknown = typeof message === "object" && message !== null ? Reflect.get(message, "content") : undefined;
  if (typeof answer !== "string") throw fail("no answer in its outputs");

  const file = /^File: `([^`]+)`/m.exec(input);
  const folder = /^Folder: `([^`]+)`/m.exec(input);
  if (!file && !folder) throw fail("its input names no file or folder");
  return {
    runId: run.id,
    url: await langsmith.getRunUrl({ run }),
    kind: file ? "file" : "folder",
    subject: (file ?? folder)?.[1] ?? "",
    input,
    answer: answer.trim(),
  };
}

/** Creates a dataset, refusing to touch one that exists unless asked to replace it. */
export async function freshDataset(name: string, description: string, replace: boolean): Promise<string> {
  if (await langsmith.hasDataset({ datasetName: name })) {
    if (!replace) throw new Error(`Dataset "${name}" already exists. Pass --replace to delete it and its experiments and build it again.`);
    await langsmith.deleteDataset({ datasetName: name });
  }
  const dataset = await langsmith.createDataset(name, { description });
  return dataset.id;
}

export function flag(name: string): boolean {
  return process.argv.includes(name);
}

export function option(name: string, fallback: number): number {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  const value = Number(process.argv[i + 1]);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} takes a whole number, got "${process.argv[i + 1] ?? ""}"`);
  return value;
}

export function percent(n: number, of: number): string {
  return of === 0 ? "n/a" : `${((100 * n) / of).toFixed(1)}%`;
}

/**
 * Stops when any example's target threw. LangSmith records a failed call as a
 * row with no output, and its evaluators then score it 0, so a broken run
 * would otherwise print as a confident, terrible result.
 */
export function requireNoErrors(experiment: string, rows: readonly ExperimentResultRow[]): void {
  const failed = rows.filter((r) => r.run.error);
  if (failed.length > 0) {
    throw new Error(`${failed.length} of ${rows.length} calls in ${experiment} failed, so it has no score. First error: ${String(failed[0].run.error).slice(0, 300)}`);
  }
}
