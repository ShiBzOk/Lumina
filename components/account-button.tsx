"use client";

import { UserButton } from "@clerk/nextjs";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// Clerk draws its button as soon as it has loaded, and the server never can.
// Inside a Suspense boundary that streams in late, Clerk is often loaded by the
// time the boundary hydrates, so the two disagree. Hydration renders with the
// server's answer (nothing); the button appears on the render after.
export function AccountButton() {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return hydrated ? <UserButton /> : null;
}
