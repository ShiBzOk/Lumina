import { SignIn } from "@clerk/nextjs";
import { Suspense } from "react";
import { AUTH_APPEARANCE, AuthShell } from "@/components/auth-shell";
import { PageTransition } from "@/components/page-transition";

export default function SignInPage() {
  return (
    <PageTransition>
      <AuthShell>
        <Suspense>
          <SignIn appearance={AUTH_APPEARANCE} />
        </Suspense>
      </AuthShell>
    </PageTransition>
  );
}
