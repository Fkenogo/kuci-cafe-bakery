# Change Log: Pass 08 — Staff Cart Write Trace & orderBuildStarted Fix

- Date: 2026-04-03
- Branch: main
- Build: PASS
- Lint: PASS (tsc --noEmit, zero errors)

## Symptom

After staff added a bakery or menu item during a staff-assisted order session, the cart count remained 0 and the OrdersView cart section was invisible on return to `/staff/orders/create`. Items were never surfaced for checkout despite `staffCart` holding them in App.tsx state.

## Root Cause

`StaffOrderEntryView` contains:
```typescript
const [orderBuildStarted, setOrderBuildStarted] = useState(false);
```

`orderBuildStarted` is **local component state**. When staff navigates from `/staff/orders/create` → `/bakery` → back to `/staff/orders/create`, the custom SPA router unmounts `StaffOrderEntryView` then remounts it fresh. On remount, `orderBuildStarted` resets to `false`.

The OrdersView cart/checkout section only renders when `orderBuildStarted === true`:
```tsx
{orderBuildStarted && (<OrdersView cart={staffCart} ... />)}
```

So even though `staffCart` in App.tsx correctly held the item just added in BakeryView, the cart section was hidden because the gate flag was reset.

This was the ONLY failure. The cart write chain itself was correct:
- `addToCart` in App.tsx routes correctly based on `staffOrderBuildSession`
- `adaptBakeryItemToMenuItem` produces a valid `MenuItem` for the cart
- `CustomizerModal` calls `onConfirm` correctly (with 450ms animation delay)
- `staffCart` state in App.tsx persists across navigation (not cleared)
- localStorage `kuci_staff_cart` key persists correctly

## Fix

**File: `views/StaffOrderEntryView.tsx` — line 50**

```typescript
// Before:
const [orderBuildStarted, setOrderBuildStarted] = useState(false);

// After:
const [orderBuildStarted, setOrderBuildStarted] = useState(() => cart.length > 0);
```

The lazy initializer checks the `cart` prop (which is `staffCart` from App.tsx) at mount time. If items already exist — meaning the staff navigated back from menu/bakery after adding items — `orderBuildStarted` starts `true`, immediately revealing the OrdersView cart section.

## Files Changed

| File | Change |
|---|---|
| `views/StaffOrderEntryView.tsx` | Lazy-initialize `orderBuildStarted` from `cart.length > 0` |

---

## Cart Write Chain (Full Trace — Verified Correct Pre-Fix)

```
Staff presses "Add to Order" on a bakery item
  → BakeryView: setSelectedBakeryItem(item)
  → CustomizerModal opens with menuItemForModal = adaptBakeryItemToMenuItem(item, category)
  → Staff confirms in modal
  → CustomizerModal.handleConfirm()
     → 450ms setTimeout (animation)
     → onConfirm(item, customization) called
  → BakeryView.handleCustomizationConfirm(item, customization)
     → addToCart(item, customization)        ← App.tsx prop
  → App.tsx addToCart (line 424):
     const setTargetCart = staffOrderBuildSession ? setStaffCart : setCart;
     staffOrderBuildSession === true          ← set when staff clicked "Open Bakery Menu"
     → setStaffCart([...staffCart, newItem]) ← correct cart updated
     → kuci_staff_cart localStorage updated  ← persisted
```

## What Was NOT Changed

- `addToCart` routing logic — unchanged (already correct)
- `staffOrderBuildSession` flag management — unchanged
- `completeStaffOrder` — unchanged
- Cart persistence (localStorage) — unchanged
- All Pass 06 / Pass 07 changes — unchanged

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
