# Assisted Order History Audit (Pass 06 — 2026-04-03)

## Files Audited

- `types.ts`
- `lib/orderPersistence.ts`
- `lib/customerRewards.ts`
- `lib/orderRouting.ts`
- `views/OrdersView.tsx`
- `views/StaffOrderEntryView.tsx`
- `views/AdminOrdersView.tsx`
- `views/FrontServiceOrdersView.tsx`
- `components/staff/OperationalOrdersBoard.tsx`
- `App.tsx`

---

## Schema Fields Audit

### Fields That ALREADY Existed on `PersistedOrder` (types.ts)

| Field | Type | Written in orderPersistence.ts | Notes |
|---|---|---|---|
| `orderEntryMode` | `'customer_self' \| 'staff_assisted'` | Yes — line 397 | Written for all orders |
| `orderSource` | `'walk_in' \| 'phone_call' \| 'whatsapp' \| 'other'` | Yes — line 400, staff_assisted only | |
| `createdByStaffUid` | `string` | Yes — line 401, staff_assisted only | |
| `createdByStaffRole` | `Exclude<UserRole, 'user'>` | Yes — line 402, staff_assisted only | |
| `createdByStaffName` | `string` | Yes — line 403, staff_assisted only | |
| `assistedCustomerName` | `string` | Yes — line 404, staff_assisted only | |
| `assistedCustomerPhoneNormalized` | `string` | Yes — line 405, staff_assisted only | |
| `businessDate` | `string` | Yes — line 380 | All orders |
| `customer.name` | `string` | Yes | All orders |
| `customer.phone` | `string` | Yes | All orders |
| `total` | `number` | Yes | All orders |
| `serviceMode` | `'dine_in' \| 'pickup' \| 'delivery'` | Yes | All orders |
| `checkoutPaymentChoice` | `'cash' \| 'mobile_money' \| 'whatsapp'` | Yes | All orders |
| `status` | `OrderStatus` | Yes | All orders |
| `frontLane` | `'cafe_front' \| 'bakery_front'` | Yes | All orders |
| `involvedStations` | `PrepStation[]` | Yes | All orders |

**Conclusion: ALL required tracking fields were already present. No schema changes needed.**

---

### Fields That Were Missing

None required for this pass. All fields for staff-assisted order identification were already modeled and written in `orderPersistence.ts`.

---

## Loyalty Rule Audit

### How Loyalty Is Determined

Loyalty accrual happens in ONE place only:

**`components/staff/OperationalOrdersBoard.tsx:461`** — called during `handleConfirmPaymentAndComplete()` (the front service payment capture flow).

The rule is: `accrueCustomerRewardForCompletedPaidOrder` is called when:
1. `validation.financialStatus === 'paid'` — the payment was fully received

**BEFORE PASS 06:**
No check on `orderEntryMode`. Staff-assisted orders marked as paid WOULD earn loyalty for the customer phone number.

**AFTER PASS 06:**
Guard added: `order.orderEntryMode !== 'staff_assisted'`
Staff-assisted orders do NOT earn loyalty even when marked as paid at front service.

### What `accrueCustomerRewardForCompletedPaidOrder` Does (lib/customerRewards.ts)

- Looks up `customerRewards/{phone}` document
- Runs a Firestore transaction:
  - Checks idempotency key (orderId) — prevents double-accrual
  - Increments `totalEarned`, adjusts `balance`
  - Writes a transaction log entry in `customerRewards/{phone}/transactions/{orderId}`
- Rate: 1 point per 100 RWF

### Where Loyalty Accrual Does NOT Happen

- `OrdersView.tsx` (order submission) — no loyalty accrual at order creation time
- `AdminOrdersView.tsx` (admin complete) — uses `buildOptimisticCompletionState` without accrual
- `lib/orderPersistence.ts` (order write) — no loyalty write

**Only `OperationalOrdersBoard.tsx` triggers loyalty accrual, and it is now gated.**

---

## Whether Staff-Assisted Orders Earn Loyalty

**BEFORE THIS PASS:** YES — no gate existed. Staff-assisted orders marked as paid would earn loyalty.

**AFTER THIS PASS:** NO — guarded by `order.orderEntryMode !== 'staff_assisted'` in `OperationalOrdersBoard.tsx`.

**How It Is Enforced:**
1. Staff-assisted orders have `orderEntryMode: 'staff_assisted'` written to Firestore by `orderPersistence.ts` at order creation.
2. The `normalizeLiveOrder` function in `orderRouting.ts` reads this field into `LiveOrder.orderEntryMode`.
3. `handleConfirmPaymentAndComplete` in `OperationalOrdersBoard` checks `order.orderEntryMode !== 'staff_assisted'` before calling accrual.

---

## Staff-Assisted Order History — Where It Appears

### Staff / Front Service View (StaffOrderEntryView — `/staff/orders/create`)

A new "My Orders" tab was added alongside the existing "Create Order" tab.

- Queries `orders` where `createdByStaffUid == currentStaff.uid`, limit 200
- Sorted descending by `createdAt`
- Filters: status (all/open/completed/cancelled), date (today/yesterday/last7/custom range), lane (all/cafe/bakery), source (all/walk_in/phone_call/whatsapp/other)
- Each order card shows: customer name, customer phone, order ID, total, status, source, lane, service mode, payment choice, created timestamp
- Paginated (15 per page, Load More)

**This is completely separate from the self-order history in `/orders`.**

### Admin View (AdminOrdersView — `/admin/orders`)

An "Entry Mode" filter was added to the existing Filters panel:
- `All orders` — default, existing behavior unchanged
- `Staff assisted only` — shows only `orderEntryMode === 'staff_assisted'` orders
- `Customer self only` — shows only `orderEntryMode === 'customer_self'` orders

Each staff-assisted order card in the board already showed the "Staff Assisted" badge and `orderSource` chips (implemented in a prior pass in `OperationalOrdersBoard.tsx`).

---

## Queries and Views Updated

| Location | Query/Filter | Updated |
|---|---|---|
| `StaffOrderEntryView.tsx` | Firestore `where('createdByStaffUid', '==', uid)` | ADDED |
| `AdminOrdersView.tsx` | In-memory `filteredOrders` memo | ADDED `entryMode` filter |
| `OrdersView.tsx` | Existing `renderAssistedOrdersSection` query | NOT CHANGED — still used for the `/orders` staff-assisted entry context |

---

## Self-Order History Separation

Self-order history (`renderHistorySection`) in `OrdersView.tsx`:
- Rendered only when `hidePersonalOrderWidgets === false` (i.e., the customer self-order route `/orders`)
- Query: tracks `orderHistory` (local state from Firebase auth user) and `guestOrderRefs` (local storage)
- Does NOT include any `createdByStaffUid`-based query

Staff-created order history (new "My Orders" tab in `StaffOrderEntryView`):
- Rendered only on the `/staff/orders/create` route
- Query: `where('createdByStaffUid', '==', staffIdentity.uid)`
- Does NOT include any personal/self-order data

**These two are logically and query-level separate. No mixing.**
