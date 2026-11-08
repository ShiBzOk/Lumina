# Lumina

Lumina reads a public GitHub repo and draws how its code connects. Every line on the map comes from parsing real imports. The AI explains what the parser found and has no say in what's there.

## Stack

Next.js 16 App Router, React 19, strict TypeScript. ts-morph for parsing, React Flow and dagre for the map. Clerk for sign-in and organizations, Supabase for Postgres, row-level security and realtime. OpenAI through one wrapped client, traced with LangSmith. Tailwind v4, pnpm.

Next.js 16 changed a lot. If you're unsure about an API, read the docs in the installed package instead of going from memory.

## How we work

We build this in phases. I bring the phase and what I want from it, and the specs live in `docs/specs/`, which stays local. If a spec is unclear or a better approach exists, say so before building. We settle it together, then you build it and stop at the end of that phase.

I test everything myself in the browser, and that's where most of the real decisions happen. I'll come back with what feels wrong, what's slow and what I'd change. Types, lint and build are yours to run before you tell me something is ready. When it's mine to test, tell me which page to open, what to click and what I should see.

Sometimes I want to think before anything gets built. If I ask what you think or say we're just talking, we're just talking. Tell me honestly, including when you think I'm wrong, and give me the reasons on both sides. I've changed direction because of that more than once, and I've also ignored it. Both are fine.

Design is decided by trying things. Treat a visual change as something I might reject, and keep it easy to take back. When we drop an idea, all of it goes: code, generated files, anything installed for it. Dead code left behind from experiments is how a project gets confusing.

Git happens when I say so, usually once I've seen it working. Commits are in my name only, with no AI attribution. `docs/`, screenshots and anything else marked local don't get pushed, so look at what's staged first.

## How to talk to me

Short and plain. Number your options so I can answer "try 2". Ask with a recommendation attached, and if I could mean two different things on the screen, check which before building.

When something breaks I want to understand it, so tell me what happened and why, not only what you changed. If you need a key or a setup step from me, say exactly what and why it's needed, and check that we don't already have it first. Keys go in `.env.local`, never in chat.

Only call something fixed once you've confirmed it. If I say nothing changed, believe me and look again. If a first fix doesn't work, go after the cause instead of trying variations.

## How the code is laid out

- The parser can't import Next, React or the database client. Path in, data out, runnable from a plain script.
- Framework knowledge belongs in an adapter, never in the parser.
- Graph calculations are pure functions over a file list and an edge list.
- Database access stays in server code.
- Who can read a row is decided by a policy. If a query needs a `where` clause to return the right rows, the policy is wrong.
- One place constructs the AI client, so nothing skips tracing.

## Conventions

No `any`. If a type is awkward, bring it up instead of casting. Comment why, not what. One clear way of doing something beats a configurable one.

Every AI call reads the cache inside its trace, so a cache hit is still a recorded run.

Performance is measured on big repos like shadcn-ui and next.js. When something gets slower, find out what changed before tuning it, and make sure earlier performance work survives new features.

## How it should feel

Clean, simple and easy to find your way around, with less text and room to breathe. Every feature we've added competes for the same screen, so a new one has to earn its place. A first-time user should be able to find it without being told.

References are for feel, not for copying. When I share one, the details matter: radius, shadow, spacing. It shouldn't look generated. Lumina's identity is its real wordmark and petrol colour, so we don't invent logos, mascots or colours around it.

Motion is subtle and answers something the user did, like a panel opening, a tab switching or a dropdown. Long waits always show that work is happening.

The machinery stays out of sight. Users get names like "Version 2", not hashes, IDs or model names. A partial result is explained calmly and doesn't look like an error. A button only appears if it can really do what it says, and it has to hold up on a laptop screen and at 150% zoom.

## What we don't do

- **Guess a connection.** An edge exists because a real import resolved to a real file. Anything unresolved is reported with a reason.
- **Fill a gap with something invented.** If a file was skipped, say so and count it. Absent beats approximate.
- **Grade the code.** No scores or severity. Lumina explains a codebase, it doesn't review one.
- **Install a package without asking.**
- **Build ahead of the current phase.**
- **Leave the build broken, or weaken a check to get it passing.**
- **Poll the database.** Name the columns, limit list reads, subscribe to changes.
