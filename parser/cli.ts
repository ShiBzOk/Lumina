import path from "node:path";
import { ADAPTERS } from "../adapters/index.ts";
import { readParseResult, writeParseResult } from "./io.ts";
import { parseRepository } from "./parse.ts";
import type { ParseResult, StatusCounts } from "./types.ts";

const USAGE = `Usage:
  pnpm parse <directory> [--out <file.json>]   parse a directory, print what was found, optionally write it out
  pnpm parse --read <file.json>                read a written result back through the contract and print it`;

function main(argv: string[]): number {
  const read = flag(argv, "--read");
  const out = flag(argv, "--out");
  const dir = argv.find((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));

  if (read) {
    const result = readParseResult(path.resolve(read));
    console.log(`Read ${read} back through the contract.\n`);
    return report(result);
  }
  if (!dir) {
    console.error(USAGE);
    return 2;
  }

  const started = performance.now();
  const result = parseRepository(dir, ADAPTERS);
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(`Parsed ${result.root} in ${seconds}s (adapter: ${result.adapter})\n`);
  const status = report(result);
  if (out) {
    writeParseResult(path.resolve(out), result);
    console.log(`\nWrote ${out}`);
  }
  return status;
}

function report(r: ParseResult): number {
  const c = r.coverage;
  const sums = c.filesParsed + c.filesSkipped === c.filesFound;
  const nodes = new Set(r.files.map((f) => f.path));
  const dangling = r.edges.filter((e) => !nodes.has(e.from) || !nodes.has(e.to));
  const strayRoutes = [...r.routes, ...r.routesWithheld].filter((x) => !nodes.has(x.file));

  section("Files");
  console.log(`  found ${c.filesFound}  parsed ${c.filesParsed}  skipped ${c.filesSkipped}  ${sums ? "(adds up)" : "(DOES NOT ADD UP)"}`);
  for (const s of c.skipped) console.log(`  skipped ${s.path}: ${s.reason}, ${s.detail}`);
  for (const s of c.syntaxErrors) console.log(`  parsed with ${s.count} syntax error(s): ${s.path}`);
  console.log(`  asset nodes ${c.assetFiles}  total nodes ${r.files.length}`);
  console.log(`  distinct folders ${new Set(r.files.map((f) => f.folder)).size}  packages ${new Set(r.files.flatMap((f) => f.package ?? [])).size}`);

  section("Excluded paths");
  const byReason = Map.groupBy(c.excludedPaths, (e) => e.reason);
  for (const [reason, entries] of byReason) {
    const shown = entries.slice(0, 8).map((e) => e.path).join(", ");
    console.log(`  ${reason} ${entries.length}: ${shown}${entries.length > 8 ? ", …" : ""}`);
  }

  section("Imports");
  console.log(`  ${"kind".padEnd(16)}${["found", "internal", "external", "excluded", "unresolved"].map((h) => h.padStart(11)).join("")}`);
  row("all", c.imports);
  for (const [kind, counts] of Object.entries(c.importsByKind)) row(kind, counts);

  section("Edges");
  console.log(`  ${r.edges.length} edges after removing duplicate file pairs`);
  console.log(`  every edge points at a node: ${dangling.length === 0 ? "yes" : `NO, ${dangling.length} do not`}`);

  section(`Roles (adapter: ${r.adapter})`);
  const roles = Map.groupBy(r.files.filter((f) => f.role !== null), (f) => f.role);
  if (roles.size === 0) console.log("  none");
  for (const [role, files] of roles) console.log(`  ${String(role).padEnd(14)}${String(files.length).padStart(6)}`);
  console.log(`  ${"no role".padEnd(14)}${String(r.files.length - [...roles.values()].reduce((n, f) => n + f.length, 0)).padStart(6)}`);

  section("Routes");
  console.log(`  ${r.routes.length} extracted, ${r.routesWithheld.length} withheld`);
  console.log(`  every route names a node: ${strayRoutes.length === 0 ? "yes" : `NO, ${strayRoutes.length} do not`}`);
  for (const x of r.routes) console.log(`  ${x.method.padEnd(8)}${x.pattern.padEnd(48)} ${x.file}:${x.line}`);
  for (const x of r.routesWithheld) console.log(`  withheld ${x.file}:${x.line}  ${x.reason}`);

  section("Unresolved");
  if (c.unresolved.length === 0) console.log("  none");
  for (const g of c.unresolved) {
    console.log(`  ${g.reason}: ${g.count}`);
    for (const x of g.examples) console.log(`    ${x.from}:${x.line}  "${x.specifier}"  ${x.detail}`);
  }

  if (c.configProblems.length > 0) {
    section("Config problems");
    for (const p of c.configProblems) console.log(`  ${p}`);
  }

  // A result that breaks its own invariants must not look like a success.
  return sums && dangling.length === 0 && strayRoutes.length === 0 ? 0 : 1;
}

function row(label: string, s: StatusCounts): void {
  const cells = [s.found, s.internal, s.external, s.excluded, s.unresolved].map((n) => String(n).padStart(11));
  console.log(`  ${label.padEnd(16)}${cells.join("")}`);
}

function section(title: string): void {
  console.log(`\n${title}`);
}

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

process.exitCode = main(process.argv.slice(2));
