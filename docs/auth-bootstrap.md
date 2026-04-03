# Auth Bootstrap

## Overview

The app uses Firebase Authentication with Google sign-in. After a successful auth session is established, the frontend immediately ensures a matching Firestore user document exists at `users/{uid}`.

There is no separate signup screen. First-time users are created automatically on their first successful Google sign-in.

## Final Flow

1. Internal user opens `/admin/login` or invite flow hands off to `/auth`.
2. `views/CustomerAuthView.tsx` starts Google auth:
   - mobile/small viewport: `signInWithRedirect`
   - desktop: `signInWithPopup`
3. `App.tsx` receives the authenticated user through `onAuthStateChanged`.
4. `lib/authBootstrap.ts` runs `ensureAppUserRecord(user)`.
5. If `users/{uid}` does not exist, it creates:
   - `uid`
   - `email`
   - `displayName`
   - `photoURL`
   - `role`
   - `isActive`
   - `createdAt`
   - `updatedAt`
6. If the doc already exists, it preserves the existing role and refreshes profile fields and `updatedAt`.
7. The app continues normally and the auth session persists through Firebase Auth's default web persistence.

## OAuth Redirect Domain

- KUCI serves from `https://kuci-cafe-bakery.web.app`
- Firebase `authDomain` is expected to resolve to `kuci-cafe-bakery.web.app`
- Required Google OAuth redirect handler URI:
  - `https://kuci-cafe-bakery.web.app/__/auth/handler`

## Initial Super Admin Bootstrap

The initial bootstrap email is:

- `fredkenogo@gmail.com`

Behavior:

- On first successful sign-in with that email, the created Firestore user document is assigned `role: "admin"`.
- On later sign-ins, the existing role is preserved.
- This logic is isolated in `lib/authBootstrap.ts` and mirrored in `firestore.rules`.

This is a temporary bootstrap path and should eventually be replaced with a controlled admin promotion flow.

## Firestore Rules

Rules now allow:

- authenticated users to create only their own `users/{uid}` doc
- authenticated users to read only their own user doc
- authenticated users to update only their own user doc while keeping the same role
- the bootstrap email to create its own user doc with `role: "admin"`
- admins to retain broader admin write access already used by the seed flow

## Known Limitations

- There is still no admin/staff management UI.
- There is still no role promotion/demotion UI.
- Admin bootstrap still relies on one hardcoded email, though it now exists in one helper and one rule function instead of scattered UI checks.
- The app does not yet subscribe to live role changes after sign-in; a refresh is needed if the Firestore user role is changed externally.
