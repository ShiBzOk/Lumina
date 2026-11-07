// What changed in the structure between two analyses of one repository. Pure:
// two file lists, two edge lists and the coverage reports that say what each
// parse left out. Nothing here reads a database or asks a model.

import type { Coverage, Edge, RepoFile } from "../../parser/types.ts";
import { adjacency, DEFAULT_DEPTH, walk } from "./graph.ts";

export type CompareSide = "base" | "head";

/** One analysis, as much of it as a comparison needs. */
export interface ComparedAnalysis {
  adapter: string;
  files: readonly RepoFile[];
  edges: readonly Edge[];
  coverage: Pick<Coverage, "skipped" | "excludedPaths">;
}

/**
 * A path on one side only, for a reason that isn't it being added or removed:
 * the parse skipped or excluded it there, or it is an asset, which is only
 * on a map while something imports it.
 */
export interface Absent {
  path: string;
  /** The side it is missing from. */
  missingFrom: CompareSide;
  kind: "skipped" | "excluded" | "asset";
  /** Why, in the coverage report's own words where it has any. */
  reason: string;
}

export interface EdgePair {
  from: string;
  to: string;
}

/** An edge on one side only whose absence on the other is down to a file that wasn't parsed there. */
export interface UncomparedEdge extends EdgePair {
  missingFrom: CompareSide;
  /** The end that wasn't parsed on that side. */
  because: string;
}

export interface BlastChange {
  path: string;
  before: number;
  after: number;
  joined: string[];
  left: string[];
}

export interface Comparison {
  adapters: { base: string; head: string };
  filesAdded: string[];
  filesRemoved: string[];
  absent: Absent[];
  edgesAdded: EdgePair[];
  edgesRemoved: EdgePair[];
  edgesUncompared: UncomparedEdge[];
  /** In both, with a different content hash. */
  contentChanged: string[];
  /** In both, at the depth the map walks by default. */
  blastRadius: BlastChange[];
}

export function isUnchanged(c: Comparison): boolean {
  return (
    c.filesAdded.length === 0 &&
    c.filesRemoved.length === 0 &&
    c.absent.length === 0 &&
    c.edgesAdded.length === 0 &&
    c.edgesRemoved.length === 0 &&
    c.edgesUncompared.length === 0 &&
    c.contentChanged.length === 0 &&
    c.blastRadius.length === 0
  );
}

// Why a path the other side has is missing from this one, if the coverage
// report accounts for it. Excluded entries can be directories, so a path under
// one is covered by it.
function notParsed(path: string, coverage: ComparedAnalysis["coverage"]): Pick<Absent, "kind" | "reason"> | null {
  const skipped = coverage.skipped.find((s) => s.path === path);
  if (skipped) return { kind: "skipped", reason: `skipped, ${skipped.reason}: ${skipped.detail}` };
  const excluded = coverage.excludedPaths.find((e) => path === e.path || path.startsWith(`${e.path}/`));
  if (excluded) {
    const where = excluded.path === path ? "" : ` (${excluded.path}/)`;
    return { kind: "excluded", reason: `excluded, ${excluded.reason}${where}: ${excluded.detail}` };
  }
  return null;
}

const pairKey = (e: EdgePair) => `${e.from}\u0000${e.to}`;
const byPath = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byPair = (a: EdgePair, b: EdgePair) => byPath(a.from, b.from) || byPath(a.to, b.to);

export function compareAnalyses(base: ComparedAnalysis, head: ComparedAnalysis): Comparison {
  const baseFiles = new Map(base.files.map((f) => [f.path, f]));
  const headFiles = new Map(head.files.map((f) => [f.path, f]));

  const filesAdded: string[] = [];
  const filesRemoved: string[] = [];
  const absent: Absent[] = [];
  // Only skipped and excluded files leave an edge unknowable; an asset nothing
  // imports any more is exactly an edge that went away.
  const unparsed = { base: new Set<string>(), head: new Set<string>() };

  const oneSided = (path: string, file: RepoFile, missingFrom: CompareSide, coverage: ComparedAnalysis["coverage"], into: string[]) => {
    const why = notParsed(path, coverage);
    if (why) {
      absent.push({ path, missingFrom, ...why });
      unparsed[missingFrom].add(path);
    } else if (file.kind === "asset") {
      // Never parsed on either side, so its absence says nothing about the file itself.
      absent.push({ path, missingFrom, kind: "asset", reason: `asset, on the map only while imported; nothing imports it in ${missingFrom}` });
    } else {
      into.push(path);
    }
  };
  for (const [path, file] of headFiles) if (!baseFiles.has(path)) oneSided(path, file, "base", base.coverage, filesAdded);
  for (const [path, file] of baseFiles) if (!headFiles.has(path)) oneSided(path, file, "head", head.coverage, filesRemoved);

  const contentChanged = [...headFiles.values()].filter((f) => {
    const before = baseFiles.get(f.path);
    return before !== undefined && before.sha256 !== f.sha256;
  });

  const baseEdges = new Map(base.edges.map((e) => [pairKey(e), e]));
  const headEdges = new Map(head.edges.map((e) => [pairKey(e), e]));
  const edgesAdded: EdgePair[] = [];
  const edgesRemoved: EdgePair[] = [];
  const edgesUncompared: UncomparedEdge[] = [];
  const oneSidedEdge = (e: Edge, missingFrom: CompareSide, into: EdgePair[]) => {
    const because = [e.from, e.to].find((p) => unparsed[missingFrom].has(p));
    if (because) edgesUncompared.push({ from: e.from, to: e.to, missingFrom, because });
    else into.push({ from: e.from, to: e.to });
  };
  for (const [key, e] of headEdges) if (!baseEdges.has(key)) oneSidedEdge(e, "base", edgesAdded);
  for (const [key, e] of baseEdges) if (!headEdges.has(key)) oneSidedEdge(e, "head", edgesRemoved);

  // The same walk the pane shows for one file, over each side's edges. A file
  // only on one side has no before or after, so it is not in this list.
  const baseGraph = adjacency(base.edges);
  const headGraph = adjacency(head.edges);
  const blastRadius: BlastChange[] = [];
  for (const path of headFiles.keys()) {
    if (!baseFiles.has(path)) continue;
    const before = new Set(walk(baseGraph, path, "dependents", DEFAULT_DEPTH).map((r) => r.path));
    const after = new Set(walk(headGraph, path, "dependents", DEFAULT_DEPTH).map((r) => r.path));
    const joined = [...after].filter((p) => !before.has(p));
    const left = [...before].filter((p) => !after.has(p));
    if (joined.length === 0 && left.length === 0) continue;
    blastRadius.push({ path, before: before.size, after: after.size, joined: joined.sort(byPath), left: left.sort(byPath) });
  }

  return {
    adapters: { base: base.adapter, head: head.adapter },
    filesAdded: filesAdded.sort(byPath),
    filesRemoved: filesRemoved.sort(byPath),
    absent: absent.sort((a, b) => byPath(a.path, b.path)),
    edgesAdded: edgesAdded.sort(byPair),
    edgesRemoved: edgesRemoved.sort(byPair),
    edgesUncompared: edgesUncompared.sort(byPair),
    contentChanged: contentChanged.map((f) => f.path).sort(byPath),
    blastRadius: blastRadius.sort((a, b) => byPath(a.path, b.path)),
  };
}
