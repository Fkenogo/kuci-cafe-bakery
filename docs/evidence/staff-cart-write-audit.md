# Staff Cart Write Audit (Pass 08 — 2026-04-03)

## Audit Scope

Full trace of the cart write pipeline for a staff-assisted bakery item add, from button press through to cart state visibility in the checkout view.

---

## Q1: Where does `staffOrderBuildSession` get set to `true`?

**App.tsx** — inside the callbacks passed to `StaffOrderEntryView`:

```typescript
// onOpenCafeMenu (line ~625):
setStaffOrderBuildSession(true);
navigate('/menu');

// onOpenBakeryMenu (line ~632):
setStaffOrderBuildSession(true);
navigate('/bakery');
```

These are called when staff clicks "Open Cafe Menu" or "Open Bakery Menu" inside `StaffOrderEntryView`. The flag is set BEFORE navigation. It is never reset to false until `completeStaffOrder()` runs (post-order-submit).

**Conclusion:** `staffOrderBuildSession` is `true` during the entire `/bakery` or `/menu` browse session.

---

## Q2: Which function routes the cart write, and how?

**`addToCart` in App.tsx (line 424):**

```typescript
const setTargetCart = staffOrderBuildSession ? setStaffCart : setCart;
```

When `staffOrderBuildSession === true`, every add-to-cart call (regardless of which view triggers it) writes to `staffCart`. This is a closure over the App-level boolean — it cannot be stale when `addToCart` is invoked from BakeryView because the flag is App-level state.

---

## Q3: Does `adaptBakeryItemToMenuItem` produce a valid cart item?

**`lib/catalog.ts` — `adaptBakeryItemToMenuItem`:**

Produces a `MenuItem` with:
- `id`: `item.id`
- `name`: `item.name`
- `serviceArea: 'bakery'`
- `prepStation`: `item.prepStation`
- `fulfillmentMode`: `item.fulfillmentMode`
- Variants from `item.pricingMode` (fixed or per-size)
- `modifierGroups` from `item.modifierGroups`

This is the same shape consumed by the cart and by `OrdersView`. No incompatibility.

---

## Q4: What does `CustomizerModal` do between button press and `addToCart`?

```
User taps "Add to Order"
  → setSelectedBakeryItem(item)                  ← BakeryView local state
  → CustomizerModal renders with item prop
  → User selects options and taps Confirm
  → CustomizerModal.handleConfirm():
       setAnimationState('success')
       setTimeout(() => {
         onConfirm(item, customization)            ← called after 450ms
         setAnimationState('idle')
       }, 450)
  → onConfirm === BakeryView.handleCustomizationConfirm
  → handleCustomizationConfirm(item, customization):
       addToCart(item, customization)
       setSelectedBakeryItem(null)
```

The 450ms delay is cosmetic. The actual `addToCart` call is not affected — it fires correctly.

---

## Q5: Does the `staffCart` item persist across SPA navigation?

Yes. App.tsx persists `staffCart` via `useEffect`:

```typescript
useEffect(() => {
  localStorage.setItem('kuci_staff_cart', JSON.stringify(staffCart));
}, [staffCart]);
```

And loads it on startup:

```typescript
const [staffCart, setStaffCart] = useState<CartItem[]>(() => {
  try {
    return JSON.parse(localStorage.getItem('kuci_staff_cart') || '[]');
  } catch { return []; }
});
```

App.tsx is never unmounted. `staffCart` state is never reset by navigation. The item is present in both React state and localStorage when the staff returns to `/staff/orders/create`.

---

## Q6: Why was the cart invisible on return to `/staff/orders/create`?

`StaffOrderEntryView` renders `OrdersView` conditionally:

```tsx
{orderBuildStarted && (<OrdersView cart={cart} ... />)}
```

`orderBuildStarted` is LOCAL component state initialized as `useState(false)`.

The custom SPA router (App.tsx `currentPath` switch) unmounts `StaffOrderEntryView` when the path changes to `/bakery`. When the staff returns to `/staff/orders/create`, `StaffOrderEntryView` is mounted fresh — `orderBuildStarted` resets to `false` — the `OrdersView` block does not render — the cart is invisible.

`staffCart` held the item. The gate was closed.

---

## Q7: What is the minimum fix?

Change the `orderBuildStarted` initializer in `StaffOrderEntryView`:

```typescript
// Before (resets on every mount):
const [orderBuildStarted, setOrderBuildStarted] = useState(false);

// After (reflects cart state on mount):
const [orderBuildStarted, setOrderBuildStarted] = useState(() => cart.length > 0);
```

The `cart` prop is `staffCart` from App.tsx. If items are present at mount time, the cart section opens immediately. If the staff has NOT yet added items (first mount), `cart.length === 0`, `orderBuildStarted === false` — same behavior as before.

No other file required changes.

---

## Q8: Are there any other gates that could suppress the cart?

Checked `StaffOrderEntryView` full render tree — no other conditions hide OrdersView beyond `orderBuildStarted`. `hidePersonalOrderWidgets`, `hideIdentityCapture`, and `lockedStaffOrderSource` suppress self-order UI within OrdersView but do not prevent OrdersView from rendering.

---

## Q9: Does fixing `orderBuildStarted` introduce any regressions?

**First visit to `/staff/orders/create` (no items):**  
`cart.length === 0` → `orderBuildStarted = false` → same UX as before (customer details form shown first, OrdersView hidden until staff clicks "Continue to Menu" and returns with items).

**Return visit after adding items:**  
`cart.length > 0` → `orderBuildStarted = true` → OrdersView renders immediately → cart is visible.

**After `completeStaffOrder()`:**  
`staffCart` is cleared → `cart.length === 0`. On next mount (new staff order), `orderBuildStarted = false`. Correct.

No regressions.

---

## Fix Applied

```
views/StaffOrderEntryView.tsx line 50:
  useState(false)  →  useState(() => cart.length > 0)
```

Build: PASS  
Lint: PASS (zero errors)
