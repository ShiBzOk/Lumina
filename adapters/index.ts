import type { FrameworkAdapter } from "../parser/adapter.ts";
import { nestjsAdapter } from "./nestjs.ts";
import { nextjsAdapter } from "./nextjs.ts";
import { reactAdapter } from "./react.ts";

// Tried in this order, and the first that recognises the repository wins.
// Next.js comes before React because every Next.js app also depends on React.
export const ADAPTERS: readonly FrameworkAdapter[] = [nextjsAdapter, nestjsAdapter, reactAdapter];
