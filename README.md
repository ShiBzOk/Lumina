# Lumina

Paste a public TypeScript or JavaScript GitHub repository and get a map of how its code connects: folders as cards, imports as lines. Select a file to see what it depends on and what depends on it.

Everything on the map comes from parsing the code. An edge exists only because the parser resolved a real import to a real file. Anything it can't resolve is reported with a reason, never guessed. The AI writes explanations of what the parser found, and has no say in what's there.

## What's in it

- **Parser** (`parser/`): built on ts-morph, and runs from a plain script with no framework or database code. Try it with `pnpm parse <path-to-a-repo>`.
- **Framework adapters** (`adapters/`): Next.js, React, Express and NestJS knowledge lives here, so the parser stays framework-free.
- **Map** (`components/map/`, `lib/map/`): React Flow and dagre.
- **Data** (`supabase/migrations/`): Postgres, with access decided by row-level security policies rather than application code.
- **AI** : one wrapped OpenAI client, traced with LangSmith. Each call reads the cache inside its trace.
- **Evals** (`evals/`): check things like whether explanations mention file paths that don't exist.

## How this was built

I built this with AI coding tools. The starting structure, the planning documents and the first build stages came from a tutorial.

After that I carried on by myself, adding:

- comparing two analyses of a repository
- shareable links to an exact view
- who mapped a repository, and what's new since your last visit
- notes pinned to files
- branches inside one repository
- in-app notifications

## Running it

You need Node, pnpm, and accounts with Clerk, Supabase and OpenAI. LangSmith is optional.

1. Run `pnpm install`.
2. Copy `.env.example` to `.env.local` and fill it in.
3. Set up Clerk as a third-party auth provider in your Supabase project, with organizations turned on in Clerk.
4. Apply the files in `supabase/migrations/` to your database, in order.
5. Run `pnpm dev`.

Stack: Next.js 16, React 19, strict TypeScript, Tailwind v4.
