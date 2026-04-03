# Staff Cart Flow Audit (Pass 07 — 2026-04-03)

## Files Audited
- `App.tsx`
- `views/StaffOrderEntryView.tsx`
- `views/MenuView.tsx`
- `views/BakeryView.tsx`
- `views/OrdersView.tsx`
- `lib/orderPersistence.ts`
- `lib/orderRouting.ts`
- `components/staff/OperationalOrdersBoard.tsx`
- `types.ts`

---

## Where Cart State Lives

### Self-order cart
```
App.tsx state: const [cart, setCart]
Storage key:   kuci_cart (localStorage)
Route:         /orders → OrdersView receives cart={cart}
```

### Staff-assisted cart
```
App.tsx state: const [staffCart, setStaffCart]
Storage key:   kuci_staff_cart (localStorage)
Route:         /staff/orders/create → StaffOrderEntryView receives cart={staffCart}
Session flag:  const [staffOrderBuildSession, setStaffOrderBuildSession]
```

### Session flag semantics
`staffOrderBuildSession: boolean` — set to `true` when staff clicks "Open Cafe Menu" or "Open Bakery Menu" in StaffOrderEntryView. Determines which cart `addToCart` writes to.

---

## Add-to-Cart Handler Routing

**`addToCart` (App.tsx:424):**
```typescript
const setTargetCart = staffOrderBuildSession ? setStaffCart : setCart;
```
When `staffOrderBuildSession=true`, every add-to-cart call (from Menu, Bakery, Home) writes to `staffCart`.
When `staffOrderBuildSession=false`, writes to `cart` (self-order).

**`updateCartItemCustomization` (App.tsx:448):**
Same pattern — targets `staffCart` when `staffOrderBuildSession=true`.

**Conclusion:** Cart write routing was already CORRECT. Items added during an active staff session land in `staffCart`.

---

## What Was Broken

### Root Cause
`/menu` and `/bakery` are NOT in the `isStaffPath` set:
```typescript
const isStaffPath =
  currentPath.startsWith('/admin/') ||
  currentPath.startsWith('/front/') ||
  currentPath.startsWith('/bakery-front/') ||
  currentPath.startsWith('/staff/orders/') ||   ← /menu and /bakery excluded
  ...
```

When staff navigated to `/menu` or `/bakery`:
1. `isStaffPath = false`
2. Bottom nav showed customer tabs: `[Home, Menu, Bakery, Orders, Profile]`
3. The "Orders" customer tab pointed to `/orders` (self-order cart), NOT `/staff/orders/create`
4. Cart count in bottom nav showed `cart.length` (self-cart, empty), NOT `staffCart.length`
5. MenuView/BakeryView had NO awareness of the active staff build session
6. NO banner, NO CTA, NO indication that a staff order was being built
7. Staff had no visible route back to `/staff/orders/create`

**Summary:** Items were written to the right cart, but the return path was invisible. Staff would end up on `/orders` (self-cart, empty) and lose track of the staff build context entirely.

---

## What Was Changed

### 1. MenuView — staff session banner
Added optional `staffSession` prop:
```typescript
interface StaffOrderSession {
  customerName: string;
  staffCartCount: number;
  onReturn: () => void;
}
```
When `staffSession` is set, renders a sticky banner below the main header (`top-[72px] z-40`):
- Label: "Building staff order" + customer name
- Button: "Back to Order · N items →" (or "Back to Staff Order" if cart empty)
- Category tab bar position adjusted: `top-[116px]` when banner is visible

### 2. BakeryView — staff session banner
Same `StaffOrderSession` interface and same sticky banner added at the top of the view content.

### 3. App.tsx — staffSession prop injection
When `staffOrderBuildSession === true`, passes `staffSession` to both MenuView and BakeryView:
```typescript
staffSession={staffOrderBuildSession ? {
  customerName: assistedCustomerProfile.name || assistedCustomerProfile.phone || 'Customer',
  staffCartCount: staffCart.reduce((acc, i) => acc + i.quantity, 0),
  onReturn: () => navigate('/staff/orders/create'),
} : undefined}
```

### 4. App.tsx — cartCount fix
Before: `cartCount={(isStaffPath ? staffCart : cart).reduce(...)}`
After:  `cartCount={((staffOrderBuildSession || isStaffPath) ? staffCart : cart).reduce(...)}`

When `staffOrderBuildSession=true` (even on `/menu` or `/bakery`), the header's cart count badge shows the staff cart item count.

---

## Exact Route/Return Flow After Item Selection (Post-Fix)

```
/staff/orders/create
  → Staff clicks "Open Cafe Menu"
     → setStaffOrderBuildSession(true)
     → navigate('/menu')

/menu  (staffOrderBuildSession=true)
  → Sticky banner: "Building staff order · [Customer Name]"
  → Staff adds item → addToCart → staffCart (correct)
  → Cart count in header/Layout shows staffCart count
  → Staff clicks "Back to Order · N items →"
     → navigate('/staff/orders/create')

/staff/orders/create  (orderBuildStarted=true, staffCart has items)
  → OrdersView renders below with:
     - cart={staffCart}
     - hidePersonalOrderWidgets=true
     - hideIdentityCapture=true
     - lockedStaffOrderSource={orderSource}
  → Staff reviews cart, selects service mode, submits order
```

Same flow applies for `/bakery`.

---

## How Operational Routing Is Preserved at Submit

The full chain at submit time (inside `OrdersView.handleCheckout`):

1. `validateOrderInput` called with:
   - `entry.orderEntryMode = 'staff_assisted'`
   - `entry.orderSource = lockedStaffOrderSource` (set from customer details step)
   - `entry.createdByStaff = { uid, role, name }` (from `orderEntryContext.staffIdentity`)

2. `createOrder` persists to Firestore with:
   - `orderEntryMode: 'staff_assisted'`
   - `orderSource: 'walk_in' | 'phone_call' | 'whatsapp' | 'other'`
   - `createdByStaffUid`, `createdByStaffRole`, `createdByStaffName`
   - `assistedCustomerName`, `assistedCustomerPhoneNormalized`
   - `serviceArea`, `frontLane`, `dispatchMode` (derived from cart items by `classifyOrderOperationalRouting`)
   - `routedTasks` (per-station tasks from `buildRoutedTasks`)
   - `involvedStations` (derived from routedTasks)
   - `status: 'pending'`

3. Operational boards:
   - Front service (`/front/orders`, `/bakery-front/orders`): sees order via `OperationalOrdersBoard` querying all `orders` for active day, scoped by `frontLane`
   - Kitchen / Barista: see per-station tasks via their own boards
   - Admin (`/admin/orders`): sees all orders; "Staff Assisted" badge shown when `orderEntryMode === 'staff_assisted'`

4. After `completeStaffOrder` runs:
   - `staffCart` cleared
   - `staffOrderBuildSession` set to `false`
   - The staff banner disappears from Menu/Bakery
   - Staff can start a new order

---

## Loyalty Gating (unchanged from Pass 06)
`OperationalOrdersBoard.tsx` already guards:
```typescript
if (validation.financialStatus === 'paid' && order.orderEntryMode !== 'staff_assisted') {
  await accrueCustomerRewardForCompletedPaidOrder({ ... });
}
```
Staff-assisted orders do NOT earn loyalty. This is unchanged.
