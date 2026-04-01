# Firebase Deploy Setup

## Current State

The project is set up for **Hosting + Cloud Functions** (both active).

- **Hosting** serves the built Vite/React app from `dist/`
- **Cloud Functions** are placeholder Firestore triggers (log-only, no business logic yet)

## Deploy Commands

### Hosting only (most common during frontend development)
```sh
npm run build
firebase deploy --only hosting
```

### Functions only
```sh
firebase deploy --only functions
# The predeploy hook in firebase.json runs `npm --prefix functions run build` automatically.
```

### Full deploy (Hosting + Functions)
```sh
npm run build
firebase deploy
```

## How Functions Build

`firebase.json` has a `predeploy` hook in the `functions` section:

```json
"predeploy": ["npm --prefix \"$RESOURCE_DIR\" run build"]
```

This runs `tsc` inside `functions/` before any functions deployment, generating `functions/lib/index.js` from `functions/src/index.ts`. The `lib/` directory is gitignored — it is always compiled fresh at deploy time.

To build manually:
```sh
npm --prefix functions install   # first time only
npm --prefix functions run build # outputs to functions/lib/
```

## What the Functions Do (currently)

Both functions are placeholders — they only write to logs:

- `onOrderCreated` — fires on new `orders/{orderId}` documents
- `onMenuItemUpdated` — fires on updates to `menuItems/{itemId}`

Neither function modifies data or sends notifications yet. They use the **firebase-functions v2 API** (`firebase-functions/v2/firestore`), which is required by `firebase-functions` ^6.0.0.

## Auth / Authorized Domains

Google Sign-In authorized domains must be managed manually in the Firebase Console:

**Firebase Console → Authentication → Settings → Authorized domains**

Add domains here when deploying to new environments (e.g., Hosting preview URLs, custom domains).

## Remaining Risks

- `functions/node_modules` is not committed. Run `npm --prefix functions install` after cloning.
- The placeholder functions will actually deploy to production when using `firebase deploy`. If you want Hosting-only deploys by default, use `firebase deploy --only hosting` until the functions have real logic worth shipping.
- Firebase project is aliased as both `default` and `prod` in `.firebaserc` — there is no separate staging project. All deploys go to `kuci-cafe-bakery`.
