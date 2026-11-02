// Counts the numbers the phase 4 acceptance check asks for, from the same pure
// functions the canvas uses. Exits non-zero if any of them fails.
//
//   pnpm parse <repo-dir> --out result.json
//   node scripts/check-map.ts <result.json>

import path from "node:path";
import { MAX_NODES } from "../lib/map/fold.ts";
import { buildMap } from "../lib/map/model.ts";
import { readParseResult } from "../parser/io.ts";

if (!process.argv[2]) {
  console.error("Usage: node scripts/check-map.ts <result.json>");
  process.exit(2);
}
const file = path.resolve(process.argv[2]);
const result = readParseResult(file);
const map = buildMap(result.files, result.edges);

const sizes = map.nodes.map((n) => n.files.length);
const singles = map.nodes.filter((n) => n.files.length < 2);
const rows = new Set(map.nodes.flatMap((n) => n.files.map((f) => f.path)));
const dangling = result.edges.filter((e) => !rows.has(e.from) || !rows.has(e.to));
const unplaced = map.nodes.filter((n) => !map.positions.has(n.id));
const again = buildMap(result.files, result.edges);
const deterministic = JSON.stringify([...map.positions]) === JSON.stringify([...again.positions]);

console.log(`${result.files.length} files, ${result.edges.length} edges, folded at threshold ${map.threshold}\n`);
console.log(`1. nodes: ${map.nodes.length} (limit ${MAX_NODES}), one per ${(result.files.length / map.nodes.length).toFixed(1)} files`);
console.log(`2. files per node: min ${Math.min(...sizes)}, max ${Math.max(...sizes)}; single-file nodes: ${singles.length}`);
console.log(`3. edges ending on a file row that exists: ${result.edges.length - dangling.length} of ${result.edges.length}`);
for (const e of dangling.slice(0, 10)) console.log(`   dangling ${e.from} → ${e.to}`);
console.log(`   nodes without a position: ${unplaced.length}; layout identical on a second run: ${deterministic ? "yes" : "NO"}`);
console.log("");
for (const n of map.nodes) console.log(`   ${String(n.files.length).padStart(4)}  ${n.label.padEnd(28)} ${n.id}`);

const ok = map.nodes.length <= MAX_NODES && singles.length === 0 && dangling.length === 0 && unplaced.length === 0 && deterministic;
process.exitCode = ok ? 0 : 1;
