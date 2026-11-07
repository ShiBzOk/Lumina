export {};

declare global {
  // Added in Clerk Dashboard → Sessions → Customize session token, so the
  // organization's name and the person's display name are readable from the
  // token without asking Clerk.
  interface CustomJwtSessionClaims {
    org_name?: string;
    user_name?: string;
  }
}
