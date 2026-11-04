// Draws Lumina's own map for the landing page: this repository, parsed by the
// same parser and laid out by the same functions as any other. The page shows
// what this writes, so nothing on it is drawn or counted by hand.
//
//   pnpm landing:map

import { writeFileSync } from "node:fs";
import path from "node:path";
import { ADAPTERS } from "../adapters/index.ts";
import { highlight, type Direction } from "../lib/map/highlight.ts";
import { CARD_WIDTH, HEADER_HEIGHT, LIST_PADDING, MAX_VISIBLE_ROWS, ROW_HEIGHT, cardHeight, edgePath, layout } from "../lib/map/layout.ts";
import { buildMap } from "../lib/map/model.ts";
import { parseRepository } from "../parser/parse.ts";
import type { ResolutionStatus } from "../parser/types.ts";

// The file the hero shows selected: the data layer, with a few files on each
// side of it, so both directions read at a glance.
const FOCUS = "lib/analyses.ts";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "components/landing/self-map-data.ts");

const result = parseRepository(root, ADAPTERS);
const map = buildMap(result.files, result.edges, new Map());

if (!map.nodeOf.has(FOCUS)) {
  console.error(`${FOCUS} isn't in the parse result; pick another FOCUS.`);
  process.exit(1);
}

// Exactly what the canvas lights when FOCUS is clicked: its direct
// neighbours, and the cards holding them, showing only the lit rows.
const lit = highlight(map, { kind: "file", path: FOCUS });
if (!lit) throw new Error("A file selection always lights something.");

const cards = map.nodes
  .filter((n) => lit.nodes.has(n.id))
  .map((n) => ({ node: n, rows: n.files.filter((f) => lit.files.has(f.path)).slice(0, MAX_VISIBLE_ROWS) }));
const at = layout(
  cards.map((c) => ({ id: c.node.id, height: cardHeight(c.rows.length) })),
  map.edges.flatMap((e, i) => (lit.edges.has(i) ? [{ from: e.fromNode, to: e.toNode }] : [])),
);

const slotOf = new Map(cards.flatMap((c) => c.rows.map((r, i) => [r.path, i] as const)));
const nodes = cards.flatMap(({ node, rows }) => {
  const p = at.get(node.id);
  if (!p) return [];
  return [
    {
      id: node.id,
      label: node.label,
      total: node.files.length,
      x: p.x,
      y: p.y,
      rows: rows.map((r) => ({
        label: r.label,
        type: r.type,
        fanIn: r.fanIn,
        fanOut: r.fanOut,
        selected: r.path === FOCUS,
        left: lit.handles.get(r.path)?.left ?? null,
        right: lit.handles.get(r.path)?.right ?? null,
      })),
    },
  ];
});

const edges = map.edges.flatMap((e, i) => {
  const direction: Direction | undefined = lit.edges.get(i);
  const a = at.get(e.fromNode);
  const b = at.get(e.toNode);
  if (!direction || !a || !b) return [];
  const d = edgePath(a, b, slotOf.get(e.from) ?? null, slotOf.get(e.to) ?? null, e.fromNode === e.toNode);
  return [{ d, direction }];
});

const width = Math.max(...nodes.map((n) => n.x)) + CARD_WIDTH;
const height = Math.max(...cards.map((c) => (at.get(c.node.id)?.y ?? 0) + cardHeight(c.rows.length)));

const c = result.coverage;
const imports: Record<ResolutionStatus, number> = { internal: 0, external: 0, excluded: 0, unresolved: 0 };
for (const i of result.imports) imports[i.resolution.status]++;
const excluded = Map.groupBy(c.excludedPaths, (e) => e.reason);
const roles = Map.groupBy(result.files.filter((f) => f.role), (f) => f.role ?? "");

const data = {
  focus: {
    file: FOCUS,
    width,
    height,
    card: { width: CARD_WIDTH, header: HEADER_HEIGHT, row: ROW_HEIGHT, padding: LIST_PADDING },
    nodes,
    edges,
  },
  coverage: {
    adapter: result.adapter,
    found: c.filesFound,
    parsed: c.filesParsed,
    skipped: c.filesSkipped,
    excluded: [...excluded].map(([reason, list]) => ({ reason, count: list.length })),
    edges: result.edges.length,
    imports,
    roles: [...roles].map(([role, list]) => ({ role, count: list.length })).toSorted((a, b) => b.count - a.count),
  },
};
// TypeScript rather than JSON so directions and file types keep their literal
// types, and the page needs no casts to use them.
const header = "// Written by `pnpm landing:map` from a real parse of this repository. Don't edit by hand.\n\n";
writeFileSync(out, `${header}export const SELF_MAP = ${JSON.stringify(data, null, 2)} as const;\n`);

console.log(`${c.filesParsed} of ${c.filesFound} files parsed, ${c.filesSkipped} skipped, ${result.edges.length} edges`);
console.log(`imports: ${Object.entries(imports).map(([k, v]) => `${k} ${v}`).join(", ")}`);
console.log(`${FOCUS}: ${nodes.length} cards, ${edges.length} edges (${edges.filter((e) => e.direction === "in").length} in), ${Math.round(width)}×${Math.round(height)}`);
console.log(`Wrote ${path.relative(root, out)}`);
