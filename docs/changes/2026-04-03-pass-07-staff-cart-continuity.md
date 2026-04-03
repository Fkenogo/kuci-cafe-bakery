# Change Log: Pass 07 — Staff Cart / Order Continuity

- Date: 2026-04-03
- Branch: main
- Build: PASS
- Lint: PASS (tsc --noEmit, zero errors)

## Objective
Fix the loss of continuity in the staff-assisted order flow when staff navigated from `/staff/orders/create` to `/menu` or `/bakery` to add items.

## Root Cause
`/menu` and `/bakery` are not `isStaffPath` routes. When staff navigated there:
- Customer tab bar was shown (with "Orders" pointing to self-order route `/orders`)
- Cart count showed self-cart (empty), not staff cart
- MenuView/BakeryView had no knowledge of the active staff session
- No "Return to Staff Order" button existed anywhere
- Staff were stranded with no visible path back to `/staff/orders/create`

Items WERE correctly written to `staffCart` (via `staffOrderBuildSession` flag) — the write logic was sound. The failure was purely a UI navigation/continuity gap.

---

## Files Changed

| File | Change |
|---|---|
| `views/MenuView.tsx` | Added `StaffOrderSession` interface and `staffSession` prop; sticky banner when active |
| `views/BakeryView.tsx` | Same |
| `App.tsx` | Pass `staffSession` to both views when `staffOrderBuildSession=true`; fix `cartCount` |

---

## Exact Changes

### views/MenuView.tsx
- Added import: `ArrowRight` from lucide-react
- Added `StaffOrderSession` interface and `staffSession?: StaffOrderSession` prop
- Added sticky banner (`top-[72px] z-40`) rendered when `staffSession` is set:
  - Shows "Building staff order" label + customer name
  - Button: "Back to Order · N items →" (live count from `staffCartCount`)
- Category tab bar `sticky` position offset to `top-[116px]` when banner is visible (was `top-16`)

### views/BakeryView.tsx
- Added import: `ArrowRight` from lucide-react
- Added `StaffOrderSession` interface and `staffSession?: StaffOrderSession` prop
- Added sticky banner (`top-[72px] z-40`) at start of content before bakery header
- Wrapped existing content in inner `<div className="px-4 py-8 space-y-8">` to preserve spacing

### App.tsx
- **MenuView and BakeryView**: Pass `staffSession` prop when `staffOrderBuildSession=true`:
  ```typescript
  staffSession={staffOrderBuildSession ? {
    customerName: assistedCustomerProfile.name || assistedCustomerProfile.phone || 'Customer',
    staffCartCount: staffCart.reduce((acc, i) => acc + i.quantity, 0),
    onReturn: () => navigate('/staff/orders/create'),
  } : undefined}
  ```
- **cartCount fix**:
  ```typescript
  // Before:
  cartCount={(isStaffPath ? staffCart : cart).reduce(...)}
  // After:
  cartCount={((staffOrderBuildSession || isStaffPath) ? staffCart : cart).reduce(...)}
  ```
  Staff cart count now shown in header when on `/menu` or `/bakery` with active session.

---

## Staff Journey (Post-Fix)

```
1. /staff/orders/create
   → Enter customer name, phone, order source
   → Click "Continue to Menu"
   → Click "Open Cafe Menu" or "Open Bakery Menu"

2. /menu or /bakery  (staffOrderBuildSession=true)
   ★ Sticky banner visible: "Building staff order · [Name]"
   ★ Cart count in header shows staffCart item count
   → Add item(s) — correctly writes to staffCart
   ★ Banner button: "Back to Order · N items →"
   → Click → navigate('/staff/orders/create')

3. /staff/orders/create  (orderBuildStarted=true, staffCart has items)
   → OrdersView renders with staffCart, all suppression flags active
   → Service mode, payment choice, submit
   → createOrder() called with full staff-assisted metadata
   → Order persists to Firestore with:
       orderEntryMode: 'staff_assisted'
       createdByStaffUid / createdByStaffName / createdByStaffRole
       assistedCustomerName / assistedCustomerPhoneNormalized
       orderSource (from customer capture step)
       routedTasks / involvedStations (derived from cart items)

4. Operational boards
   → Front service: sees order in active queue
   → Kitchen/Barista: see station tasks
   → Admin: sees order with "Staff Assisted" badge + source chip

5. completeStaffOrder() called after submit
   → staffCart cleared
   → staffOrderBuildSession = false
   → Banner disappears from Menu/Bakery
```

---

## What Was NOT Changed
- `staffOrderBuildSession` write logic — unchanged (already correct)
- `addToCart` cart routing — unchanged (already correct)
- Loyalty guard (Pass 06) — unchanged
- Staff history tab (Pass 06) — unchanged
- Order persistence fields — unchanged
- Operational board rendering — unchanged

## What Was NOT Verified
- Live browser test (no deploy executed in this pass)
- Screenshot evidence not available
- Firebase deploy not executed

## Deploy Status
Not deployed. Run:
```bash
npm run build
firebase deploy --only hosting
```
