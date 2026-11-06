import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { Logo } from "@/components/logo";
import { HeroWindow } from "./hero-window";
import { Reveal } from "./reveal";
import { SELF_MAP } from "./self-map-data";

// The front door, for signed-out visitors only. Every claim on it is something
// the app already does, and every number is from a real parse of this
// repository; nothing here describes a phase that isn't built.

const STEPS = [
  { title: "Paste a public repository", body: "Any GitHub URL. No install, no repository permissions, no config file." },
  { title: "Every import is parsed", body: "Each one is resolved to a real file, or reported with the reason it couldn't be." },
  { title: "Explore the map", body: "Folders become cards, imports become lines. Click a file to see what it touches." },
];

const PRINCIPLES = [
  { title: "Parsed, not guessed.", body: "A line on the map exists because the code imports that file." },
  { title: "Absent beats approximate.", body: "What can't be recovered is left out and counted, never filled in." },
  { title: "Explains, never grades.", body: "It tells you how the code fits together. Judging it is up to you." },
];

const HEADLINE = "See how your code connects.";

const FRAMEWORKS = ["Next.js", "NestJS", "Express", "React"];

const QUESTIONS = [
  {
    q: "Does it need access to my GitHub account?",
    a: "No. Signing in only identifies you. Lumina asks for no repository permissions and stores no tokens; it downloads the public archive like anyone could.",
  },
  {
    q: "Which languages does it read?",
    a: "TypeScript and JavaScript: .ts, .tsx, .mts, .cts, .js, .jsx, .mjs and .cjs. ES imports, re-exports, dynamic imports and require() all become lines on the map.",
  },
  {
    q: "What about private repositories?",
    a: "Not yet. Reading one means holding a token for it, and Lumina doesn't hold tokens.",
  },
  {
    q: "Where does the AI come in?",
    a: "Only to explain a file in plain English and label files convention couldn't identify. It never decides that two files are connected. Every line on the map comes from the parser.",
  },
  {
    q: "Who can see my maps?",
    a: "Everyone in your organization, and no one else. A repository is mapped once and the whole team starts from the same map.",
  },
  {
    q: "How large a repository can it handle?",
    a: "Archives up to 500 MB. A file too large to parse is skipped and counted, with the reason, rather than quietly dropped.",
  },
];

export function Landing() {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <Hero />

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-36 px-4 pt-36 pb-28 sm:gap-48 sm:px-6 sm:pt-48">
        <Reveal>
          <p className="text-[11px] font-medium tracking-[0.2em] text-muted uppercase">Why</p>
          <p className="mt-6 max-w-4xl text-3xl leading-[1.15] font-semibold tracking-[-0.035em] sm:text-5xl">
            Codebases now ship with code nobody has read.{" "}
            <span className="text-muted/70">
              An agent wrote it, it worked, it shipped. The questions that follow are structural: what is this file,
              what depends on it, what breaks if it changes.
            </span>
          </p>
        </Reveal>

        <Reveal>
          <SectionHead eyebrow="How it works" title="Three steps. Nothing to set up." />
          <ol className="mt-12 grid gap-3 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-3xl bg-background p-7">
                <span className="font-mono text-[11px] text-muted">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-10 text-[17px] font-semibold tracking-[-0.01em]">{s.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </Reveal>

        <Reveal>
          <SectionHead eyebrow="Run on itself" title="Here's what it found in Lumina." />
          <p className="mt-4 max-w-lg text-[13px] leading-relaxed text-muted">
            The same parse any repository gets. Every file is accounted for, and anything left out says why.
          </p>
          <SelfCoverage />
        </Reveal>

        <Reveal>
          <SectionHead eyebrow="Principles" title="Built to be trusted on sight." />
          <div className="mt-12 grid gap-10 border-t border-border pt-10 md:grid-cols-3 md:gap-8">
            {PRINCIPLES.map((p) => (
              <div key={p.title}>
                <h3 className="text-2xl font-semibold tracking-[-0.03em] text-petrol">{p.title}</h3>
                <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-muted">{p.body}</p>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal>
          <SectionHead eyebrow="What you get" title="Everything the code says, nothing it doesn't." />
          <div className="mt-12 grid gap-3 md:grid-cols-3">
            <Tile
              wide
              tinted
              title="Blast radius"
              body="Pick a file and see everything that depends on it, directly or further out, before you change it."
            />
            <Tile
              title="Plain-English explanations"
              body="Ask what a file does. The answer is written from that file and its real neighbours."
            />
            <Tile
              title="Routes"
              body="For Next.js, Express and NestJS, the URL table read from the code. A route that can't be fully recovered isn't shown."
            />
            <Tile
              wide
              title="Mapped once, shared by the team"
              body="An analysis belongs to your organization, not whoever ran it. The person who joins next starts from the map."
            />
          </div>
        </Reveal>

        <Reveal>
          <div className="grid gap-12 md:grid-cols-[1fr_1.4fr] md:gap-16">
            <SectionHead eyebrow="Questions" title="The short answers." />
            <div className="border-t border-border">
              {QUESTIONS.map(({ q, a }) => (
                <details key={q} className="faq group border-b border-border">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[15px] font-medium [&::-webkit-details-marker]:hidden">
                    {q}
                    <span className="faq-icon text-[18px] leading-none font-light text-muted group-open:rotate-45" aria-hidden>
                      +
                    </span>
                  </summary>
                  <p className="max-w-lg pb-6 text-[13px] leading-relaxed text-muted">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </Reveal>
      </main>

      <Reveal className="mx-3">
        <section className="relative overflow-hidden rounded-[28px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/auth/petrol-band.svg" alt="" className="absolute inset-0 size-full" />
          <div className="relative flex flex-col items-center px-6 py-28 text-center sm:py-36">
            <h2 className="max-w-2xl text-4xl leading-[1.05] font-semibold tracking-[-0.04em] text-white sm:text-6xl">
              See the shape of your code.
            </h2>
            <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-white/70">
              Any public TypeScript or JavaScript repository, mapped from its real imports.
            </p>
            <CtaButton className="mt-10" />
          </div>
        </section>
      </Reveal>

      <footer className="mx-auto flex w-full max-w-5xl flex-col items-start justify-between gap-4 px-4 py-10 sm:flex-row sm:items-center sm:px-6">
        <div className="flex items-baseline gap-4">
          <Logo />
          <span className="text-[12px] text-muted">Dependency maps of public GitHub repositories.</span>
        </div>
        <Link href="/sign-in" className="text-[13px] font-medium text-foreground hover:text-petrol">
          Sign in
        </Link>
      </footer>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative m-3 overflow-hidden rounded-[28px]">
      {/* The login artwork, stretched rather than cropped, so it runs petrol to cream whatever the height. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/auth/petrol-band.svg" alt="" className="absolute inset-0 size-full" />
      {/* Lumina is light: a soft glow crosses the artwork once and comes to rest behind the headline. */}
      <div className="hero-light" aria-hidden />

      <div className="relative mx-auto flex w-full max-w-5xl flex-col px-4 pt-6 sm:px-6">
        <nav className="flex items-center justify-between text-white">
          <Logo />
          <div className="flex items-center gap-1">
            <Link href="/sign-in" className="rounded-full px-4 py-2 text-[13px] font-medium text-white/80 hover:text-white">
              Sign in
            </Link>
            <Link href="/sign-up" className="rounded-full bg-white px-4 py-2 text-[13px] font-medium text-petrol hover:bg-white/90">
              Get started
            </Link>
          </div>
        </nav>

        <div className="flex flex-col items-center pt-24 pb-16 text-center sm:pt-32">
          <p className="flex items-center gap-4 text-[11px] font-medium tracking-[0.2em] text-white/80 uppercase">
            <span className="h-px w-10 bg-white/50" aria-hidden />
            Dependency maps
            <span className="h-px w-10 bg-white/50" aria-hidden />
          </p>
          <h1 className="mt-7 max-w-3xl text-5xl leading-[1.02] font-semibold tracking-[-0.04em] text-white sm:text-7xl">
            {/* Each word comes into focus in turn, so the line reads as it sharpens. */}
            {/* The space sits outside each word: inside an inline-block it would be trimmed. */}
            {HEADLINE.split(" ").map((word, i) => (
              <Fragment key={word}>
                {i > 0 && " "}
                <span className="hero-word" style={{ animationDelay: `${200 + i * 90}ms, ${600 + i * 120}ms` }}>
                  {word}
                </span>
              </Fragment>
            ))}
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-white/70">
            Point Lumina at a public GitHub repository. Every import is parsed, and every line on the map is one the code
            really makes.
          </p>
          <CtaButton className="mt-10" />
        </div>

        {/* The app itself, floating over the artwork's cream bottom edge the way the signed-in screens float their cards. */}
        <div className="pb-6 sm:pb-10">
          <HeroWindow />
          <p className="hero-after mt-4 text-center text-[12px] text-petrol/70">
            vercel/commerce, mapped by Lumina, with one folder selected: green flows in, orange flows out.
          </p>
        </div>
      </div>
    </section>
  );
}

function CtaButton({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/sign-up"
      className={`rounded-full bg-white px-6 py-3 text-[14px] font-medium text-petrol shadow-[0_10px_30px_-10px_rgb(0_0_0/0.4)] hover:bg-white/90 ${className}`}
    >
      Map a repository →
    </Link>
  );
}

/** Lumina's own coverage and framework roles, straight from the generated parse. */
function SelfCoverage() {
  const c = SELF_MAP.coverage;
  const resolved = c.imports.internal + c.imports.external;
  const total = resolved + c.imports.excluded + c.imports.unresolved;
  return (
    <div className="mt-12 grid gap-3 md:grid-cols-5">
      <div className="rounded-3xl bg-background p-7 md:col-span-3">
        <dl className="grid grid-cols-3 gap-4">
          <Figure label="files found" value={c.found} />
          <Figure label="parsed" value={c.parsed} />
          <Figure label="skipped" value={c.skipped} />
        </dl>

        <div className="mt-10">
          <div className="flex items-baseline justify-between text-[12px]">
            <span className="font-medium">{total} imports</span>
            <span className="font-mono text-[11px] text-muted">{c.edges} lines on the map</span>
          </div>
          {/* Proportions of the real counts; a zero takes no width. */}
          <div className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full">
            <span className="bg-petrol" style={{ flexGrow: c.imports.internal }} />
            <span className="bg-edge" style={{ flexGrow: c.imports.external }} />
            <span className="bg-outgoing" style={{ flexGrow: c.imports.excluded }} />
            <span className="bg-danger" style={{ flexGrow: c.imports.unresolved }} />
          </div>
          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] text-muted">
            <Legend swatch="bg-petrol" label="to a file in the repo" value={c.imports.internal} />
            <Legend swatch="bg-edge" label="to a package" value={c.imports.external} />
            <Legend swatch="bg-outgoing" label="excluded" value={c.imports.excluded} />
            <Legend swatch="bg-danger" label="unresolved" value={c.imports.unresolved} />
          </ul>
        </div>

        <p className="mt-8 border-t border-border pt-5 font-mono text-[11px] text-muted">
          left out on purpose: {c.excluded.map((e) => `${e.reason} ${e.count}`).join(" · ")}
        </p>
      </div>

      <div className="flex flex-col rounded-3xl bg-background p-7 md:col-span-2">
        <p className="text-[12px] font-medium">Knows the framework</p>
        <p className="mt-1 text-[12px] text-muted">
          {FRAMEWORKS.join(", ")}. Lumina was read as <span className="font-mono">{c.adapter}</span>, so its files carry
          these roles:
        </p>
        <ul className="mt-6 flex flex-wrap gap-1.5">
          {c.roles.map((r) => (
            <li key={r.role} className="flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 font-mono text-[11px] ring-1 ring-border">
              {r.role}
              <span className="text-muted">{r.count}</span>
            </li>
          ))}
        </ul>
        <p className="mt-auto pt-8 text-[12px] leading-relaxed text-muted">
          Roles come from convention. A file it can&apos;t place may get an AI label, shown apart and never used to draw a line.
        </p>
      </div>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dd className="text-4xl font-semibold tracking-[-0.04em] tabular-nums sm:text-5xl">{value}</dd>
      <dt className="mt-1 text-[12px] text-muted">{label}</dt>
    </div>
  );
}

function Legend({ swatch, label, value }: { swatch: string; label: string; value: number }) {
  return (
    <li className="flex items-center gap-2">
      <span className={`size-2 rounded-full ${swatch}`} aria-hidden />
      {label} <span className="text-foreground">{value}</span>
    </li>
  );
}

function SectionHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <header>
      <p className="text-[11px] font-medium tracking-[0.2em] text-muted uppercase">{eyebrow}</p>
      <h2 className="mt-4 max-w-xl text-3xl leading-[1.1] font-semibold tracking-[-0.035em] sm:text-4xl">{title}</h2>
    </header>
  );
}

function Tile({ title, body, wide = false, tinted = false }: { title: string; body: ReactNode; wide?: boolean; tinted?: boolean }) {
  return (
    <div
      className={`relative flex min-h-56 flex-col overflow-hidden rounded-3xl p-7 ${wide ? "md:col-span-2" : ""} ${
        tinted ? "justify-start" : "justify-end bg-background"
      }`}
    >
      {/* The hero's artwork again. Its top is solid petrol, so the text sits there in white. */}
      {tinted && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/auth/petrol-band.svg" alt="" className="absolute inset-0 size-full" />
      )}
      <h3 className={`relative text-[17px] font-semibold tracking-[-0.01em] ${tinted ? "text-white" : ""}`}>{title}</h3>
      <p className={`relative mt-2 max-w-md text-[13px] leading-relaxed ${tinted ? "text-white/75" : "text-muted"}`}>{body}</p>
    </div>
  );
}
