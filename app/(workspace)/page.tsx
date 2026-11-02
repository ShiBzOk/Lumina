import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";

// Read straight off the session token during server rendering. The proxy has
// already guaranteed an organization is present.
async function CurrentOrganization() {
  const { orgId, sessionClaims } = await auth();
  const name = sessionClaims?.org_name;
  if (!orgId || !name) {
    throw new Error(
      "Session token has no org_name claim. Add it in Clerk Dashboard → Sessions → Customize session token.",
    );
  }
  return (
    <p className="text-xs text-muted">
      <span className="font-medium text-foreground">{name}</span>{" "}
      <span className="font-mono">{orgId}</span>
    </p>
  );
}

export default function WorkspacePage() {
  return (
    <div className="px-4 py-3">
      <Suspense>
        <CurrentOrganization />
      </Suspense>
    </div>
  );
}
