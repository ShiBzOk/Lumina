// Walks over the edge list. Pure, and fast enough to run on every click, so
// nothing here is ever behind a spinner or a request.

import type { Edge } from "../../parser/types.ts";

/** "dependents" follows edges backwards (who imports this), "dependencies" forwards (what this imports). */
export type WalkDirection = "dependents" | "dependencies";

/** Two levels answers the question; deeper returns most of the repository and stops being an answer. */
export const DEFAULT_DEPTH = 2;
/** The depths someone can pick. Past three the walk is most of the repository on any real codebase. */
export const DEPTHS = [1, 2, 3] as const;

export interface Adjacency {
  out: ReadonlyMap<string, readonly string[]>;
  in: ReadonlyMap<string, readonly string[]>;
}

export function adjacency(edges: readonly Edge[]): Adjacency {
  const out = new Map<string, string[]>();
  const into = new Map<string, string[]>();
  for (const e of edges) {
    out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
    into.set(e.to, [...(into.get(e.to) ?? []), e.from]);
  }
  return { out, in: into };
}

export interface Reached {
  path: string;
  /** 1 for a direct neighbour, 2 for a neighbour's neighbour, and so on. */
  depth: number;
}

/**
 * Blast radius and dependency chain are this one walk in opposite directions.
 * Breadth first, so each file is reported at the shortest distance it is
 * reached by, and the start file is never in its own result.
 */
export function walk(graph: Adjacency, start: string, direction: WalkDirection, depth = DEFAULT_DEPTH): Reached[] {
  const next = direction === "dependents" ? graph.in : graph.out;
  const seen = new Set([start]);
  const reached: Reached[] = [];
  let frontier = [start];
  for (let d = 1; d <= depth && frontier.length > 0; d++) {
    const level: string[] = [];
    for (const p of frontier) {
      for (const q of next.get(p) ?? []) {
        if (seen.has(q)) continue;
        seen.add(q);
        level.push(q);
      }
    }
    level.sort();
    for (const path of level) reached.push({ path, depth: d });
    frontier = level;
  }
  return reached;
}
