# Pass 14 — Order Save Permission-Denied Fix

**Date:** 2026-04-08
**Status:** Deployed and live
**Affected path:** Customer self-order checkout → `lib/orderPersistence.ts` → Firestore `orders` collection

---

## 1. Problem

Customer self-order placement was failing at the Firestore persistence step with:

```
FirebaseError: [code=permission-denied]: Missing or insufficient permissions.
```

The user-facing message was:

> We could not save your order. Please try again before continuing.

No order was written to Firestore. The failure was reproducible on every customer checkout attempt after the prior passes deployed new payload fields and rules.

---

## 2. Investigation Summary

### 2.1 What prior passes had already ruled out

| Hypothesis | Result |
|---|---|
| Stale service worker / blank screen | Resolved in pass 12 — unrelated to this failure |
| Null `averageRating` crash in `CustomizerModal` | Fixed in pass 13 — unrelated |
| Missing `frontAcceptedBy` and `completedBy` keys | Found and patched in code in pass 13 |
| Missing `loyaltyRedemption` full shape | Found and patched in code in pass 13 |
| `userId` ownership mismatch | Logic narrowed in code in pass 13 |

### 2.2 What this pass confirmed

**Step 1 — Deployed rules vs. repo rules comparison**

Used the Firebase MCP tool (`firebase_get_security_rules`) to fetch the live deployed Firestore rules and compared them character-by-character against `firestore.rules` in the repo.

**Result: the deployed rules exactly matched the repo rules.** Rules were not the remaining blocker.

**Step 2 — Hosting deployment status**

The prior pass had made the correct code changes to `lib/orderPersistence.ts` but had not re-deployed the hosting. The live JS bundle was therefore still the old version — missing `frontAcceptedBy`, `completedBy`, and the correct `loyaltyRedemption` shape in the order payload.

**Root cause: stale hosting bundle.** The rules were correct. The code was correct. The fix was never shipped to production.

---

## 3. Root Cause

**Stale hosting deployment.**

The Firestore `allow create` rule for orders calls `isValidOrder(request.resource.data)`, which enforces:

```
data.keys().hasAll([
  ...
  'loyaltyRedemption',
  ...
  'frontAcceptedBy',
  'completedBy'
])
```

The old hosted JS bundle was not sending `frontAcceptedBy`, `completedBy`, or a fully-shaped `loyaltyRedemption` map. The rule rejected the write with `permission-denied`.

The code fix had already been written in the prior session but `firebase deploy --only hosting` had not been re-run after the build.

---

## 4. Code Fixes (already in repo from pass 13, now deployed)

All changes are in `lib/orderPersistence.ts` in the `createOrder()` function.

### 4.1 Added `frontAcceptedBy` and `completedBy` to the order payload

```ts
frontAcceptedBy: null,
completedBy: null,
```

**Why it was needed:** `isValidOrder()` lists both in `hasAll([...])`, meaning they are required keys. The old create payload omitted them entirely.

### 4.2 Always write a fully-shaped `loyaltyRedemption` map

```ts
loyaltyRedemption: {
  selectedByCustomer: input.loyaltyRedemption?.selectedByCustomer === true,
  requestedAmount: Number.isFinite(input.loyaltyRedemption?.requestedAmount)
    ? Math.max(0, input.loyaltyRedemption!.requestedAmount)
    : 0,
  appliedAmount: Number.isFinite(input.loyaltyRedemption?.appliedAmount)
    ? Math.max(0, input.loyaltyRedemption!.appliedAmount)
    : 0,
  blockSize: 1000,
},
```

**Why it was needed:** `isValidOrderLoyaltyRedemption()` requires a map with all four keys: `selectedByCustomer`, `requestedAmount`, `appliedAmount`, `blockSize`. The old code only wrote this map when loyalty was actively selected — omitting it for orders with no loyalty redemption.

### 4.3 Narrowed `userId` to only include when auth matches

```ts
const authenticatedUserId = auth.currentUser?.uid ?? null;
const persistedUserId =
  input.userId && authenticatedUserId && input.userId === authenticatedUserId
    ? input.userId
    : null;

// later:
...(persistedUserId ? { userId: persistedUserId } : {}),
```

**Why it was needed:** `hasValidOrderUserId(data)` in the rules permits `userId` only when `request.auth.uid == data.userId`. If `userId` was included but the session uid differed (e.g., uid from state vs. live auth at write time), the rule would reject the write. This change ensures `userId` is only written when we can guarantee ownership, and is omitted entirely otherwise.

---

## 5. What Was NOT Changed

- `firestore.rules` — already correct and deployed; no edits required in this pass
- `views/OrdersView.tsx` — checkout call site was already passing the correct input shape
- `public/sw.js` — service worker already self-unregisters on activation; no caching issue

---

## 6. Deployment

```bash
npm run build
firebase deploy --only hosting
```

Build output:

```
dist/assets/index-CwSIWuDw.js   1,292.55 kB │ gzip: 307.71 kB
✓ built in 6.05s
```

Deploy output:

```
✔  hosting[kuci-cafe-bakery]: release complete
Hosting URL: https://kuci-cafe-bakery.web.app
```

Firestore rules were **not** re-deployed in this pass — they were already confirmed correct and live.

---

## 7. Verification

A temporary payload audit log was added in pass 13 and is still present in `lib/orderPersistence.ts:441`:

```ts
console.debug('orders-create payload audit', { authUid, inputUserId, persistedUserId, orderKeys, fieldAudit })
```

To confirm the fix is working:

1. Open the live app at https://kuci-cafe-bakery.web.app
2. Place a customer self-order through checkout
3. Check the browser console for the `orders-create payload audit` log
4. Confirm no `permission-denied` error follows it
5. Confirm the order appears in the Firestore `orders` collection

Once confirmed, the `console.debug` block (`lib/orderPersistence.ts` lines 441–475) can be removed.

---

## 8. Do Not Break

The following flows were not touched in this pass and must remain working:

- Staff-assisted order creation
- Assisted order history
- Bakery stock availability
- Cafe reconciliation item ledger
- Item rating submission (`itemRatings` collection write)
- Mobile / PWA app bootstrap and blank-screen recovery

---

## 9. Still Pending (out of scope for this pass)

| Item | Status |
|---|---|
| `functions/src/index.ts` — item rating aggregate function | Code complete, not yet deployed |
| `lib/itemRatings.ts` — client-side rating submission | Code complete, not yet committed or deployed |
| Remove `console.debug` audit log from `orderPersistence.ts` | Pending live confirmation |
| Commit all unstaged changes | Pending |
