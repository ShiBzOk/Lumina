// Registered by setup.ts. Resolves "@/…" from the project root and imports
// written without ".ts", the two things Next resolves and plain Node doesn't.

import type { ResolveHook } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

let root = "";

export function initialize(data: { root: string }): void {
  root = data.root;
}

export const resolve: ResolveHook = async (specifier, context, nextResolve) => {
  const target = specifier.startsWith("@/") ? pathToFileURL(path.join(root, specifier.slice(2))).href : specifier;
  try {
    return await nextResolve(target, context);
  } catch (error) {
    if (target === specifier && !specifier.startsWith(".")) throw error;
    for (const suffix of [".ts", ".tsx", "/index.ts"]) {
      try {
        return await nextResolve(target + suffix, context);
      } catch {
        // Try the next way of writing it.
      }
    }
    throw error;
  }
};
