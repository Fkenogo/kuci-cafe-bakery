# Change Log: Pass 09 — Admin Orders Empty State Fix & Staff Receipt Generation

- Date: 2026-04-03
- Branch: main
- Build: PASS
- Lint: PASS (tsc --noEmit, zero errors)

## Objective

1. Fix Admin Orders view showing non-zero status counts (e.g. "Done 3") while the rendered list below is empty.
2. Add digital receipt generation for completed staff-assisted orders in My Assisted Orders.

---

## Issue 1 — Admin Orders Empty State Bug

### Root Cause

`filteredOrders` in `AdminOrdersView` applies `activeOnly` with an unconditional check:

```typescript
// Before (line 307):
if (filters.activeOnly) {
  if (order.status === 'completed') return false;         // ← UNCONDITIONAL
  if (order.status === 'rejected' && filters.status !== 'rejected') return false;
}
```

The status pill counts come from `activeDayOrders.filter(o => o.status === 'completed').length` — this array is never filtered by `activeOnly`. So clicking "Done 3" sets `filters.status = 'completed'` but the `activeOnly: true` guard unconditionally drops all completed orders from the rendered list.

### Fix

**File: `views/AdminOrdersView.tsx` — line 307**

```typescript
// After:
if (filters.activeOnly) {
  if (order.status === 'completed' && filters.status !== 'completed') return false;
  if (order.status === 'rejected' && filters.status !== 'rejected') return false;
}
```

Now mirrors the existing `rejected` pattern: completed orders are excluded by `activeOnly` unless the user has explicitly selected `status === 'completed'`. Clicking the "Done N" pill shows the completed orders. Default `activeOnly: true` still hides completed orders from the general view.

---

## Issue 2 — Receipt Generation for My Assisted Orders

### Approach

A standalone printable receipt page opened in a new browser tab via `URL.createObjectURL(blob)`. No new component file. No extra state in the component. Triggered by a "Receipt" button that appears only on completed order cards in the My Assisted Orders history tab.

Receipt HTML is generated entirely in the client with HTML-escaped output (`esc()` helper) — no raw user strings in the HTML.

### Receipt Content

- KUCI Cafe & Bakery branding header
- Order number (last 8 chars of Firestore doc ID)
- Order date (createdAt)
- Customer name + phone (if available)
- Order source (walk-in / phone call / WhatsApp / other)
- Service mode (pickup / dine-in / delivery)
- Payment method
- Created by staff name
- Completion timestamp (updatedAt, when status === 'completed')
- Item table: item name, selected options, quantity, unit price, line total
- Subtotal + delivery fee (if non-zero) + TOTAL
- Footer: "Thank you for choosing KUCI Cafe & Bakery"

### Receipt button location

In `StaffOrderEntryView`, history tab, per completed order card — below the chip row:
```tsx
{order.status === 'completed' && (
  <button onClick={() => openReceiptWindow(order)} ...>
    <Printer /> Receipt
  </button>
)}
```

---

## Files Changed

| File | Change |
|---|---|
| `views/AdminOrdersView.tsx` | Fix `activeOnly` guard — completed orders excluded only when `status !== 'completed'` |
| `views/StaffOrderEntryView.tsx` | Add `esc()`, `openReceiptWindow()`, `Printer` icon import, receipt button on completed cards |

---

## What Was NOT Changed

- Staff create-order flow — unchanged
- Loyalty behavior — unchanged
- My Assisted Orders filtering logic — unchanged
- All Pass 06/07/08 changes — unchanged

## Deploy Status

Not deployed. Run:
```bash
npm run build
firebase deploy --only hosting
```
