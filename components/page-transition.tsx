import { ViewTransition, type ReactNode } from "react";

/**
 * Every page sits in one of these, so moving between pages is a short
 * crossfade: the old page leaves fast, the new one settles in after it.
 * Only entering and leaving animate; a refresh or a same-page update
 * (`default="none"`) never does, so the map never moves on its own.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="page-enter" exit="page-exit" default="none">
      {children}
    </ViewTransition>
  );
}
