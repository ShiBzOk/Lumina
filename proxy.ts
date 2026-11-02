import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublic = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);
const isOnboarding = createRouteMatcher(["/onboarding"]);

// Decided here, before any page renders, so a signed-out request never
// receives page HTML. Everything that isn't sign-in or sign-up is protected.
export default clerkMiddleware(async (auth, req) => {
  if (isPublic(req)) return;

  const { userId, orgId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn({ returnBackUrl: req.url });

  // Every screen past sign-in belongs to an organization. A token without one
  // goes to onboarding, which activates or creates one.
  if (!orgId && !isOnboarding(req)) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
