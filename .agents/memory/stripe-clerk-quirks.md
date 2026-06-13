---
name: Stripe and Clerk quirks
description: Non-obvious version-specific behaviours for Stripe v22 and Clerk React in this project
---

## Stripe API version (v22.x)

**Rule:** Use `"2026-05-27.dahlia"` as the `apiVersion` string when constructing `new Stripe(...)`.

**Why:** Stripe v22 ships with a newer API version; the old `"2025-05-28.basil"` string causes a TS type error since it is not assignable to `LatestApiVersion`.

**How to apply:** Any time Stripe is instantiated in this codebase, use `apiVersion: "2026-05-27.dahlia"`.

## Stripe subscription `current_period_end`

**Rule:** Cast the Stripe subscription object via `(stripeSub as any).current_period_end` to avoid TS errors on newer API versions that restructure this field.

**Why:** The field shape changes between API versions; casting to `any` is safer than relying on the generated type.

## Clerk ClerkProvider redirect props

**Rule:** Use `signInFallbackRedirectUrl` and `signUpFallbackRedirectUrl` props on `<ClerkProvider>`, not `afterSignInUrl` / `afterSignUpUrl`.

**Why:** These props were removed in newer `@clerk/react` versions. TypeScript will error with "Property does not exist".

## Clerk portal session mutation

**Rule:** `useCreatePortalSession` mutation takes `void` — call `mutateAsync()` with no arguments, not `mutateAsync({})`.

**Why:** The OpenAPI spec defines the portal session endpoint with no request body; Orval generates a `void` mutation type.

## Clerk auth token wiring (web app)

**Rule:** In the ClerkProvider subtree, render an `ApiAuthWirer` component that calls `setAuthTokenGetter(() => getToken())` from `useAuth()`.

**Why:** The API client (`@workspace/api-client-react`) uses a module-level `_authTokenGetter` function to attach Bearer tokens. It must be set after Clerk loads and cleared on unmount.
