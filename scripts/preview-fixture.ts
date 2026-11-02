// Scaffolding for the preview route: parses a repository already on disk and
// checks the result in, so the interface can be built with no account, database
// or network. Goes away once analyses are stored properly.
//
//   node scripts/preview-fixture.ts <repo-dir> --repo owner/name
//
// Writes fixtures/preview/result.json (the parser's output, untouched) and
// meta.json (which repository and commit this is).

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { readParseResult, writeParseResult } from "../parser/io.ts";
import { parseRepository } from "../parser/parse.ts";

const OUT = path.resolve(import.meta.dirname, "../fixtures/preview");

function main(argv: string[]): number {
  const repoFlag = argv.indexOf("--repo");
  const repo = repoFlag === -1 ? undefined : argv[repoFlag + 1];
  const dir = argv.find((a, i) => !a.startsWith("--") && i !== repoFlag + 1);
  if (!dir || !repo) {
    console.error("Usage: node scripts/preview-fixture.ts <repo-dir> --repo owner/name");
    return 2;
  }

  const result = parseRepository(dir);

  const git = (...args: string[]) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
  const meta = { repo, branch: git("branch", "--show-current"), commit: git("rev-parse", "HEAD") };

  fs.mkdirSync(OUT, { recursive: true });
  const resultFile = path.join(OUT, "result.json");
  writeParseResult(resultFile, result);
  // The fixture is checked in, so the local clone's absolute path (root, and
  // any message quoting it) is swapped for the repository name, then read back
  // through the contract to prove the file still holds.
  fs.writeFileSync(resultFile, fs.readFileSync(resultFile, "utf8").replaceAll(result.root, repo));
  readParseResult(resultFile);
  fs.writeFileSync(path.join(OUT, "meta.json"), JSON.stringify(meta, null, 2));
  console.log(`${result.files.length} files, ${result.edges.length} edges → ${OUT}`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
