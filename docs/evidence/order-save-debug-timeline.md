# Order Save Debug Timeline

## Chronological Timeline

### 2026-04-04 to 2026-04-05: Blank-screen and post-deploy runtime investigation

- Hypothesis:
  - stale service worker / cached shell / deleted hashed asset was causing the blank screen
- Files touched in surrounding passes:
  - `public/sw.js`
  - `index.tsx`
  - `firebase.json`
- Deploy activity discussed:
  - `firebase deploy --only hosting`
  - later also hosting + rules + functions in related recovery work
- Result:
  - blank-screen recovery work was applied
- What was disproven:
  - the current checkout `permission-denied` bug is not explained only by stale frontend assets
- What remains unresolved:
  - order save failure persisted after rebuild and hosting deploy

### 2026-04-04 to 2026-04-05: Null ratings crash investigation

- Hypothesis:
  - a ratings-related runtime crash was causing the blank screen
- Files touched in surrounding passes:
  - `components/CustomizerModal.tsx`
  - `lib/itemRatings.ts`
  - `hooks/useFirestore.ts`
  - `views/HomeView.tsx`
  - `views/MenuView.tsx`
  - `views/BakeryView.tsx`
- Deploy activity discussed:
  - hosting deploys as part of runtime recovery
- Result:
  - null rating access in `CustomizerModal` was identified as a separate issue and addressed in prior work
- What was disproven:
  - the remaining checkout failure is not a UI null-crash issue
- What remains unresolved:
  - Firestore order save still fails with `permission-denied`

### 2026-04-05: Firestore create-path audit for order save

- Hypothesis:
  - `orders` create payload no longer matched Firestore create rules
- Files touched:
  - `lib/orderPersistence.ts`
  - `firestore.rules`
  - `views/OrdersView.tsx`
  - `App.tsx`
- Deploy activity discussed:
  - rebuilds and hosting deploys had already happened
- Result:
  - exact write path identified:
    - `orders/{autoId}`
    - `addDoc(collection(db, 'orders'), order)`
  - customer self-order checkout path identified:
    - `views/OrdersView.tsx`
  - `isValidOrder()` rule path identified:
    - `match /orders/{orderId}`
    - `allow create: if isValidOrder(request.resource.data);`
- What was disproven:
  - this was not just a frontend visual failure
- What remains unresolved:
  - which exact remaining rule clause is still rejecting the live production payload

### 2026-04-05: Missing required order fields

- Hypothesis:
  - create payload omitted fields required by `isValidOrder()`
- Files touched:
  - `lib/orderPersistence.ts`
- Deploy activity:
  - no new deploy recorded in this handover pass
- Result:
  - confirmed mismatch:
    - `frontAcceptedBy`
    - `completedBy`
    - `loyaltyRedemption` required shape
  - payload was updated to include those fields
- What was disproven:
  - the previous create payload was not fully valid against repo rules
- What remains unresolved:
  - live production still reported `permission-denied` after rebuild and hosting deploy

### 2026-04-05: Emulator checks for payload-vs-rules

- Hypothesis:
  - old payload shape should fail and corrected payload shape should pass
- Files touched:
  - temporary local emulator scripts only during the audit
- Deploy activity:
  - none
- Result:
  - emulator checks showed older order shapes could be denied
  - corrected create shape could pass at least part of the rule contract
- What was disproven:
  - at least one payload mismatch was real, not speculative
- What remains unresolved:
  - emulator success does not yet prove live production behavior

### 2026-04-05: `userId` ownership mismatch theory

- Hypothesis:
  - customer self-order includes `userId`, but Firestore does not see a matching authenticated owner at save time
- Files touched:
  - `lib/orderPersistence.ts`
  - `App.tsx`
  - `views/OrdersView.tsx`
- Deploy activity:
  - none recorded in this handover pass
- Result:
  - code now conditionally omits `userId` unless:
    - `auth.currentUser?.uid` exists
    - it matches `input.userId`
  - temporary live payload audit logging added before `addDoc(...)`
- What was disproven:
  - none yet from live production
- What remains unresolved:
  - whether this is the actual live remaining rejection branch

### 2026-04-05: Rules deploy parity concern

- Hypothesis:
  - deployed Firestore rules may not match repo rules
- Files touched:
  - no direct code change required for this handover
- Deploy activity already discussed in prior passes:
  - `firebase deploy --only hosting`
  - `npm run build && firebase deploy --only hosting`
  - `firebase deploy --only firestore:rules,hosting`
- Result:
  - hosting parity alone was effectively ruled out
  - rules parity remains unproven from direct live inspection in this handover pass
- What was disproven:
  - stale hosting bundle alone is not enough to explain the current blocker
- What remains unresolved:
  - whether the project currently runs the same Firestore rules as the repo

## Still Unresolved

- exact live production payload at the time of failure
- exact live production rejecting clause inside `isValidOrder()`
- whether `auth.currentUser` is present during customer self-order save
- whether deployed Firestore rules exactly match the repo rules
