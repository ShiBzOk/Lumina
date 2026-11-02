import type { FrameworkAdapter } from "../parser/adapter.ts";
import { expressAdapter } from "./express.ts";
import { nestjsAdapter } from "./nestjs.ts";
import { nextjsAdapter } from "./nextjs.ts";
import { reactAdapter } from "./react.ts";

// Tried in this order, and the first that recognises the repository wins.
// Next.js comes before React because every Next.js app also depends on React.
// Express comes before React: a repository with an Express dependency has a
// server, and a full-stack one is read as that server.
export const ADAPTERS: readonly FrameworkAdapter[] = [nextjsAdapter, nestjsAdapter, expressAdapter, reactAdapter];
