import { createHash } from "node:crypto";
import { getCurrentRunTree, traceable } from "langsmith/traceable";
import { wrapOpenAI } from "langsmith/wrappers";
import OpenAI from "openai";
import { env } from "@/lib/env";

// The only place the AI client is constructed. Anything built elsewhere would
// call the model without a trace, and nothing would say so.

/** A dated snapshot, never a moving alias. It is part of every cache key. */
export const MODEL = "gpt-5-mini-2025-08-07";

export const ai = wrapOpenAI(new OpenAI({ apiKey: env.openaiKey }));

export const tracing = env.tracing;

export interface Cached<T> {
  value: T;
  /** True when the answer came from the cache and no model was called. */
  cached: boolean;
}

/**
 * A traced call whose cache read happens inside the trace. A hit is still a
 * recorded run, just one with no model call under it, which is the only way
 * to tell a working cache from one that never hits.
 */
export function cachedCall<Input, T>(
  name: string,
  steps: {
    read: (input: Input) => Promise<T | null>;
    generate: (input: Input) => Promise<T>;
    write: (input: Input, value: T) => Promise<void>;
  },
): (input: Input) => Promise<Cached<T>> {
  return async (input) => {
    let result: Cached<T> | undefined;
    await traced(name, input, async () => {
      const hit = await steps.read(input);
      result = hit !== null ? { value: hit, cached: true } : { value: await steps.generate(input), cached: false };
      if (!result.cached) await steps.write(input, result.value);
      return result;
    });
    if (!result) throw new Error(`${name} finished without an answer`);
    return result;
  };
}

/**
 * The same, for many items in one call: each item is cached on its own, and
 * only the misses go to the model. A batch of hits is a run with no model call.
 */
export function cachedBatch<Item, T>(
  name: string,
  steps: {
    /** One entry per item, undefined for a miss. */
    read: (items: Item[]) => Promise<(T | undefined)[]>;
    /** One answer per miss, in order. */
    generate: (misses: Item[]) => Promise<T[]>;
    write: (misses: Item[], values: T[]) => Promise<void>;
  },
): (items: Item[]) => Promise<{ values: T[]; cached: number }> {
  return async (items) => {
    let result: { values: T[]; cached: number } | undefined;
    await traced(name, items, async () => {
      const found = await steps.read(items);
      const misses = items.filter((_, i) => found[i] === undefined);
      const generated = misses.length > 0 ? await steps.generate(misses) : [];
      if (generated.length !== misses.length) throw new Error(`${name} answered ${generated.length} of ${misses.length} items`);
      if (misses.length > 0) await steps.write(misses, generated);
      let next = 0;
      result = { values: found.map((v) => (v === undefined ? generated[next++] : v)), cached: items.length - misses.length };
      return result;
    });
    if (!result) throw new Error(`${name} finished without an answer`);
    return result;
  };
}

// The traced run itself. Its types are concrete because langsmith's wrapper
// type can't be resolved over a generic; the typed answer leaves through the
// caller's closure, and the run records the same answer as its output.
// The input passes through the wrapper so the run records it.
function traced(name: string, input: unknown, body: (input: unknown) => Promise<unknown>): Promise<unknown> {
  return traceable(async (recorded: unknown) => body(recorded), { name, run_type: "chain", metadata: { model: MODEL } })(input);
}

/**
 * Scores the traced run this code is running inside, so a live evaluator's
 * result sits on the real call it judged. Untraced there is no run to score.
 *
 * Not awaited. Inside the app the write took one to three seconds, and the
 * explanation sat waiting for it after the model had already answered. The
 * server is a long-running process, so the write finishes on its own. One that
 * fails is logged, not thrown: the user's answer is already made.
 */
export function scoreCurrentRun(key: string, score: number, comment: string): void {
  const run = getCurrentRunTree(true);
  if (!tracing || !run) return;
  run.client.createFeedback(run.id, key, { score, comment }).catch((error: unknown) => {
    console.error(`Could not record ${key} on run ${run.id}:`, error);
  });
}

/** A cache key: the hash of everything that decides the answer. The model is keyed separately. */
export function cacheKey(parts: unknown): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}
