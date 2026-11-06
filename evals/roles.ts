// Role accuracy. Convention assigns roles it can be certain of, and those
// files never reach the model in normal operation, so they are a held-out set
// with real answers. The model is asked about them exactly as the pipeline
// asks about the files convention couldn't place, and its answer is compared.
//
//   pnpm eval:roles build [owner/name …] [--replace]   download, parse, upload the dataset
//   pnpm eval:roles [run]                               one experiment over it, with a percentage
//
// Only files whose conventional role is one the model may return are kept.
// Scoring it on page, route or controller, which it is forbidden to say,
// would measure nothing.
//
// The role is hidden from the path too. Convention found these files by their
// names (users.service.ts, models/, components/), and the files the model
// labels for real are exactly the ones whose names say nothing. Left in, the
// path hands over the answer and the score sits near 100% whatever the model
// does. So role words leave the file's folders, its dotted suffix and its
// import paths. The content is left exactly as it is: changing it would mean
// asking about a file that doesn't exist.

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { evaluate } from "langsmith/evaluation";
import { ADAPTERS } from "../adapters/index.ts";
import { MODEL } from "../lib/ai/client.ts";
import { askRoles, labelInputs, type LabelInput } from "../lib/ai/label.ts";
import { MODEL_ROLES, type ModelRole } from "../lib/map/frameworks.ts";
import { downloadArchive, parseRepoInput, resolveCommit, selectFiles } from "../lib/pipeline/github.ts";
import { parseRepository } from "../parser/parse.ts";
import { flag, freshDataset, langsmith, percent, requireNoErrors } from "./langsmith.ts";

const DATASET = "lumina-role-accuracy";

// One repository per framework whose convention yields model-sayable roles:
// React syntax gives components and hooks, NestJS suffixes give services and
// repositories, Express folders give services, models and config.
const DEFAULT_REPOS = ["shadcn-ui/taxonomy", "lujakob/nestjs-realworld-example-app", "hagopj13/node-express-boilerplate"];

// Per repository and role, so a repository with four hundred components
// doesn't turn the score into a score on components.
const PER_ROLE = 12;
const MIN_FILES = 30;

const isModelRole = (role: string | null): role is ModelRole => MODEL_ROLES.some((r) => r === role);

async function build(): Promise<void> {
  const named = process.argv.slice(3).filter((a) => !a.startsWith("--"));
  const repos = (named.length > 0 ? named : DEFAULT_REPOS).map((slug) => {
    const repo = parseRepoInput(slug);
    if (!repo) throw new Error(`"${slug}" is not owner/name`);
    return repo;
  });

  const examples: { inputs: LabelInput; outputs: { role: ModelRole }; metadata: Record<string, string> }[] = [];
  for (const repo of repos) {
    const slug = `${repo.owner}/${repo.name}`;
    const work = await fs.mkdtemp(path.join(os.tmpdir(), "lumina-eval-"));
    try {
      const commit = await resolveCommit(repo, null);
      const archive = path.join(work, "archive.tar.gz");
      await downloadArchive(repo, commit.sha, archive);
      const dir = path.join(work, "repo");
      await fs.mkdir(dir);
      await selectFiles(archive, dir);
      const result = parseRepository(dir, ADAPTERS);
      const roleOf = new Map(result.files.map((f) => [f.path, f.role]));
      const inputs = await labelInputs(dir, result, (f) => f.kind === "source" && isModelRole(f.role));

      const byRole = Map.groupBy(inputs, (i) => roleOf.get(i.path) ?? "");
      const kept: string[] = [];
      for (const [role, files] of [...byRole].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
        if (!isModelRole(role)) continue;
        const picked = spread(files.sort((a, b) => (a.path < b.path ? -1 : 1)), PER_ROLE);
        for (const input of picked) {
          examples.push({
            inputs: { ...input, path: mask(input.path), imports: input.imports.map(mask) },
            outputs: { role },
            metadata: { repo: slug, commit: commit.sha, adapter: result.adapter, path: input.path },
          });
        }
        kept.push(`${role} ${picked.length}${files.length > picked.length ? ` of ${files.length}` : ""}`);
      }
      console.log(`${slug}@${commit.sha.slice(0, 7)} (${result.adapter}): ${kept.length > 0 ? kept.join(", ") : "no files with a model-sayable conventional role"}`);
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  }

  if (examples.length < MIN_FILES) throw new Error(`Only ${examples.length} files qualified; the dataset needs at least ${MIN_FILES}. Name more repositories.`);
  const datasetId = await freshDataset(
    DATASET,
    "Files whose role convention assigned, limited to roles the model may return. The role is hidden from the model, role words are taken out of every path it sees, and its answer is compared.",
    flag("--replace"),
  );
  await langsmith.createExamples(examples.map((e) => ({ dataset_id: datasetId, ...e })));
  console.log(`\nUploaded ${examples.length} files to the "${DATASET}" dataset`);
}

// Every word convention reads a role from, in either number. Express folders,
// NestJS suffixes and the usual React folders all spell roles this way.
const ROLE_WORDS = new Set([
  ...MODEL_ROLES.flatMap((r) => [r, `${r}s`]),
  "repositories", "utilities", "utils", "configs", "configuration", "entity", "entities", "dto", "dtos", "schemas", "schema",
]);

/**
 * The path with every role word removed: a folder named for a role becomes
 * "x", and a role suffix leaves the file name (users.service.ts → users.ts,
 * models/user.model.js → x/user.js). A name that is nothing but a role word
 * becomes "x" too, keeping its extension.
 */
function mask(file: string): string {
  const parts = file.split("/");
  const base = parts.pop() ?? "";
  const folders = parts.map((p) => (ROLE_WORDS.has(p.toLowerCase()) ? "x" : p));
  const dotted = base.split(".");
  const extension = dotted.length > 1 ? dotted.pop() : undefined;
  const kept = dotted.filter((d, i) => i === 0 || !ROLE_WORDS.has(d.toLowerCase()));
  if (ROLE_WORDS.has(kept[0]?.toLowerCase() ?? "")) kept[0] = "x";
  return [...folders, [...kept, ...(extension ? [extension] : [])].join(".")].join("/");
}

/** `n` items evenly spaced through the list, so a pick isn't all from one folder. */
function spread<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  return Array.from({ length: n }, (_, i) => items[Math.floor((i * items.length) / n)]);
}

async function run(): Promise<void> {
  const results = await evaluate(
    async (inputs: Record<string, unknown>) => {
      const [role] = await askRoles([toLabelInput(inputs)]);
      return { role };
    },
    {
      data: DATASET,
      evaluators: [
        ({ outputs, referenceOutputs }: { outputs: Record<string, unknown>; referenceOutputs?: Record<string, unknown> }) => ({
          key: "role_correct",
          score: outputs.role === referenceOutputs?.role ? 1 : 0,
          comment: `convention says ${String(referenceOutputs?.role)}, model said ${String(outputs.role)}`,
        }),
      ],
      experimentPrefix: "roles",
      description: "The production labelling prompt, asked about files convention already identified.",
      metadata: { model: MODEL },
      maxConcurrency: 8,
    },
  );

  requireNoErrors(results.experimentName, results.results);
  const rows = results.results.map((r) => ({
    expected: String(r.example.outputs?.role),
    answered: r.run.outputs?.role === null || r.run.outputs?.role === undefined ? "null" : String(r.run.outputs.role),
    path: String(r.example.metadata?.path ?? r.example.inputs.path),
  }));
  if (rows.length === 0) throw new Error(`The experiment returned no results. Is the "${DATASET}" dataset empty?`);
  const right = rows.filter((r) => r.expected === r.answered);

  console.log(`\nRole accuracy (${MODEL}): ${right.length} of ${rows.length} correct, ${percent(right.length, rows.length)}`);
  console.log(`Experiment: ${results.experimentName}\n`);
  for (const [role, group] of [...Map.groupBy(rows, (r) => r.expected)].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const ok = group.filter((r) => r.expected === r.answered).length;
    console.log(`  ${role.padEnd(11)} ${String(ok).padStart(3)} of ${String(group.length).padEnd(3)} ${percent(ok, group.length)}`);
  }
  const nulls = rows.filter((r) => r.answered === "null").length;
  if (nulls > 0) console.log(`\n  ${nulls} answered "can't tell", which counts as wrong: each file has a real role.`);
  const wrong = rows.filter((r) => r.expected !== r.answered && r.answered !== "null");
  if (wrong.length > 0) {
    console.log("\n  Wrong answers:");
    for (const r of wrong) console.log(`    ${r.path}: convention ${r.expected}, model ${r.answered}`);
  }
}

function toLabelInput(inputs: Record<string, unknown>): LabelInput {
  const { path, sha256, head, imports, externals } = inputs;
  const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
  if (typeof path !== "string" || typeof sha256 !== "string" || typeof head !== "string" || !strings(imports) || !strings(externals)) {
    throw new Error(`A dataset example isn't a labeller input: ${JSON.stringify(inputs).slice(0, 200)}`);
  }
  return { path, sha256, head, imports, externals };
}

// Running is the everyday case, so it needs no word; building replaces data and does.
// At the bottom so every helper above exists before the first await reaches it.
const command = process.argv[2] ?? "run";
if (command === "build") await build();
else if (command === "run") await run();
else {
  console.error("Usage: pnpm eval:roles build [owner/name …] [--replace]\n       pnpm eval:roles [run]");
  process.exitCode = 2;
}
