import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { MODEL_ROLES, type ModelRole } from "@/lib/map/frameworks";
import { ai, cacheKey, cachedBatch, MODEL } from "./client";

// Roles for files no adapter could identify. The model only labels: it sees a
// file's path, its first lines and what the parser says it imports, and picks
// a role from a fixed list or says it can't tell.

export interface LabelInput {
  path: string;
  sha256: string;
  /** The opening lines, already cut down. */
  head: string;
  /** Repository files it imports, as resolved by the parser. */
  imports: string[];
  /** Package specifiers it imports. */
  externals: string[];
}

const PROMPT = `You label files in a TypeScript or JavaScript repository with the role each one plays.

Roles:
- component: renders UI
- hook: a React hook (a use… function other code calls)
- service: does work for the rest of the app, such as business logic or calls to an outside system
- repository: reads or writes stored data
- model: describes the shape of data (types, schemas, entities)
- util: small general-purpose helpers
- config: settings and configuration

Answer null when no role clearly fits or the file is a test, script, fixture or anything else. A missing label is better than a wrong one. Judge only from what you are shown.`;

const BATCH = 40;
const CONCURRENCY = 4;
const HEAD_LINES = 40;
const HEAD_CHARS = 3000;

/** The first lines of a file, cut the same way every time so the key stays stable. */
export function headOf(text: string): string {
  return text
    .split("\n")
    .slice(0, HEAD_LINES)
    .map((l) => l.slice(0, 200))
    .join("\n")
    .slice(0, HEAD_CHARS);
}

type Db = SupabaseClient<Database>;
type Answer = ModelRole | null;

// The head is cut from the file's content, so its hash stands in for it.
const keyOf = (f: LabelInput) => cacheKey({ prompt: PROMPT, path: f.path, sha256: f.sha256, imports: f.imports, externals: f.externals });

function batchLabeller(db: Db, orgId: string) {
  return cachedBatch<LabelInput, Answer>("label files", {
    async read(items) {
      const keys = items.map(keyOf);
      const { data, error } = await db.from("role_labels").select("key, role").eq("org_id", orgId).eq("model", MODEL).in("key", keys);
      if (error) throw new Error(`Could not read cached labels: ${error.message}`);
      const byKey = new Map(data.map((r) => [r.key, r.role === null ? null : role(r.role, "cached label")]));
      return keys.map((k) => byKey.get(k));
    },
    async generate(misses) {
      // Ids rather than paths as property names, so no path can upset the schema.
      const ids = misses.map((_, i) => `f${i}`);
      const completion = await ai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "developer", content: PROMPT },
          {
            role: "user",
            content: misses
              .map((f, i) =>
                [
                  `### ${ids[i]}: ${f.path}`,
                  `Imports from the repository: ${f.imports.length > 0 ? f.imports.join(", ") : "none"}`,
                  `Imports from packages: ${f.externals.length > 0 ? f.externals.join(", ") : "none"}`,
                  "First lines:",
                  f.head,
                ].join("\n"),
              )
              .join("\n\n"),
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "roles",
            strict: true,
            schema: {
              type: "object",
              properties: Object.fromEntries(ids.map((id) => [id, { anyOf: [{ type: "string", enum: MODEL_ROLES }, { type: "null" }] }])),
              required: ids,
              additionalProperties: false,
            },
          },
        },
      });
      const content = completion.choices[0]?.message.content;
      if (!content) throw new Error(`The model returned no labels (finish reason: ${completion.choices[0]?.finish_reason ?? "none"})`);
      const parsed: unknown = JSON.parse(content);
      if (typeof parsed !== "object" || parsed === null) throw new Error("The model's labels are not an object");
      return ids.map((id) => {
        const value: unknown = Reflect.get(parsed, id);
        if (value === undefined) throw new Error(`The model left ${id} unlabelled`);
        return value === null ? null : role(value, "the model's label");
      });
    },
    async write(misses, values) {
      const { error } = await db
        .from("role_labels")
        .upsert(
          misses.map((f, i) => ({ org_id: orgId, model: MODEL, key: keyOf(f), role: values[i] })),
          { onConflict: "org_id,model,key", ignoreDuplicates: true },
        );
      if (error) throw new Error(`Could not cache labels: ${error.message}`);
    },
  });
}

/** Path → role, for the files the model could label. Files it couldn't are absent. */
export async function labelFiles(
  db: Db,
  orgId: string,
  files: readonly LabelInput[],
  progress: (done: number, cached: number) => Promise<void>,
): Promise<Map<string, ModelRole>> {
  const label = batchLabeller(db, orgId);
  const batches: LabelInput[][] = [];
  for (let i = 0; i < files.length; i += BATCH) batches.push(files.slice(i, i + BATCH));

  const labels = new Map<string, ModelRole>();
  let done = 0;
  let cached = 0;
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++];
      const result = await label(batch);
      batch.forEach((f, i) => {
        const r = result.values[i];
        if (r !== null) labels.set(f.path, r);
      });
      done += batch.length;
      cached += result.cached;
      await progress(done, cached);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));
  return labels;
}

function role(value: unknown, what: string): ModelRole {
  const hit = MODEL_ROLES.find((r) => r === value);
  if (hit === undefined) throw new Error(`${what} "${String(value)}" is not one of ${MODEL_ROLES.join(", ")}`);
  return hit;
}
