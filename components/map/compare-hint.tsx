"use client";

import { useEffect, useState } from "react";
import { compareHintKey, hasSeen, markSeen, tourKey } from "./seen";

/**
 * Points at the version menu once, for someone who can now compare two maps.
 * It blocks nothing, because unlike the tour it arrives while they're working.
 */
export function CompareHint({ user }: { user: string }) {
  // Read once: finishing the tour on this open must not bring a hint straight after it.
  const [eligible] = useState(() => typeof window !== "undefined" && hasSeen(tourKey(user)) && !hasSeen(compareHintKey(user)));
  const [dismissed, setDismissed] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!eligible || dismissed) return;
    const el = document.querySelector('[data-tour="versions"]');
    if (!el) return;
    const measure = () => setRect(el.getBoundingClientRect());
    // Opening the menu is doing what the hint asks, and the menu opens where the hint sits.
    const onOpened = () => {
      markSeen(compareHintKey(user));
      setDismissed(true);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    el.addEventListener("click", onOpened);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      el.removeEventListener("click", onOpened);
    };
  }, [eligible, dismissed, user]);

  if (!eligible || dismissed || !rect) return null;

  return (
    <div
      role="status"
      className="fixed z-40 w-64 rounded-xl bg-surface p-3 shadow-[0_8px_24px_rgba(16,24,40,0.16)] ring-1 ring-border transition-[opacity,translate] duration-(--spring-duration) ease-(--spring) starting:-translate-y-1.5 starting:opacity-0"
      style={{ left: rect.left, top: rect.bottom + 8 }}
    >
      <p className="text-[13px] font-semibold">Compare two versions</p>
      <p className="mt-1 text-[11.5px] leading-[17px] text-muted">This repository has more than one finished map. Open this menu to see what changed between them.</p>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => {
            markSeen(compareHintKey(user));
            setDismissed(true);
          }}
          className="rounded-md bg-foreground px-2.5 py-1 text-[11px] font-medium text-surface transition-[scale] duration-100 hover:scale-[1.04] active:scale-95"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
