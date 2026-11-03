import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react";
import { AUTH_APPEARANCE, AuthShell } from "@/components/auth-shell";

export default function SignUpPage() {
  return (
    <AuthShell>
      <Suspense>
        <SignUp appearance={AUTH_APPEARANCE} />
      </Suspense>
    </AuthShell>
  );
}
