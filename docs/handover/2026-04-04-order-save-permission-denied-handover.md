# Order Save Permission-Denied Handover

## A. Problem Summary

- User-facing symptom:
  - Customer checkout shows: `We could not save your order. Please try again before continuing.`
- Console error:
  - `FirebaseError: [code=permission-denied]: Missing or insufficient permissions.`
- When it occurs:
  - During normal customer self-order placement from the cart/checkout screen, after the frontend reaches the Firestore persistence step.
- Affected flow:
  - Confirmed blocker: customer self-order flow.
  - Staff-assisted flow has been improved in adjacent work, but was not fully re-proven end to end in this specific pass.

## B. Current Status

- Working:
  - Blank-screen/service-worker recovery work has already been applied in prior passes.
  - Null rating crash in `CustomizerModal` was already identified and handled in prior passes.
  - Staff-assisted create-order flow, assisted order history, bakery stock availability, and cafe reconciliation item ledger were improved in earlier passes.
  - `lib/orderPersistence.ts` now sends `frontAcceptedBy`, `completedBy`, and a normalized `loyaltyRedemption` object on create.
  - `lib/orderPersistence.ts` now contains a temporary payload audit log immediately before `addDoc(...)`.
- Not working:
  - Customer self-order save still remains unresolved in live production behavior.
  - The checkout write still surfaces `permission-denied` after rebuild and hosting deploy.
- Staff-assisted flow:
  - The staff-assisted flow has had prior fixes and is believed more stable than before, but this handover does not claim a fresh end-to-end proof for staff-assisted order creation under live rules.
- Blank-screen issue:
  - Resolved as a separate issue. It is no longer the active blocker for the order-save bug.

## C. Order of Investigation So Far

1. Investigated blank-screen startup failures after deploy.
   - Earlier diagnosis included stale service worker and stale hashed asset bootstrap issues.
2. Identified and fixed a separate null-render crash in the ratings work.
   - `CustomizerModal` could render with a null item and hit a null property access.
3. Shifted to the concrete Firestore `permission-denied` failure on order save.
4. Traced the write path:
   - `views/OrdersView.tsx` customer checkout
   - `lib/orderPersistence.ts` `createOrder(...)`
   - `addDoc(collection(db, 'orders'), order)`
5. Compared the order payload shape against `isValidOrder()` in `firestore.rules`.
6. Found and patched payload fields that were required by the rules but missing from create.
7. Ran emulator-backed checks proving that older payload shapes were denied and newer payload shapes could pass at least part of the create contract.
8. Identified a remaining likely branch around `userId` ownership:
   - the client could include `userId`
   - the rule only permits `userId` when Firestore sees the same authenticated owner
9. Added temporary logging immediately before `addDoc(...)` so a new agent can inspect the live payload and auth state in the browser console.

## D. Fixes Already Attempted

### 1. Added required create-shape fields to the order payload

- What changed:
  - `frontAcceptedBy: null`
  - `completedBy: null`
  - normalized `loyaltyRedemption` object always present
- Why:
  - `isValidOrder()` requires these keys in `data.keys().hasAll(...)`.
- Whether verified:
  - Verified in local code comparison and emulator checks.
- Why it did or did not solve the issue:
  - It addressed one confirmed mismatch, but did not fully resolve the live customer self-order failure.

### 2. Normalized loyalty redemption shape on every create

- What changed:
  - `loyaltyRedemption` is always written with:
    - `selectedByCustomer`
    - `requestedAmount`
    - `appliedAmount`
    - `blockSize: 1000`
- Why:
  - `isValidOrder()` and `isValidOrderLoyaltyRedemption(...)` expect that map structure.
- Whether verified:
  - Verified against repo rules and included in emulator payload checks.
- Why it did or did not solve the issue:
  - It removed one known mismatch, but the live failure remained.

### 3. Tightened `userId` persistence to live auth ownership only

- What changed:
  - `createOrder(...)` now derives:
    - `authenticatedUserId = auth.currentUser?.uid ?? null`
    - `persistedUserId = input.userId` only if it matches the live authenticated uid
  - otherwise `userId` is omitted from the order document.
- Why:
  - `hasValidOrderUserId(data)` only allows `userId` if it matches the current authenticated owner.
- Whether verified:
  - Verified in code.
  - Not yet live-proven in production from this handover pass.
- Why it did or did not solve the issue:
  - This is a grounded remaining candidate fix, but it is still unresolved until production behavior is rechecked after deploy.

### 4. Added temporary payload audit logging before order create

- What changed:
  - `console.debug('orders-create payload audit', ...)` was added immediately before `addDoc(...)`.
- Why:
  - To capture the real live payload keys, field types, and auth state without guessing.
- Whether verified:
  - Present in code and buildable.
- Why it did or did not solve the issue:
  - This is diagnostic only. It does not solve the bug by itself.

## E. Current Most Likely Causes

Grounded causes only:

1. `userId` ownership mismatch with live Firebase Auth state
   - Evidence:
     - customer self-order path can carry a `userId`
     - rules allow `userId` only if `request.auth.uid == data.userId`
     - live production auth state at save time has not yet been captured from the new audit log
2. Deployed Firestore rules parity is still not directly proven against the repo
   - Evidence:
     - hosting was redeployed multiple times
     - rules were also reportedly deployed
     - but live repo-vs-project rules parity was not directly fetched and compared in this pass
3. Another `isValidOrder()` branch may still reject the live customer payload
   - Evidence:
     - repo audit found multiple strict branches
     - only some mismatches have been conclusively ruled out
     - the exact remaining live rejecting clause has not yet been captured from production

## F. Recommended Next Audit Path

Inspect these first, in order:

1. Open the live browser console and attempt a failing customer self-order save.
2. Capture the `orders-create payload audit` log emitted from `lib/orderPersistence.ts`.
3. Compare the live values directly against `isValidOrder()` in `firestore.rules`.
4. Specifically confirm:
   - `authUid`
   - `inputUserId`
   - `persistedUserId`
   - `orderKeys`
   - `orderEntryMode`
   - `checkoutPaymentChoice`
   - `frontAcceptedBy`
   - `completedBy`
   - `loyaltyRedemption`
   - `items[0]`
   - `subtotal`
   - `total`
5. Confirm whether the currently deployed Firestore rules actually match the repo version.
6. Identify the exact remaining rejecting clause, not just the top-level `allow create`.

## G. Deployment History Relevant to This Bug

Known relevant deploy activity already discussed in prior passes:

- Hosting-only deploys were run.
- `npm run build && firebase deploy --only hosting` was run.
- `firebase deploy --only firestore:rules,hosting` was run in prior work.
- Separate rules deploy activity was also discussed after `firebase.json` was updated to include the Firestore rules path.

What this eliminates:

- A stale hosting bundle alone is not sufficient to explain the current bug.
- The current blocker is now in the Firestore create path, not just in frontend startup.

What remains risky:

- Live Firestore rules parity with the repo is still not directly proven in this handover pass.

## H. Risk Notes

Do not break:

- staff-assisted order creation flow
- assisted order history
- bakery stock availability behavior
- cafe reconciliation item ledger behavior
- rating groundwork already added
- mobile/PWA recovery and the now-stable app bootstrap path

Do not broaden Firestore rules casually.

Preferred approach for the next agent:

- keep rules strict
- compare live payload to rule contract exactly
- fix the payload or make only a narrow rule correction if a rule is proven incorrectly strict for a valid new customer order
