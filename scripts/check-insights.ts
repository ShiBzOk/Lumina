// Prints what the insights panel and the two walks will show for a parse
// result, and proves every reported loop against the raw edge list. Exits
// non-zero if a loop names an edge that isn't there.
//
//   node scripts/check-insights.ts [fixtures/preview/result.json] [file to walk from]

import path from "node:path";
import { adjacency, walk } from "../lib/map/graph.ts";
import { findInsights, LONG_FILE_LINES } from "../lib/map/insights.ts";
import { readParseResult } from "../parser/io.ts";

const file = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, "../fixtures/preview/result.json"));
const result = readParseResult(file);
const insights = findInsights(result.files, result.edges, result.adapter);
const edgeSet = new Set(result.edges.map((e) => `${e.from}\0${e.to}`));

console.log(`${result.files.length} files, ${result.edges.length} edges, adapter "${result.adapter}"\n`);

console.log(
  insights.notImported === null
    ? "nothing imports: withheld (no adapter, entry points can't be told apart)"
    : `nothing imports: ${insights.notImported.length}`,
);

console.log(`heavily imported (fan-in > ${insights.heavyThreshold}): ${insights.heavilyImported.length}`);
for (const f of insights.heavilyImported) console.log(`   ${String(f.fanIn).padStart(4)}  ${f.path}`);

let broken = 0;
console.log(`cycles: ${insights.cycles.length}`);
for (const loop of insights.cycles) {
  const closed = [...loop, loop[0]];
  const missing = closed.slice(1).filter((to, i) => !edgeSet.has(`${closed[i]}\0${to}`));
  broken += missing.length;
  console.log(`   ${missing.length === 0 ? "ok " : "BAD"} ${closed.join(" → ")}`);
}

console.log(`longer than ${LONG_FILE_LINES} lines: ${insights.long.length}`);
for (const f of insights.long) console.log(`   ${String(f.lines).padStart(5)}  ${f.path}`);

const start = process.argv[3] ?? insights.heavilyImported[0]?.path;
if (start) {
  const graph = adjacency(result.edges);
  for (const direction of ["dependents", "dependencies"] as const) {
    const t0 = performance.now();
    const reached = walk(graph, start, direction);
    const ms = (performance.now() - t0).toFixed(2);
    const at = (d: number) => reached.filter((r) => r.depth === d).length;
    console.log(`\n${direction} of ${start}: ${reached.length} (depth 1: ${at(1)}, depth 2: ${at(2)}) in ${ms} ms`);
  }
}

process.exitCode = broken === 0 ? 0 : 1;
