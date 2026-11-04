import Link from "next/link";
import { Logo } from "@/components/logo";
import { PageTransition } from "@/components/page-transition";

// Any address the app doesn't have. The same artwork as every way in, the
// number large and soft behind it, and two ways out.
export default function NotFound() {
  return (
    <PageTransition>
      <div className="flex min-h-screen flex-col bg-surface p-3">
        <section className="relative flex flex-1 flex-col overflow-hidden rounded-[28px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/auth/petrol-band.svg" alt="" className="absolute inset-0 size-full" />
          <span
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-[42vw] leading-none font-semibold tracking-[-0.06em] text-white/[0.09] blur-[6px] select-none"
            aria-hidden
          >
            404
          </span>

          <div className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pt-6 pb-10 sm:px-6">
            <nav className="flex items-center justify-between text-white">
              <Logo />
              <span className="font-mono text-[11px] text-white/70">404</span>
            </nav>

            <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
              <p className="flex items-center gap-4 text-[11px] font-medium tracking-[0.2em] text-white/80 uppercase">
                <span className="h-px w-10 bg-white/50" aria-hidden />
                Page not found
                <span className="h-px w-10 bg-white/50" aria-hidden />
              </p>
              <h1 className="mt-7 max-w-3xl text-5xl leading-[1.02] font-semibold tracking-[-0.04em] text-white sm:text-7xl">
                Nothing lives here.
              </h1>
              <p className="mt-6 max-w-md text-[15px] leading-relaxed text-white/70">
                There&apos;s no page at this address. Lumina only shows what&apos;s really there, so it won&apos;t guess
                where you meant to go.
              </p>
              <div className="mt-10 flex items-center gap-2">
                <Link
                  href="/"
                  className="rounded-full bg-white px-6 py-3 text-[14px] font-medium text-petrol shadow-[0_10px_30px_-10px_rgb(0_0_0/0.4)] hover:bg-white/90"
                >
                  Back to Lumina →
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </PageTransition>
  );
}
