import { SignIn } from "@clerk/nextjs";
import { Suspense } from "react";
import { AUTH_APPEARANCE, AuthShell } from "@/components/auth-shell";

export default function SignInPage() {
  return (
    <AuthShell>
      <Suspense>
        <SignIn appearance={AUTH_APPEARANCE} />
      </Suspense>
    </AuthShell>
  );
}
