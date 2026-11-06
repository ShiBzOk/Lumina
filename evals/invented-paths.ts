// The invented-path check, over the latest real explanations in the traces.
// The same check also runs live on every new explanation and records
// `no_invented_paths` on its run; this reads back what the model was shown
// and said, and shows the working.
//
//   pnpm eval:paths [--limit 30]      score recent real explanations
//   pnpm eval:paths --splice          also splice a made-up file into each one
//                                     and show the check catching it

import { inventedPaths, repairPaths, shownPaths } from "../lib/ai/invented-paths.ts";
import { flag, option, percent, recentExplanations, type RealExplanation } from "./langsmith.ts";

const limit = option("--limit", 30);
const explanations = await recentExplanations(limit);
if (explanations.length === 0) throw new Error("No explanation calls in the traces yet. Explain a few files in the app first.");

let clean = 0;
console.log(`Invented-path check over the ${explanations.length} most recent explanations\n`);
for (const e of explanations) {
  const invented = inventedPaths(e.input, e.answer);
  if (invented.length === 0) clean += 1;
  console.log(`${invented.length === 0 ? "  ok  " : "  FAIL"}  ${e.kind.padEnd(6)} ${e.subject}`);
  if (invented.length > 0) {
    console.log(`        named but never shown: ${invented.join(", ")}`);
    // What the user was shown instead, from the same pass the app runs.
    const repair = repairPaths(e.input, e.answer);
    for (const r of repair.rewritten) console.log(`        repaired: ${r.from} → ${r.to}`);
    for (const p of repair.removed) console.log(`        repaired: sentence naming ${p} removed`);
    const left = inventedPaths(e.input, repair.body);
    if (left.length > 0) {
      console.log(`        STILL INVENTED after the repair: ${left.join(", ")}`);
      process.exitCode = 1;
    }
    console.log(`        ${e.url}`);
  }
}
console.log(`\nno_invented_paths: ${clean} of ${explanations.length} name only paths they were shown (${percent(clean, explanations.length)})`);

if (flag("--splice")) {
  console.log("\nSplicing a made-up file into each explanation\n");
  let caught = 0;
  explanations.forEach((e, i) => {
    // Alternate how it's written: models that follow the prompt use inline
    // code, models that don't write bare paths, and both have to be caught.
    const fake = madeUp(e);
    const sentence = i % 2 === 0 ? ` It also hands its results to \`${fake}\`.` : ` It also hands its results to ${fake}.`;
    const answer = splice(e.answer, sentence);
    const found = inventedPaths(e.input, answer).includes(fake);
    if (found) caught += 1;
    console.log(`${found ? "  caught" : "  MISSED"}  ${fake}${i % 2 === 0 ? " (in code)" : " (bare)"}`);
  });
  console.log(`\nCaught ${caught} of ${explanations.length} spliced paths`);
  if (caught < explanations.length) process.exitCode = 1;
}

/** A plausible file beside the subject that the model was never shown: the kind of name a model invents. */
function madeUp(e: RealExplanation): string {
  const shown = shownPaths(e.input);
  const subject = e.subject.replace(/\/+$/, "");
  const dir = e.kind === "file" ? subject.split("/").slice(0, -1).join("/") : subject === "." ? "" : subject;
  const at = (name: string) => (dir ? `${dir}/${name}` : name);
  const candidates = ["helpers.ts", "utils.ts", "types.ts", "constants.ts", "shared.ts"].map(at);
  return candidates.find((c) => !shown.has(c)) ?? at(`spliced-${Date.now()}.ts`);
}

/** After the first paragraph, so it reads as part of the explanation rather than an appendix. */
function splice(answer: string, sentence: string): string {
  const end = answer.indexOf("\n\n");
  return end === -1 ? answer + sentence : answer.slice(0, end) + sentence + answer.slice(end);
}
