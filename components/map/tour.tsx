"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Selection } from "@/lib/map/highlight";
import { hasSeen, markSeen, tourKey } from "./seen";

type Target = "map" | "details" | "categories" | "search" | "share";

interface Step {
  target: Target;
  title: string;
  body: string;
  /** Waits for a real click on a file, with the map usable and no Next. */
  waitsForFile?: boolean;
}

// In the order someone uses the map: look at it, click something, read about
// it, then the two ways of narrowing down.
const STEPS: readonly Step[] = [
  { target: "map", title: "This is the repository", body: "Each card is a folder. Each line is an import the parser traced to a real file." },
  { target: "map", title: "Click a file", body: "Pick any row in a card to see what it's connected to.", waitsForFile: true },
  { target: "details", title: "What it connects to", body: "Structure lists what this file imports and what imports it. Explanation describes it in words, and Notes are your team's." },
  { target: "categories", title: "Narrow it down", body: "Show only the files of one category or type." },
  { target: "search", title: "Find any file", body: "Search folders and files by path. Ctrl+K opens it from anywhere on the map." },
  { target: "share", title: "Share what you're seeing", body: "Copies a link to this exact view, selected file included, so a teammate opens the same thing." },
];

const GAP = 12;
const INSET = 16;
/** The card's width, `w-64`. Every placement is a left and top so the card can glide between them. */
const CARD_WIDTH = 256;
/** Long enough to see the file's connections light up before the tour moves off the map. */
const CONFIRM_MS = 700;
const LEAVE_MS = 200;

const subscribe = () => () => {};

/** Beside the panel it describes, or over the map's empty corner clear of the toolbar. */
function cardPlacement(target: Target, rect: DOMRect): { left: number; top: number; translate: string } {
  switch (target) {
    case "map":
      return { left: rect.left + INSET, top: rect.bottom - INSET, translate: "0 -100%" };
    case "details":
      return { left: rect.left - GAP - CARD_WIDTH, top: rect.top + INSET, translate: "0 0" };
    case "categories":
      return { left: rect.right + GAP, top: rect.top + INSET, translate: "0 0" };
    case "search":
    case "share":
      return { left: rect.right - CARD_WIDTH, top: rect.bottom + GAP, translate: "0 0" };
  }
}

/** The first-run walk through the map. Renders nothing for anyone who has finished or skipped it. */
export function Tour({ user, selection, hovered }: { user: string; selection: Selection; hovered: Selection }) {
  // True on the server, so the tour only ever appears once the browser has said so.
  const seen = useSyncExternalStore(subscribe, () => hasSeen(tourKey(user)), () => true);
  const [done, setDone] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [index, setIndex] = useState(0);

  const step = STEPS[index];
  const confirming = step.waitsForFile === true && selection?.kind === "file";

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setIndex((i) => i + 1), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirming]);

  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setDone(true), LEAVE_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  // Writing the key makes `seen` true at once, so `leaving` keeps it up for its fade.
  if ((seen && !leaving) || done) return null;

  const finish = () => {
    markSeen(tourKey(user));
    setLeaving(true);
  };

  const last = index === STEPS.length - 1;
  return (
    <Spotlight
      step={step}
      index={index}
      leaving={leaving}
      confirming={confirming}
      body={step.waitsForFile ? <FilePrompt selection={selection} hovered={hovered} fallback={step.body} /> : step.body}
      onNext={() => (last ? finish() : setIndex(index + 1))}
      onSkip={finish}
    />
  );
}

// Step 2 answers whatever the pointer is doing, so the card reads as following along.
function FilePrompt({ selection, hovered, fallback }: { selection: Selection; hovered: Selection; fallback: string }) {
  if (selection?.kind === "file") return "The lit lines are everything it's connected to.";
  if (hovered?.kind === "file") {
    return (
      <>
        Click to open <span className="block truncate font-mono text-[11px] text-foreground">{hovered.path}</span>
      </>
    );
  }
  if (hovered?.kind === "node" || selection?.kind === "node") return "That's a whole folder. Pick one of the file rows inside it.";
  return fallback;
}

function Spotlight({
  step,
  index,
  leaving,
  confirming,
  body,
  onNext,
  onSkip,
}: {
  step: Step;
  index: number;
  leaving: boolean;
  confirming: boolean;
  body: ReactNode;
  onNext: () => void;
  onSkip: () => void;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  // A banner arriving late resizes these panels, and the observer hears that as well as the first measure.
  useEffect(() => {
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) return;
    const measure = () => setRect(el.getBoundingClientRect());
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [step.target]);

  // Capture, so Ctrl+K can't open search behind the tour and pick a file around it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSkip();
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [onSkip]);

  if (!rect) return null;
  const last = index === STEPS.length - 1;
  const glide = "duration-(--spring-duration) ease-(--spring)";
  const waiting = step.waitsForFile === true && !confirming;

  return (
    <div className={`relative z-50 transition-opacity duration-200 starting:opacity-0 ${leaving ? "pointer-events-none opacity-0" : ""}`}>
      {/* One shape whose shadow is the dimming, so the lit area can glide between
          elements. It never takes a click; the blockers below do that. */}
      <div
        aria-hidden
        className={`pointer-events-none fixed rounded-xl transition-[left,top,width,height] ${glide}`}
        style={{
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          boxShadow: "0 0 0 200vmax color-mix(in srgb, var(--foreground) 40%, transparent)",
        }}
      >
        {waiting && <div className="absolute inset-0 animate-pulse rounded-xl ring-2 ring-surface ring-inset motion-reduce:animate-none" />}
      </div>

      {step.waitsForFile ? (
        // Around the map rather than over it, so the map can take real clicks.
        <>
          <div className="fixed" style={{ top: 0, left: 0, right: 0, height: rect.top }} />
          <div className="fixed" style={{ top: rect.bottom, left: 0, right: 0, bottom: 0 }} />
          <div className="fixed" style={{ top: rect.top, left: 0, width: rect.left, height: rect.height }} />
          <div className="fixed" style={{ top: rect.top, left: rect.right, right: 0, height: rect.height }} />
        </>
      ) : (
        <div className="fixed inset-0" />
      )}

      <div
        role="dialog"
        aria-label={step.title}
        className={`fixed w-64 rounded-xl bg-surface p-3 shadow-[0_8px_24px_rgba(16,24,40,0.16)] ring-1 ring-border transition-[left,top,translate,scale] ${glide} starting:scale-95`}
        style={cardPlacement(step.target, rect)}
      >
        {/* Keyed so each step's words rise in while the card travels. */}
        <div key={index} className={`min-h-[72px] transition-[opacity,translate] ${glide} starting:translate-y-1.5 starting:opacity-0`}>
          <p className="text-[13px] font-semibold">{confirming ? "There it is" : step.title}</p>
          <div className="mt-1 text-[11.5px] leading-[17px] text-muted">{body}</div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <div className="flex flex-1 items-center gap-1" role="img" aria-label={`Step ${index + 1} of ${STEPS.length}`}>
            {STEPS.map((s, i) => (
              <span
                key={s.title}
                className={`h-1 rounded-full transition-[width,background-color] ${glide} ${i === index ? "w-4 bg-foreground" : i < index ? "w-1 bg-foreground/50" : "w-1 bg-border"}`}
              />
            ))}
          </div>
          {/* Keyed so focus lands on this step's button. */}
          <span key={index} className="flex items-center gap-3">
            {!last && (
              <button type="button" autoFocus={step.waitsForFile} onClick={onSkip} className="text-[11px] text-muted transition-colors hover:text-foreground">
                Skip
              </button>
            )}
            {!step.waitsForFile && (
              <button
                type="button"
                autoFocus
                onClick={onNext}
                className="rounded-md bg-foreground px-2.5 py-1 text-[11px] font-medium text-surface transition-[scale] duration-100 hover:scale-[1.04] active:scale-95"
              >
                {last ? "Done" : "Next"}
              </button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
