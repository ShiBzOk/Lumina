"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** Long enough that passing over a control on the way somewhere shows nothing. */
const DELAY_MS = 450;
/** Once one tip is up, moving to a neighbour shows its tip at once, as along a toolbar. */
const WARM_MS = 300;
const GAP = 6;
const EDGE = 8;

interface Tip {
  text: string;
  /** Centre of the control, where the arrow points. */
  x: number;
  /** The control's top and bottom edges. */
  top: number;
  bottom: number;
  /** Shown straight after another tip: it swaps in place rather than fading up again. */
  warm: boolean;
}

/**
 * One tooltip for the whole app. Any element with `data-tip` gets it on hover,
 * or on keyboard focus, so a control needs one attribute and no wrapper. It
 * lives at the top of the page, so no pane or canvas clips it. It fades up a
 * couple of pixels when it first appears, swaps in place when moving along a
 * row of controls, and is gone at once when anything is pressed.
 */
export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);
  const [placed, setPlaced] = useState<{ left: number; top: number; width: number; above: boolean } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let current: HTMLElement | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let warmUntil = 0;
    let showing = false;

    const show = (el: HTMLElement, warm: boolean) => {
      const text = el.dataset.tip;
      // An open menu is already saying what it is; a tip would sit on top of it.
      if (!text || !el.isConnected || el.getAttribute("aria-expanded") === "true") return;
      const r = el.getBoundingClientRect();
      showing = true;
      setTip({ text, x: r.left + r.width / 2, top: r.top, bottom: r.bottom, warm });
    };
    const hide = () => {
      clearTimeout(timer);
      if (showing) warmUntil = Date.now() + WARM_MS;
      showing = false;
      current = null;
      setTip(null);
    };
    const target = (e: Event) => (e.target instanceof Element ? e.target.closest<HTMLElement>("[data-tip]") : null);
    const enter = (el: HTMLElement | null) => {
      if (el === current) return;
      hide();
      current = el;
      const warm = Date.now() < warmUntil;
      if (el) timer = setTimeout(() => show(el, warm), warm ? 0 : DELAY_MS);
    };

    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== "touch") enter(target(e));
    };
    // Keyboard focus only: a click also focuses, and that shouldn't raise a tip.
    const onFocus = (e: FocusEvent) => {
      const el = target(e);
      if (el && el.matches(":focus-visible")) enter(el);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hide();
    const onLeaveWindow = (e: PointerEvent) => e.relatedTarget === null && hide();

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onLeaveWindow);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", hide);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("wheel", hide, { passive: true });
    window.addEventListener("blur", hide);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onLeaveWindow);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("wheel", hide);
      window.removeEventListener("blur", hide);
    };
  }, []);

  // Placed once its own size is known: under the control, or above it when
  // there's no room below, and never past the edge of the window.
  useLayoutEffect(() => {
    if (!tip || !box.current) return setPlaced(null);
    const { width, height } = box.current.getBoundingClientRect();
    const above = tip.bottom + GAP + height > window.innerHeight - EDGE;
    const left = Math.min(Math.max(tip.x - width / 2, EDGE), window.innerWidth - EDGE - width);
    setPlaced({ left, top: above ? tip.top - GAP - height : tip.bottom + GAP, width, above });
  }, [tip]);

  if (!tip) return null;
  return (
    <div
      ref={box}
      role="tooltip"
      // Fades in while drifting 2px away from the control. Only opacity and
      // translate move, never position, so it can't slide across the screen.
      className={`pointer-events-none fixed z-[1000] max-w-64 rounded-lg [overflow-wrap:anywhere] bg-[#141414] px-2.5 py-1.5 text-[11px] leading-snug text-white shadow-[0_4px_14px_rgba(0,0,0,0.18)] ${
        tip.warm
          ? ""
          : `transition-[opacity,translate] duration-150 ease-out motion-reduce:transition-none starting:opacity-0 ${
              placed?.above ? "starting:translate-y-0.5" : "starting:-translate-y-0.5"
            }`
      }`}
      // Hidden for the one frame before it is measured, so it never shows in the wrong place.
      style={placed ? { left: placed.left, top: placed.top } : { left: 0, top: 0, visibility: "hidden" }}
    >
      {tip.text}
      {placed && (
        <span
          aria-hidden
          className="absolute size-2 rotate-45 bg-[#141414]"
          style={{
            left: Math.min(Math.max(tip.x - placed.left - 4, 8), placed.width - 16),
            ...(placed.above ? { bottom: -4 } : { top: -4 }),
          }}
        />
      )}
    </div>
  );
}
