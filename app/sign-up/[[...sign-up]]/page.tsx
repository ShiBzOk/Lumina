import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react";
import { AUTH_APPEARANCE, AuthShell } from "@/components/auth-shell";
import { PageTransition } from "@/components/page-transition";

export default function SignUpPage() {
  return (
    <PageTransition>
      <AuthShell>
        <Suspense>
          <SignUp appearance={AUTH_APPEARANCE} />
        </Suspense>
      </AuthShell>
    </PageTransition>
  );
}
