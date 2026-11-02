import fs from "node:fs";
import path from "node:path";
import { readParseResult } from "@/parser/io";
import type { ParseResult } from "@/parser/types";

// Scaffolding: the checked-in parse of a real repository, read through the
// parser's own contract. Goes away once analyses are stored properly.

const DIR = path.join(process.cwd(), "fixtures", "preview");

export interface PreviewMeta {
  repo: string;
  branch: string;
  commit: string;
}

export function readPreviewResult(): ParseResult {
  return readParseResult(path.join(DIR, "result.json"));
}

export function readPreviewMeta(): PreviewMeta {
  const raw: unknown = JSON.parse(fs.readFileSync(path.join(DIR, "meta.json"), "utf8"));
  if (typeof raw !== "object" || raw === null) throw new Error("fixtures/preview/meta.json is not an object");
  const field = (key: string) => {
    const v: unknown = Reflect.get(raw, key);
    if (typeof v !== "string") throw new Error(`fixtures/preview/meta.json: ${key} should be a string`);
    return v;
  };
  return { repo: field("repo"), branch: field("branch"), commit: field("commit") };
}
