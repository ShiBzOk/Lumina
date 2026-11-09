"use client";

import { useState } from "react";
import { shareAddress, type View } from "@/lib/map/view";
import { Icon } from "./icons";

// Long enough for any ordinary view, short enough that every browser, chat
// client and proxy on the way passes it through whole.
const ADDRESS_LIMIT = 2000;

type Copied = { view: View; leftOut: string[] } | { view: View; error: string };

/**
 * Copies the address of exactly this view. What it says afterwards belongs to
 * the view it copied: once anything changes, the button is plain again.
 */
export function CopyLink({ path, view }: { path: string; view: View }) {
  const [copied, setCopied] = useState<Copied | null>(null);
  const shown = copied?.view === view ? copied : null;

  const copy = () => {
    const { url, leftOut } = shareAddress(window.location.origin + path, view, ADDRESS_LIMIT);
    navigator.clipboard.writeText(url).then(
      () => setCopied({ view, leftOut }),
      (error: unknown) => setCopied({ view, error: error instanceof Error ? error.message : "The clipboard refused it" }),
    );
  };

  const note =
    shown === null
      ? null
      : "error" in shown
        ? `Couldn't copy the link: ${shown.error}`
        : shown.leftOut.length > 0
          ? `The full view is too long for an address. Copied without ${shown.leftOut.join(", ")}.`
          : null;

  return (
    <div className="relative">
      <button
        type="button"
        data-tour="share"
        onClick={copy}
        data-tip={shown && !("error" in shown) ? "Link copied" : "Copy a link to this exact view: selection, open walk, cards and Compare"}
        aria-label="Share: copy a link to this view"
        className={`flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] hover:bg-background ${
          shown && !("error" in shown) ? "text-accent" : "text-foreground"
        }`}
      >
        <Icon name={shown && !("error" in shown) ? "check" : "copy"} className="size-3.5" />
        {shown && !("error" in shown) ? "Copied" : "Share"}
      </button>
      {note && (
        <div className="absolute top-full right-0 z-30 mt-1.5 flex w-72 items-start gap-2 rounded-lg bg-surface px-3 py-2 text-[11px] leading-snug shadow-[0_2px_10px_rgba(16,24,40,0.08)] ring-1 ring-border">
          <Icon name="alert" className="mt-px size-3.5 shrink-0 text-muted" />
          <span className="min-w-0 flex-1 break-words">{note}</span>
          <button type="button" onClick={() => setCopied(null)} data-tip="Dismiss" aria-label="Dismiss" className="shrink-0 text-muted hover:text-foreground">
            <Icon name="x" className="size-3" />
          </button>
        </div>
      )}
    </div>
  );
}
