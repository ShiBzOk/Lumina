// The view a map address carries, and back. Pure: reading checks every named
// thing against the analysis already in the browser, so restoring a view is
// arithmetic, never a request, and a link can only ever select what it named.

import { DEFAULT_DEPTH, DEPTHS, type WalkDirection } from "./graph.ts";
import type { Selection } from "./highlight.ts";

export type PaneTab = "structure" | "explanation";

export interface View {
  selection: Selection;
  tab: PaneTab;
  /** Blast radius or dependency chain, shown for a selected file. */
  walk: WalkDirection | null;
  depth: number;
  compact: boolean;
  /** Card id → the first file row it shows. Zero is the default and is never stored. */
  scroll: ReadonlyMap<string, number>;
  /** The base analysis while Compare is on; the head is the analysis in the path. */
  compare: string | null;
}

export const DEFAULT_VIEW: View = {
  selection: null,
  tab: "structure",
  walk: null,
  depth: DEFAULT_DEPTH,
  compact: false,
  scroll: new Map(),
  compare: null,
};

/** What a named thing is checked against: the analysis the address opened. */
export interface ViewBounds {
  files: ReadonlySet<string>;
  /** Card id → the furthest its file list can scroll. */
  folders: ReadonlyMap<string, number>;
  /** Analyses this one may be compared against. */
  comparable: ReadonlySet<string>;
}

/** Something the address named that this analysis doesn't have. */
export type Missing =
  | { kind: "file"; path: string }
  | { kind: "folder"; id: string }
  | { kind: "compare"; id: string };

/** Search params as Next hands them to a page. */
export type Address = Readonly<Record<string, string | readonly string[] | undefined>>;

const WALK_NAMES: Record<string, WalkDirection> = { blast: "dependents", chain: "dependencies" };
const WALK_PARAM: Record<WalkDirection, string> = { dependents: "blast", dependencies: "chain" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCROLL = /^(.+):([1-9]\d{0,5})$/;

/** A parameter named once. Repeated or empty is malformed, so it counts as absent. */
function one(address: Address, key: string): string | null {
  const v = address[key];
  if (typeof v === "string") return v === "" ? null : v;
  return null;
}

function many(address: Address, key: string): readonly string[] {
  const v = address[key];
  return v === undefined ? [] : typeof v === "string" ? [v] : v;
}

/**
 * Reads an address. Never throws: anything malformed is dropped, and anything
 * well formed that this analysis doesn't hold is reported rather than matched
 * to something near it.
 */
export function readView(address: Address, bounds: ViewBounds): { view: View; missing: Missing[] } {
  const missing: Missing[] = [];

  const file = one(address, "file");
  const folder = one(address, "folder");
  let selection: Selection = null;
  // Naming both is not one selection, so neither is taken.
  if (file !== null && folder === null) {
    if (bounds.files.has(file)) selection = { kind: "file", path: file };
    else missing.push({ kind: "file", path: file });
  } else if (folder !== null && file === null) {
    if (bounds.folders.has(folder)) selection = { kind: "node", id: folder };
    else missing.push({ kind: "folder", id: folder });
  }

  const tab: PaneTab = one(address, "tab") === "explanation" ? "explanation" : "structure";

  // A walk belongs to a selected file; without one there is nothing it walks from.
  const walkName = one(address, "walk");
  const walk = selection?.kind === "file" && walkName !== null && Object.hasOwn(WALK_NAMES, walkName) ? WALK_NAMES[walkName] : null;
  const depthValue = Number(one(address, "depth"));
  const depth = walk !== null && DEPTHS.some((d) => d === depthValue) ? depthValue : DEFAULT_DEPTH;

  const compact = one(address, "compact") === "1";

  const scroll = new Map<string, number>();
  for (const entry of many(address, "scroll")) {
    const m = SCROLL.exec(entry);
    if (!m) continue;
    const [, id, at] = m;
    const max = bounds.folders.get(id);
    if (max === undefined) {
      if (!missing.some((x) => x.kind === "folder" && x.id === id)) missing.push({ kind: "folder", id });
      continue;
    }
    // Past the end is not a place that card can be, so it is not guessed at.
    if (Number(at) <= max && !scroll.has(id)) scroll.set(id, Number(at));
  }

  const compareId = one(address, "compare");
  let compare: string | null = null;
  if (compareId !== null && UUID.test(compareId)) {
    if (bounds.comparable.has(compareId)) compare = compareId;
    else missing.push({ kind: "compare", id: compareId });
  }

  return { view: { selection, tab, walk, depth, compact, scroll, compare }, missing };
}

// Slashes and colons are left readable: a path in the address should look like a path.
function encode(value: string): string {
  return encodeURIComponent(value).replace(/%2F/g, "/").replace(/%3A/g, ":").replace(/%40/g, "@");
}

/** One parameter of the query, with what it stands for if it has to be left out. */
interface Part {
  text: string;
  /** Scroll positions go first when an address is too long; the rest go together. */
  scrollOf?: string;
}

function parts(view: View): Part[] {
  const out: Part[] = [];
  if (view.compare !== null) out.push({ text: `compare=${encode(view.compare)}` });
  if (view.selection?.kind === "file") out.push({ text: `file=${encode(view.selection.path)}` });
  if (view.selection?.kind === "node") out.push({ text: `folder=${encode(view.selection.id)}` });
  if (view.tab !== DEFAULT_VIEW.tab) out.push({ text: `tab=${view.tab}` });
  if (view.selection?.kind === "file" && view.walk !== null) {
    out.push({ text: `walk=${WALK_PARAM[view.walk]}` });
    if (view.depth !== DEFAULT_DEPTH) out.push({ text: `depth=${view.depth}` });
  }
  if (view.compact) out.push({ text: "compact=1" });
  const scrolled = [...view.scroll].filter(([, at]) => at > 0).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  for (const [id, at] of scrolled) out.push({ text: `scroll=${encode(id)}:${at}`, scrollOf: id });
  return out;
}

const join = (ps: readonly Part[]) => (ps.length === 0 ? "" : `?${ps.map((p) => p.text).join("&")}`);

/** The query string for a view, holding only what differs from the default. */
export function writeView(view: View): string {
  return join(parts(view));
}

/**
 * The address for Copy link, kept under `limit` characters. Scroll positions
 * are left out first, last card first; if that isn't enough, the whole view
 * goes and only the analysis remains. Whatever is left out is said, never
 * dropped quietly.
 */
export function shareAddress(base: string, view: View, limit: number): { url: string; leftOut: string[] } {
  const all = parts(view);
  const kept = [...all];
  const leftOut: string[] = [];
  while (base.length + join(kept).length > limit) {
    const i = kept.findLastIndex((p) => p.scrollOf !== undefined);
    if (i === -1) break;
    const id = kept[i].scrollOf;
    leftOut.unshift(`the scroll position of ${id === "." ? "the root folder" : id}`);
    kept.splice(i, 1);
  }
  if (base.length + join(kept).length > limit) {
    return { url: base, leftOut: ["the whole view: only the analysis itself is linked"] };
  }
  return { url: base + join(kept), leftOut };
}
