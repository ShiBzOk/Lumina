"use client";

import { useOrganizationList } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Making an organization active rewrites the session token, which only the
// browser-side Clerk session can do. Navigation waits until the new token is
// in place so the proxy sees the organization on the next request.
export function ActivateOrganization({
  organizationId,
}: {
  organizationId: string;
}) {
  const { isLoaded, setActive } = useOrganizationList();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    setActive({ organization: organizationId })
      .then(() => router.replace("/"))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      );
  }, [isLoaded, setActive, organizationId, router]);

  if (error) {
    return <p className="text-danger">Could not open workspace: {error}</p>;
  }
  return <p>Opening workspace…</p>;
}
