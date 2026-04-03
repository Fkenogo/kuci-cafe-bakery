# Change Log: Pass 10 — Bakery Stock Availability + Cafe Item Sales Ledger

- Date: 2026-04-03
- Branch: main
- Build: PASS
- Lint: PASS (tsc --noEmit, zero errors)

## Objective

1. Show bakery stock availability status on each item in the BakeryView ordering flow, grounded in live reconciliation data.
2. Add an item-level completed sales section to Cafe Reconciliation for admin/accounting review.

---

## Goal 1 — Bakery Stock Availability

### Data Source

`bakeryDailyReconciliation/{businessDate}` Firestore document. Each `lines[]` entry has:
- `itemId` — maps to `BakeryItem.id`
- `closingExpected` — derived from `openingStock + receivedStock - soldStock - waste + adjustment`

`closingExpected` is the canonical available quantity as of the last reconciliation save.

### Status Logic

| closingExpected | Status | Orderable |
|---|---|---|
| No reconciliation doc | `unknown` | Yes |
| Item has no line in doc | `unknown` | Yes |
| `<= 0` | `out_of_stock` | No |
| `> 0` and `<= 3` | `low_stock` | Yes (badge shown) |
| `> 3` | `in_stock` | Yes (badge shown) |

`LOW_STOCK_THRESHOLD = 3` (hardcoded constant in BakeryView.tsx).

### UI Changes

- `StockBadge` component: renders colored pill (emerald / amber / red)
- `unknown` status: no badge shown (does not alarm staff when no reconciliation is open)
- `out_of_stock`: disabled block replaces "Add to Order" button — shows "Out of stock / Check again later"
- `low_stock`: badge shown, button remains active
- Stock data loads via Firestore `onSnapshot` subscription on component mount

### Files Changed

- `views/BakeryView.tsx`: imports `doc`, `onSnapshot`, `db`, `toBusinessDate`, `BakeryDailyReconciliation`; adds `LOW_STOCK_THRESHOLD`, `getStockStatus()`, `StockBadge` component, stock state + useEffect, updated item card render

---

## Goal 2 — Cafe Item Sales Ledger

### Data Source

`orders` collection (already loaded in ReconciliationView). Filter for:
- `resolveOrderBusinessDate(order) === businessDate`
- `order.status === 'completed'`
- `order.serviceArea === 'cafe'`
- `order.accountingTreatment !== 'cancelled'`

Flatten `order.items` (each `PersistedOrderItem` has `itemName`, `quantity`, `lineTotal`) with per-order context (`serviceMode`, `checkoutPaymentChoice`, `updatedAt`).

### Computation Chain

```
cafeItemSalesRows    — all flattened item rows for the day (no filters)
cafeItemSalesFiltered — rows after search + serviceMode + payment filters
cafeItemSalesSummary  — grouped by itemName: qtySold, grossValue, orderCount
```

### Section Location

New `<details>` block inserted between "Service Mode Breakdown / Exclusions" and "Included-Order Audit" in cafe mode render.

### Filters

| Filter | Type | Description |
|---|---|---|
| Search | text input | Filter by item name or order ID (last 8 chars) |
| Service mode | select | All / Pickup / Dine-in / Delivery |
| Payment method | select | All / Cash / Mobile money / Pay later |

Filters are applied to the detail rows first; summary table is derived from filtered rows.

### Section Content

1. **Filter bar** (search + 2 selects)
2. **Summary table**: Item · Qty Sold · Gross Value · Orders — sorted by gross value desc, totals footer
3. **Detail rows** (collapsed sub-details): Order ID · Item · Qty · Line Total · Service Mode · Payment · Completed At

Settlement summary, KPIs, and Order Audit sections are all unchanged.

### Files Changed

- `views/ReconciliationView.tsx`:
  - 3 filter states: `cafeItemSearch`, `cafeItemServiceModeFilter`, `cafeItemPaymentFilter`
  - 3 new useMemos: `cafeItemSalesRows`, `cafeItemSalesFiltered`, `cafeItemSalesSummary`
  - New `<details>` section in cafe mode render

---

## What Was NOT Changed

- Working staff-assisted create-order flow — unchanged
- Existing reconciliation calculations — unchanged
- Bakery stock movement table — unchanged
- Settlement summary (KPIs, cash control) — unchanged
- Order accounting audit — unchanged
- Loyalty behavior — unchanged
