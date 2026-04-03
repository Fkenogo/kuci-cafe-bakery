# Route Audit: Ordering Paths and Navigation Truth

## Order-Related Routes Present
From `App.tsx` route set and switch:

- `/orders` -> renders `OrdersView` (self-order flow in current local wiring)
- `/staff/orders/create` -> renders `StaffOrderEntryView` (staff create flow)
- `/admin/orders` -> renders `AdminOrdersView` (ops/admin orders board)
- `/front/orders` -> renders `FrontServiceOrdersView`
- `/bakery-front/orders` -> renders `BakeryFrontOrdersView`
- `/kitchen/orders` -> renders `KitchenOrdersView`
- `/barista/orders` -> renders `BaristaOrdersView`

## Navigation Calls Related to Order Creation

### `navigate('/orders')`
- Found in `App.tsx:513`.
- Context: `reorder(...)` helper.
- Classification: self-order/history convenience (not staff create entry).

### `navigate('/staff/orders/create')`
- Found in `App.tsx:753`.
- Context: Layout `onStaffOrderEntry` action (header/button).
- Classification: dedicated staff create-order entry.

## Component Rendering by Route

- `/orders`
  - `OrdersView` with self cart (`cart`) and self completion handler (`completeOrder`).
  - No `orderEntryContext` passed from route wiring.

- `/staff/orders/create`
  - `StaffOrderEntryView` with staff cart (`staffCart`), customer details step, and progression.
  - Uses `OrdersView` internally only after step progression, with flags:
    - `hideIdentityCapture`
    - `hidePersonalOrderWidgets`
    - `lockedStaffOrderSource`

## Self vs Staff Classification (Current Local Source)

- Self-order route:
  - `/orders`
  - Uses `cart`
  - Keeps personal history widgets.

- Staff-create route:
  - `/staff/orders/create`
  - Uses `staffCart`
  - Starts with customer details and source capture.
  - Suppresses personal history widgets in nested order engine render.

## grep Evidence Snippets

```bash
rg -n "/staff/orders/create" App.tsx views/*.tsx components/*.tsx
App.tsx:44:  '/staff/orders/create',
App.tsx:604:      case '/staff/orders/create': return (
App.tsx:753:        navigate('/staff/orders/create');
```

```bash
rg -n "navigate\('/orders'\)" App.tsx views/*.tsx components/*.tsx
App.tsx:513:    navigate('/orders');
```

