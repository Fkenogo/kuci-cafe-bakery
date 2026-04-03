# Change Log: Pass 06 — Assisted Order History and Loyalty Alignment

- Date: 2026-04-03
- Branch: main
- Build: PASS
- Lint: PASS (tsc --noEmit, zero errors)

## Objective
1. Fix loyalty accrual bug: staff-assisted orders were earning loyalty points on paid completion.
2. Expose staff-assisted order history to the creating staff member (previously suppressed).
3. Give admin a dedicated "Entry Mode" filter in the orders board.

---

## Files Changed

| File | Change |
|---|---|
| `components/staff/OperationalOrdersBoard.tsx` | Loyalty bug fix — added `order.orderEntryMode !== 'staff_assisted'` guard |
| `views/StaffOrderEntryView.tsx` | Added "My Orders" history tab with Firestore query, all filters, and order cards |
| `views/AdminOrdersView.tsx` | Added `entryMode` filter field and logic to `filteredOrders` |

---

## Exact Code Changes

### 1. Loyalty Guard — `components/staff/OperationalOrdersBoard.tsx`

**Before (line ~460):**
```typescript
if (validation.financialStatus === 'paid') {
  await accrueCustomerRewardForCompletedPaidOrder({ ... });
}
```

**After:**
```typescript
if (validation.financialStatus === 'paid' && order.orderEntryMode !== 'staff_assisted') {
  await accrueCustomerRewardForCompletedPaidOrder({ ... });
}
```

**Why:** Staff-assisted orders are created on behalf of a customer by a staff member. The customer did not initiate the order via the self-app. Per business rules, only direct self-app orders earn loyalty points. Without this guard, any staff-assisted order marked as paid would silently accrue loyalty to the customer's phone number.

---

### 2. History Tab — `views/StaffOrderEntryView.tsx`

**Added:**
- Imports: `useEffect`, Firestore (`collection`, `limit`, `onSnapshot`, `query`, `where`), `db`, `PersistedOrder`, Lucide icons (`ClipboardList`, `PlusCircle`)
- State: `activeTab`, `historyOrders`, `historyStatusFilter`, `historyDateFilter`, `historySourceFilter`, `historyLaneFilter`, `historyDateFrom`, `historyDateTo`, `historyVisibleCount`
- `useEffect` subscribing to `orders` where `createdByStaffUid == staffIdentity.uid` (limit 200, sorted desc by `createdAt`)
- `filteredHistoryOrders` memo with filters: status (all/open/completed/cancelled), date (today/yesterday/last7/custom), lane (all/cafe/bakery), source (all/walk_in/phone_call/whatsapp/other)
- Tab toggle UI: `[Create Order] [My Orders]` — positioned alongside existing Back button
- History panel showing: customer name, customer phone, order ID, total, status, source, lane, service mode, payment choice, created timestamp
- Load More pagination (15 per page)

**Preserved:** The create flow (form + "Continue to Menu" + OrdersView with all suppression flags) is unchanged. The history tab is a separate render branch.

---

### 3. Admin Entry Mode Filter — `views/AdminOrdersView.tsx`

**Added to `AdminFilters` interface:**
```typescript
entryMode: 'all' | 'staff_assisted' | 'customer_self';
```

**Added to `filteredOrders` useMemo:**
```typescript
if (filters.entryMode !== 'all') {
  const mode = order.orderEntryMode || 'customer_self';
  if (mode !== filters.entryMode) return false;
}
```

**Added to Filters UI:**
```
Entry Mode: [All orders | Staff assisted only | Customer self only]
```

---

## What Was Verified

- `npm run lint` — PASS (tsc --noEmit, zero errors)
- `npm run build` — PASS (vite build, zero errors)
- All three separation flags (`hidePersonalOrderWidgets`, `hideIdentityCapture`, `lockedStaffOrderSource`) remain unmodified in `StaffOrderEntryView`'s OrdersView render
- Create-order flow unchanged — tab defaults to `'create'` on mount

## What Was NOT Verified

- Live browser test (no deploy executed in this pass)
- Screenshot evidence not available
- Firebase deploy not executed

## Deploy Status

Not deployed in this pass. Run:
```bash
npm run build
firebase deploy --only hosting
```
