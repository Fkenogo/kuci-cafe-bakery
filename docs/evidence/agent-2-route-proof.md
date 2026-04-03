# Agent 2 — Route and Render Proof (2026-04-03)

## Verified with independent grep (this pass)

### 1. APP_PATHS set — all routes registered
```
App.tsx:34  const APP_PATHS = new Set([
App.tsx:44    '/staff/orders/create',   ← PRESENT
App.tsx:38    '/orders',                ← PRESENT
...
```

### 2. Route switch — actual rendering targets
```
App.tsx:586   case '/orders':               → OrdersView (self cart, no flags)
App.tsx:604   case '/staff/orders/create':  → StaffOrderEntryView (staff cart, with role guard)
```

### 3. Navigation calls
```
App.tsx:513   navigate('/orders')                  — reorder() helper, self-order only
App.tsx:753   navigate('/staff/orders/create')     — onStaffOrderEntry, staff entry
```

---

## Actual Order-Entry Path: Self Order

```
User → /orders
  └─ App.tsx:586 switch case
       └─ OrdersView
            cart={cart}                          (self cart)
            userProfile={userProfile}            (logged-in user)
            onOrderComplete={completeOrder}      (self order handler)
            [NO hidePersonalOrderWidgets]        → personal widgets VISIBLE
            [NO hideIdentityCapture]             → identity form shows if unidentified
            [NO lockedStaffOrderSource]          → user selects order type

  Empty cart renders:
    "Empty Cravings?" heading           ← VISIBLE for self-order
    renderAssistedOrdersSection()       ← VISIBLE if staffIdentity present (self assisted flow)
    renderHistorySection()              ← VISIBLE if user has order history

  Filled cart renders:
    Cart items
    Order type / delivery selection
    Checkout section
    renderAssistedOrdersSection()       ← VISIBLE if staffIdentity present
    renderHistorySection()              ← VISIBLE if user has order history
```

---

## Actual Order-Entry Path: Staff Create Order

```
Staff → /staff/orders/create
  └─ App.tsx:604 switch case
       └─ Role guard: canCreateStaffAssistedOrder(appUser.role) && appUser.isActive
            Allowed roles: admin, front_service, bakery_front_service
       └─ StaffOrderEntryView
            cart={staffCart}                     (isolated staff cart)
            currentStaff={appUser}               (staff identity)
            assistedCustomerProfile              (separate profile state)
            onOrderComplete={completeStaffOrder} (staff order handler)

  StaffOrderEntryView renders:
    Step 1 (always):
      Customer Name input
      Customer Phone input
      Order Source selector (walk_in, phone_call, whatsapp, other)
      [Continue to Menu] button — disabled until name OR phone entered

    Step 2 (after Continue clicked — orderBuildStarted=true):
      "Build Order" section with [Open Cafe Menu] / [Open Bakery Menu] buttons
      OrdersView (nested) with flags:
        hideIdentityCapture       → identity form SUPPRESSED
        hidePersonalOrderWidgets  → personal widgets SUPPRESSED
        lockedStaffOrderSource    → order source locked from step 1

  OrdersView (nested, staff flags active):
    renderHistorySection()         → returns null (hidePersonalOrderWidgets guard at line 670)
    renderAssistedOrdersSection()  → returns null (hidePersonalOrderWidgets guard at line 795)

    Empty cart branch (cart.length === 0):
      Line 936: if (hidePersonalOrderWidgets) → renders "Start Building This Customer Order"
      "Empty Cravings?" text          ← NOT RENDERED
      renderAssistedOrdersSection()   ← NOT RENDERED
      renderHistorySection()          ← NOT RENDERED

    Filled cart branch:
      Cart items
      Checkout section (identity capture hidden, order source locked)
      renderAssistedOrdersSection()   ← returns null
      renderHistorySection()          ← returns null
```

---

## Render Chain Summary

| Route | Renders | Cart | Personal Widgets | Identity Capture |
|---|---|---|---|---|
| `/orders` | `OrdersView` direct | `cart` (self) | VISIBLE | VISIBLE if unidentified |
| `/staff/orders/create` | `StaffOrderEntryView` → `OrdersView` (after continue) | `staffCart` | SUPPRESSED | SUPPRESSED |

---

## Grep Evidence (this pass, independent verification)

```
grep: /staff/orders/create
  App.tsx:44     APP_PATHS set entry
  App.tsx:70     admin tab
  App.tsx:84     front_service tab
  App.tsx:90     bakery_front_service tab
  App.tsx:604    route switch case
  App.tsx:753    navigate call in onStaffOrderEntry

grep: StaffOrderEntryView
  App.tsx:15     import statement
  App.tsx:606    render in route switch
  views/StaffOrderEntryView.tsx:27  export const StaffOrderEntryView

grep: hidePersonalOrderWidgets
  views/OrdersView.tsx:36    prop definition
  views/OrdersView.tsx:40    destructuring (default=false)
  views/OrdersView.tsx:670   renderHistorySection guard
  views/OrdersView.tsx:795   renderAssistedOrdersSection guard
  views/OrdersView.tsx:936   empty-cart branch guard
  views/StaffOrderEntryView.tsx:207  flag passed to nested OrdersView

grep: hideIdentityCapture
  views/OrdersView.tsx:34    prop definition
  views/OrdersView.tsx:78    showProfileForm initial state
  views/OrdersView.tsx:134/148/167/176/182/212  usage guards
  views/StaffOrderEntryView.tsx:206  flag passed to nested OrdersView

grep: lockedStaffOrderSource
  views/OrdersView.tsx:35    prop definition
  views/OrdersView.tsx:286   used in checkout mapping
  views/OrdersView.tsx:328   used in checkout mapping
  views/StaffOrderEntryView.tsx:208  value passed to nested OrdersView

grep: renderHistorySection
  views/OrdersView.tsx:669   definition (guard at 670)
  views/OrdersView.tsx:962   called in empty-cart self branch
  views/OrdersView.tsx:1474  called in filled-cart branch

grep: renderAssistedOrdersSection
  views/OrdersView.tsx:794   definition (guard at 795)
  views/OrdersView.tsx:961   called in empty-cart self branch
  views/OrdersView.tsx:1471  called in filled-cart branch
```

---

## Build and Lint Status

```
npm run lint  →  PASS (tsc --noEmit, zero errors)
npm run build →  PASS (vite build, zero errors, 1 chunk-size warning only)
```

---

## Screenshot Evidence

Not captured. Browser/playwright not used in this pass.
Reason: source verification was achievable through file reads and static analysis alone.
Visual confirmation requires deploying the current working tree and running a browser session.
