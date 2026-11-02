// Four facts about the edge list, and nothing a model had a hand in. Each kind
// has one fixed sentence; the files are the evidence, the sentence only names
// what they have in common.

import type { Edge, RepoFile } from "../../parser/types.ts";
import { adjacency, type Adjacency } from "./graph.ts";

/** Fixed rather than relative: "too long" should mean the same thing in every repository. */
export const LONG_FILE_LINES = 400;

export const INSIGHT_SENTENCES = {
  notImported: "Nothing in the repository imports these files.",
  heavilyImported: "Imported by far more files than most files here.",
  cycles: "These files import each other in a loop.",
  long: `Longer than ${LONG_FILE_LINES} lines.`,
} as const;

export interface Insights {
  /**
   * Files no edge points at, leaving out any file the framework adapter gave a
   * role: pages, routes and config are reached by the framework, not by
   * imports. Null when no adapter applied, because then entry points can't be
   * told apart from files nothing uses, and a list mixing the two would
   * present the parser's blind spot as a fact about the code.
   */
  notImported: RepoFile[] | null;
  /** Most imported first. */
  heavilyImported: RepoFile[];
  /** The fan-in a file has to exceed to be in heavilyImported. */
  heavyThreshold: number;
  /** Each a walkable loop: every file imports the next, and the last imports the first. */
  cycles: string[][];
  /** Longest first. */
  long: RepoFile[];
}

const byPath = (a: RepoFile, b: RepoFile) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

export function findInsights(files: readonly RepoFile[], edges: readonly Edge[], adapter: string): Insights {
  const graph = adjacency(edges);
  const fanIn = (f: RepoFile) => graph.in.get(f.path)?.length ?? 0;

  const heavyThreshold = upperFence(files.map(fanIn).filter((n) => n > 0));

  return {
    notImported: adapter === "none" ? null : files.filter((f) => fanIn(f) === 0 && f.role === null).sort(byPath),
    heavilyImported: files.filter((f) => fanIn(f) > heavyThreshold).sort((a, b) => fanIn(b) - fanIn(a) || byPath(a, b)),
    heavyThreshold,
    cycles: findCycles(files.map((f) => f.path), graph),
    long: files.filter((f) => (f.lines ?? 0) > LONG_FILE_LINES).sort((a, b) => (b.lines ?? 0) - (a.lines ?? 0) || byPath(a, b)),
  };
}

/**
 * "Unusual" is solved from the repository's own spread, not picked: Tukey's
 * far-out fence, Q3 + 3 × IQR, over the files that something imports at all.
 * Files nothing imports are left out of the spread, or they'd drag it to zero.
 * The inner 1.5 × fence was tried; fan-in is so skewed towards 1 that it let
 * a fifth of the imported files through, which is not "unusual".
 */
function upperFence(values: number[]): number {
  if (values.length === 0) return Infinity;
  const sorted = values.toSorted((a, b) => a - b);
  const q = (p: number) => {
    const i = (sorted.length - 1) * p;
    const lo = Math.floor(i);
    return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (i - lo);
  };
  return q(0.75) + 3 * (q(0.75) - q(0.25));
}

/**
 * Tarjan's strongly connected components, iterative so a long import chain
 * can't overflow the call stack. Every component with more than one file, or
 * a file importing itself, holds at least one loop; one concrete loop per
 * component is returned so it can be walked by hand.
 */
function findCycles(paths: readonly string[], graph: Adjacency): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];
  let counter = 0;

  for (const root of paths) {
    if (index.has(root)) continue;
    // Each frame is a file and how far through its imports the walk has got.
    const frames: { path: string; next: number }[] = [{ path: root, next: 0 }];
    index.set(root, counter);
    low.set(root, counter++);
    stack.push(root);
    onStack.add(root);

    while (frames.length > 0) {
      const frame = frames[frames.length - 1];
      const targets = graph.out.get(frame.path) ?? [];
      if (frame.next < targets.length) {
        const t = targets[frame.next++];
        if (!index.has(t)) {
          index.set(t, counter);
          low.set(t, counter++);
          stack.push(t);
          onStack.add(t);
          frames.push({ path: t, next: 0 });
        } else if (onStack.has(t)) {
          low.set(frame.path, Math.min(low.get(frame.path) ?? 0, index.get(t) ?? 0));
        }
        continue;
      }
      frames.pop();
      const parent = frames[frames.length - 1];
      if (parent) low.set(parent.path, Math.min(low.get(parent.path) ?? 0, low.get(frame.path) ?? 0));
      if (low.get(frame.path) === index.get(frame.path)) {
        const component: string[] = [];
        let p: string | undefined;
        do {
          p = stack.pop();
          if (p === undefined) break;
          onStack.delete(p);
          component.push(p);
        } while (p !== frame.path);
        components.push(component);
      }
    }
  }

  return components
    .filter((c) => c.length > 1 || (graph.out.get(c[0])?.includes(c[0]) ?? false))
    .map((c) => shortestLoop(c.toSorted()[0], new Set(c), graph))
    .sort((a, b) => a.length - b.length || (a[0] < b[0] ? -1 : 1));
}

/** The shortest loop from `start` back to itself, staying inside its component. */
function shortestLoop(start: string, members: ReadonlySet<string>, graph: Adjacency): string[] {
  const cameFrom = new Map<string, string>();
  let frontier = [start];
  while (frontier.length > 0) {
    const level: string[] = [];
    for (const p of frontier) {
      for (const q of graph.out.get(p) ?? []) {
        if (!members.has(q)) continue;
        if (q === start) {
          const loop = [p];
          for (let at = p; at !== start; ) {
            at = cameFrom.get(at) ?? start;
            loop.push(at);
          }
          return loop.reverse();
        }
        if (cameFrom.has(q)) continue;
        cameFrom.set(q, p);
        level.push(q);
      }
    }
    frontier = level;
  }
  // Unreachable for a real component; returning the start alone keeps the type honest.
  return [start];
}
