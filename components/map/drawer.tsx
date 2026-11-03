"use client";

import { useState, type ReactNode } from "react";

interface DrawerProps {
  open: boolean;
  /** The edge it lives on, and so the way it slides. */
  side: "left" | "right";
  /** The panel's width when open, as CSS. */
  width: string;
  children: ReactNode;
}

// A side panel that slides away from the canvas the way it came, rather than
// vanishing. It narrows instead of moving over the canvas, so the canvas
// resizes with it and the map stays framed the whole way. The panel stays
// mounted until it is out of sight, then unmounts so it costs nothing shut.
export function Drawer({ open, side, width, children }: DrawerProps) {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  return (
    <div
      inert={!open}
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && !open) setMounted(false);
      }}
      // Anchored to the edge away from the canvas, so the content slides out
      // past that edge rather than being cut off where it stands.
      className={`flex shrink-0 overflow-hidden transition-[width] duration-(--spring-duration) ease-(--spring) ${side === "left" ? "justify-end" : ""}`}
      style={{ width: open ? width : 0 }}
    >
      {mounted && (
        <div className="flex h-full shrink-0" style={{ width }}>
          {children}
        </div>
      )}
    </div>
  );
}
