import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { INVITATION_PARAM } from "@/lib/invitation-param";

const isPublic = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);
const isOnboarding = createRouteMatcher(["/onboarding"]);

// Decided here, before any page renders, so a signed-out request never
// receives page HTML. Everything that isn't sign-in or sign-up is protected,
// except `/` itself, which signed out is the landing page.
export default clerkMiddleware(async (auth, req) => {
  const { userId, orgId, redirectToSignIn } = await auth();

  // An invitation email's link carries a ticket that Clerk only redeems for
  // someone signed out; a signed-in visitor would bounce off sign-in with the
  // invitation untouched. Send them to the organization menu to accept it.
  if (isPublic(req)) {
    if (userId && req.nextUrl.searchParams.has("__clerk_ticket")) {
      return NextResponse.redirect(new URL(`/?${INVITATION_PARAM}`, req.url));
    }
    return;
  }


  if (!userId) {
    if (req.nextUrl.pathname === "/") return;
    return redirectToSignIn({ returnBackUrl: req.url });
  }

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
