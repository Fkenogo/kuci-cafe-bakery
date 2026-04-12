# Order Save Payload vs Rules

## A. Exact Write Path

- Document path:
  - `orders/{autoId}`
- Frontend write function:
  - `addDoc(collection(db, 'orders'), order)` in `createOrder(...)`
  - file: `lib/orderPersistence.ts`
- Checkout UI path that triggers it:
  - customer self-order checkout in `views/OrdersView.tsx`
  - `handleCheckout(...)` calls `createOrder(...)`

## B. Rules Under Suspicion

Primary create gate:

- `match /orders/{orderId}` in `firestore.rules`
- `allow create: if isValidOrder(request.resource.data);`

Exact rule clauses already identified as relevant:

- `isValidOrder(data)` key requirements:
  - `data.keys().hasAll([...])`
  - includes:
    - `loyaltyRedemption`
    - `frontAcceptedBy`
    - `completedBy`
- `isValidOrder(data)` field/value checks:
  - `status == 'pending'`
  - `paymentStatus == 'pending'`
  - `financialStatus == 'unpaid'`
  - `serviceMode in ['dine_in', 'pickup', 'delivery']`
  - `isValidCheckoutPaymentChoice(data.checkoutPaymentChoice)`
  - `hasValidOrderEntryMetadata(data)`
  - `isValidOrderCustomer(data.customer)`
  - `hasValidOrderCustomerIdentityByMode(data)`
  - `data.items is list`
  - `data.items.size() > 0`
  - `isValidOrderItem(data.items[0])`
  - `data.subtotal is number && data.subtotal > 0`
  - `data.deliveryFee is number && data.deliveryFee >= 0`
  - `data.total is number && data.total > 0`
  - `isValidOrderStations(data)`
  - `hasValidOrderUserId(data)`

Exact ownership rule already identified:

- `hasValidOrderUserId(data)`:
  - allows no `userId`
  - allows `userId == null`
  - or requires `data.userId is string && isOwner(data.userId)`

## C. Current Payload Contract

Current intended order payload shape from `lib/orderPersistence.ts`:

- `createdAt: serverTimestamp()`
- `updatedAt: serverTimestamp()`
- `businessDate: toBusinessDate()`
- `status: 'pending'`
- `paymentStatus: 'pending'`
- `payment`
  - `method: null`
  - `amountReceived: 0`
  - `currency: 'RWF'`
  - `isComplimentary: false`
  - `isCredit: false`
  - `recordedBy: null`
  - `recordedAt: null`
- `financialStatus: 'unpaid'`
- `serviceMode`
  - derived from `orderType`
  - expected values: `dine_in`, `pickup`, `delivery`
- `serviceArea`
  - derived operationally: `cafe`, `bakery`, or `mixed`
- `frontLane`
  - `cafe_front` or `bakery_front`
- `dispatchMode`
  - `station_prep`, `front_only`, `bakery_front_only`, or `mixed_split`
- `orderEntryMode`
  - `customer_self` or `staff_assisted`
- staff-assisted only metadata if applicable:
  - `orderSource`
  - `createdByStaffUid`
  - `createdByStaffRole`
  - `createdByStaffName`
  - `assistedCustomerName`
  - `assistedCustomerPhoneNormalized`
- `customer`
  - `name`
  - `phone`
  - optional `location`
- `items`
  - sanitized order items list
- `subtotal`
- `deliveryFee`
- `total`
- `loyaltyRedemption`
  - `selectedByCustomer`
  - `requestedAmount`
  - `appliedAmount`
  - `blockSize: 1000`
- `checkoutPaymentChoice`
  - `cash`, `mobile_money`, or `whatsapp`
- `notes`
- `routedTasks`
- `involvedStations`
- `stationStatus`
- `frontAcceptedBy: null`
- `completedBy: null`
- `userId`
  - now only included if `auth.currentUser?.uid` exists and exactly matches `input.userId`

## D. Mismatches Already Found

### 1. Missing `frontAcceptedBy` and `completedBy`

- Found:
  - yes
- Why it mattered:
  - `isValidOrder(data)` required those keys in `hasAll([...])`
- Fixed in code:
  - yes
- Deployed:
  - not proven from this handover pass
- Still unresolved:
  - live parity still requires confirmation

### 2. `loyaltyRedemption` required shape

- Found:
  - yes
- Why it mattered:
  - rules required a redemption map with the full field set and numeric constraints
- Fixed in code:
  - yes
- Deployed:
  - not proven from this handover pass
- Still unresolved:
  - live parity still requires confirmation

### 3. `userId` ownership rule

- Found:
  - yes
- Why it mattered:
  - if `userId` is present, `hasValidOrderUserId(data)` requires it to match the live authenticated owner
- Fixed in code:
  - partially and intentionally narrowed
  - `userId` is now omitted unless the live auth uid matches the input uid
- Deployed:
  - not proven from this handover pass
- Still unresolved:
  - this is one of the strongest remaining live candidates

## E. Unknowns Still Remaining

- exact live `orders-create payload audit` console output from production after the latest payload changes
- exact auth state visible to Firestore during customer self-order save
- whether the current deployed Firestore rules exactly match the repo rules
- whether another strict branch inside `isValidOrder()` is still rejecting the live customer payload

## F. Exact Next Debug Step for New Agent

1. Deploy current code and rules together:
   - `firebase deploy --only firestore:rules,hosting`
2. Reproduce a customer self-order save failure in production or a controlled live environment.
3. Open the browser console and capture the `orders-create payload audit` log.
4. Compare the live payload keys and field types directly against `isValidOrder()` and helper clauses.
5. Confirm specifically:
   - whether `auth.currentUser` is present
   - whether `inputUserId` is present
   - whether `persistedUserId` is present or omitted
   - whether the final `orderKeys` match the required rule contract
6. Identify the exact remaining rejecting clause, not just `allow create`.

## Known Evidence To Preserve

- Failing write path:
  - `orders/{autoId}`
  - via `addDoc(collection(db, 'orders'), order)`
  - from `lib/orderPersistence.ts`
  - triggered by customer self-order checkout path in `views/OrdersView.tsx`
- Past investigated causes included:
  - stale service worker / cached shell
  - null `averageRating` crash in `CustomizerModal`
  - missing `frontAcceptedBy` / `completedBy` on order payload
  - `loyaltyRedemption` required shape
  - `userId` ownership mismatch with Firestore rules
  - possible repo-vs-live deploy mismatch
- Current console symptom still remaining:
  - `permission-denied` on order persistence
  - after rebuild and hosting deploy
  - after rules deploy had already been discussed in prior passes
- Important deployment steps already discussed:
  - `firebase deploy --only hosting`
  - `npm run build && firebase deploy --only hosting`
  - `firebase deploy --only firestore:rules,hosting`
- Important nuance:
  - `lib/orderPersistence.ts` now conditionally omits `userId` unless `auth.currentUser.uid` matches `input.userId`
  - live production confirmation of that branch remains unresolved
