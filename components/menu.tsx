"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/map/icons";

/** A header button that opens a list below it; shut by a click elsewhere or Escape. */
export function Menu({
  icon,
  label,
  children,
}: {
  icon: IconName;
  /** What the button says: the thing currently chosen. */
  label: ReactNode;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target instanceof Node && root.current?.contains(e.target))) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-[11px] hover:bg-background"
      >
        <Icon name={icon} className="size-3.5 text-accent" />
        {label}
        <Icon name="chevronDown" className="size-3 text-muted" />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-30 mt-1 w-80 overflow-hidden rounded-xl bg-surface shadow-[0_8px_24px_rgba(16,24,40,0.12)] ring-1 ring-border">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuHeading({ children }: { children: ReactNode }) {
  return <p className="px-3 pt-2.5 pb-1 text-[10px] text-muted">{children}</p>;
}

/** The fixed actions under a menu's list. */
export function MenuFooter({ children }: { children: ReactNode }) {
  return <div className="border-t border-border p-1">{children}</div>;
}

export const MENU_ROW = "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-background";
