// Preloaded before every eval (`node --import ./evals/setup.ts …`), so a script
// outside the web app runs against the same environment the app does.
//
// The variables come from Next's own loader, the one `next dev` uses, so the
// same files are read in the same order and nothing is maintained twice. It is
// reached through the installed `next` because pnpm doesn't expose it on its own.
//
// The app's modules import "@/…" and leave off ".ts", which Next resolves and
// plain Node doesn't. The hook in resolve.ts handles exactly those two things
// and nothing else, so the evals import the application's real code, not a copy.

import { createRequire, register } from "node:module";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

const fromNext = createRequire(createRequire(path.join(root, "package.json")).resolve("next/package.json"));
const nextEnv: unknown = fromNext("@next/env");
const load: unknown = typeof nextEnv === "object" && nextEnv !== null ? Reflect.get(nextEnv, "loadEnvConfig") : undefined;
if (typeof load !== "function") throw new Error("Could not find loadEnvConfig in @next/env; the evals can't load the app's environment");
load(root, true, { info: () => {}, error: console.error });

register("./resolve.ts", import.meta.url, { data: { root } });
