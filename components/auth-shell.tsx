import type { SignIn } from "@clerk/nextjs";
import type { ComponentProps, ReactNode } from "react";
import { Logo } from "@/components/logo";

/** Clerk's own forms, flattened onto the page and restyled. Which methods appear is set in the Clerk dashboard. */
export const AUTH_APPEARANCE: ComponentProps<typeof SignIn>["appearance"] = {
  options: {
    elevation: "flush",
    logoPlacement: "none",
    socialButtonsVariant: "blockButton",
    socialButtonsPlacement: "bottom",
  },
  variables: {
    colorPrimary: "#111827",
    colorForeground: "#111827",
    colorMutedForeground: "#6b7280",
    colorInput: "#f3f4f6",
    colorBackground: "#ffffff",
    borderRadius: "0.5rem",
    fontFamily: "var(--font-geist-sans)",
  },
  elements: {
    rootBox: { width: "100%" },
    cardBox: { width: "100%", maxWidth: "none" },
    card: { padding: 0, gap: "1.75rem" },
    header: { textAlign: "center" },
    headerTitle: { fontSize: "1.75rem", fontWeight: 600, lineHeight: 1.15, letterSpacing: "-0.025em" },
    headerSubtitle: { fontSize: "13px", color: "#6b7280" },
    formFieldLabel: { fontSize: "13px", fontWeight: 500 },
    formFieldInput: { height: "2.75rem", fontSize: "13px", backgroundColor: "#f3f4f6", border: "none", boxShadow: "none" },
    formButtonPrimary: { height: "2.75rem", fontSize: "13px", backgroundColor: "#111827", boxShadow: "none" },
    socialButtonsBlockButton: { height: "2.75rem", fontSize: "13px", boxShadow: "none", border: "1px solid #e4e7ec" },
    dividerText: { fontSize: "11px" },
    footer: { background: "none" },
    footerActionText: { fontSize: "13px" },
    footerActionLink: { fontSize: "13px", fontWeight: 600, color: "#111827" },
  },
};

/** Full-screen split: the artwork and what the tool does on the left, the form on the right. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-surface">
      <aside className="relative m-3 hidden w-[46%] shrink-0 overflow-hidden rounded-3xl lg:block">
        {/* Decorative, so a plain img: next/image would only re-encode a vector. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/auth/petrol.svg" alt="" className="absolute inset-0 size-full object-cover" />
        {/* The artwork runs from deep teal at the top to near-white at the bottom, so the label is light and the headline takes the teal. */}
        <div className="relative flex h-full flex-col justify-between p-10">
          <p className="flex items-center gap-4 text-[11px] font-medium tracking-[0.2em] text-white uppercase">
            Dependency maps
            <span className="h-px w-24 bg-white/70" aria-hidden />
          </p>
          <div>
            <h2 className="text-5xl leading-[1.02] font-semibold tracking-[-0.035em] text-[#123e49] xl:text-6xl">
              See how your
              <br />
              code connects
            </h2>
            <p className="mt-5 max-w-sm text-[13px] leading-relaxed text-[#123e49]/75">
              Point Lumina at a public GitHub repository. Every import is parsed and every link on the map is one the code
              really makes.
            </p>
          </div>
        </div>
      </aside>

      <main className="flex flex-1 flex-col items-center px-6 py-8">
        <Logo />
        <div className="flex w-full max-w-sm flex-1 items-center py-10">{children}</div>
      </main>
    </div>
  );
}
