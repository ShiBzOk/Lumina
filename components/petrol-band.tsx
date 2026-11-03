import type { ReactNode } from "react";

/**
 * The login's artwork carried onto the signed-in screens as a band, with a
 * card rising over its cream bottom edge so the two read as one piece.
 * `header` sits on the dark top; `children` is the card.
 */
export function PetrolBand({ header, tall = false, children }: { header: ReactNode; tall?: boolean; children: ReactNode }) {
  return (
    <>
      <section className="relative m-3 overflow-hidden rounded-3xl">
        {/* A copy of the login artwork that stretches instead of cropping, so the band runs from petrol at the top to cream at the bottom whatever its height. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/auth/petrol-band.svg" alt="" className="absolute inset-0 size-full" />
        <div className={`relative mx-auto w-full max-w-2xl px-4 ${tall ? "pt-20 pb-44" : "pt-12 pb-32"}`}>{header}</div>
      </section>
      <div className="relative mx-auto -mt-24 w-full max-w-2xl px-4 pb-12">
        <div className="overflow-hidden rounded-2xl bg-surface shadow-[0_1px_2px_rgb(18_62_73/0.1),0_20px_40px_-18px_rgb(18_62_73/0.45)] ring-1 ring-petrol/10">
          {children}
        </div>
      </div>
    </>
  );
}
