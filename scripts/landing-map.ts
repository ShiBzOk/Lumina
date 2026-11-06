// Lumina's own numbers for the landing page: this repository, parsed by the
// same parser as any other. The page shows what this writes, so nothing on it
// is counted by hand.
//
//   pnpm landing:map

import { writeFileSync } from "node:fs";
import path from "node:path";
import { ADAPTERS } from "../adapters/index.ts";
import { parseRepository } from "../parser/parse.ts";
import type { ResolutionStatus } from "../parser/types.ts";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "components/landing/self-map-data.ts");

const result = parseRepository(root, ADAPTERS);

const c = result.coverage;
const imports: Record<ResolutionStatus, number> = { internal: 0, external: 0, excluded: 0, unresolved: 0 };
for (const i of result.imports) imports[i.resolution.status]++;
const excluded = Map.groupBy(c.excludedPaths, (e) => e.reason);
const roles = Map.groupBy(result.files.filter((f) => f.role), (f) => f.role ?? "");

const data = {
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
// TypeScript rather than JSON so the page imports it typed, with no casts.
const header = "// Written by `pnpm landing:map` from a real parse of this repository. Don't edit by hand.\n\n";
writeFileSync(out, `${header}export const SELF_MAP = ${JSON.stringify(data, null, 2)} as const;\n`);

console.log(`${c.filesParsed} of ${c.filesFound} files parsed, ${c.filesSkipped} skipped, ${result.edges.length} edges`);
console.log(`imports: ${Object.entries(imports).map(([k, v]) => `${k} ${v}`).join(", ")}`);
console.log(`Wrote ${path.relative(root, out)}`);
