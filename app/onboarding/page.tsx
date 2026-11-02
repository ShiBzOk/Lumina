import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ActivateOrganization } from "./activate-organization";

// The one place the app calls Clerk's API: a token with no organization in it.
// After activation the organization travels in the token and nothing else asks.
async function findOrCreateOrganization(userId: string): Promise<string> {
  const client = await clerkClient();
  const { data: memberships } =
    await client.users.getOrganizationMembershipList({ userId, limit: 100 });

  // Newest membership wins, so someone who just accepted an invitation lands
  // in the organization they were invited to rather than an older one.
  const newest = memberships.reduce<(typeof memberships)[number] | undefined>(
    (latest, m) => (!latest || m.createdAt > latest.createdAt ? m : latest),
    undefined,
  );
  if (newest) return newest.organization.id;

  const created = await client.organizations.createOrganization({
    name: "Personal workspace",
    createdBy: userId,
  });
  return created.id;
}

async function Onboarding() {
  const { userId, orgId } = await auth();
  if (!userId) redirect("/sign-in");
  if (orgId) redirect("/");

  const organizationId = await findOrCreateOrganization(userId);
  return <ActivateOrganization organizationId={organizationId} />;
}

export default function OnboardingPage() {
  return (
    <main className="flex flex-1 items-center justify-center text-xs text-muted">
      <Suspense fallback={<p>Preparing workspace…</p>}>
        <Onboarding />
      </Suspense>
    </main>
  );
}
