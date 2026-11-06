"use client";

import { useEffect, useRef } from "react";

// The hero's app window: turned a little to the side, with a strip of light
// running round its frame. With a mouse it also leans towards the cursor. The
// resting pose and the strip are CSS (see .hero-* in globals.css); this only
// adds the cursor's part.

const SRC = "/landing/app.png";
const W = 1328;
const H = 853;

/** Degrees the window leans at most, either way, on top of its resting tilt. */
const LEAN_Y = 7;
const LEAN_X = 4;
/** Share of the remaining distance covered each frame. Lower is softer. */
const FOLLOW = 0.07;

export function HeroWindow() {
  const ref = useRef<HTMLDivElement>(null);

  // The pointer sets targets; each frame closes part of the gap, so the lean
  // trails the cursor instead of snapping to it, and the loop runs only while
  // there's a gap. Only for a real mouse with motion allowed: a touch screen
  // has no cursor to follow, and reduced motion keeps the window still.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)").matches) return;

    const goal = { ry: 0, rx: 0 };
    const now = { ...goal };
    let frame = 0;

    const draw = () => {
      el.style.setProperty("--lean-y", now.ry.toFixed(3));
      el.style.setProperty("--lean-x", now.rx.toFixed(3));
    };
    const step = () => {
      let moving = false;
      for (const k of ["ry", "rx"] as const) {
        const gap = goal[k] - now[k];
        if (Math.abs(gap) < 0.001) now[k] = goal[k];
        else {
          now[k] += gap * FOLLOW;
          moving = true;
        }
      }
      draw();
      frame = moving ? requestAnimationFrame(step) : 0;
    };
    const wake = () => {
      if (!frame) frame = requestAnimationFrame(step);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = el.getBoundingClientRect();
      const clamp = (n: number) => Math.min(1, Math.max(-1, n));
      // Lean measured from the window's centre across the whole screen, so it
      // responds anywhere on the page but never past its limit.
      const nx = clamp((e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2));
      const ny = clamp((e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2));
      goal.ry = nx * LEAN_Y;
      goal.rx = -ny * LEAN_X;
      wake();
    };
    const onLeave = () => {
      goal.ry = 0;
      goal.rx = 0;
      wake();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="hero-rise hero-stage">
      <div ref={ref} className="hero-tilt relative rounded-[18px] p-[2px]">
        {/* The strip twice: a soft halo behind, and the crisp line itself, which
            shows only as the 2px the window leaves uncovered. */}
        <div className="hero-strip hero-strip-glow absolute inset-0 rounded-[18px]" aria-hidden />
        <div className="hero-strip absolute inset-0 rounded-[18px]" aria-hidden />
        <figure className="relative overflow-hidden rounded-2xl bg-background shadow-[0_30px_60px_-24px_rgb(18_62_73/0.5)]">
          <div className="flex items-center gap-1.5 border-b border-border bg-surface px-3.5 py-2.5">
            <span className="size-2.5 rounded-full bg-border" aria-hidden />
            <span className="size-2.5 rounded-full bg-border" aria-hidden />
            <span className="size-2.5 rounded-full bg-border" aria-hidden />
            <span className="-ml-[34px] flex-1 text-center font-mono text-[11px] text-muted">vercel/commerce</span>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={SRC}
            width={W}
            height={H}
            alt="Lumina showing the dependency map of vercel/commerce, with the components/layout/navbar folder selected"
            className="block h-auto w-full"
          />
        </figure>
      </div>
    </div>
  );
}
