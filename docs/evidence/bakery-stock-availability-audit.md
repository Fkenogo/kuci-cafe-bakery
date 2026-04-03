# Bakery Stock Availability Audit (Pass 10 — 2026-04-03)

## How Bakery Stock Rows Are Stored

**Firestore collection**: `bakeryDailyReconciliation`  
**Document key**: business date string `YYYY-MM-DD` (e.g. `2026-04-03`)

Document structure:
```typescript
BakeryDailyReconciliation {
  businessDate: string;
  status: 'open' | 'closed';
  lines: BakeryDailyReconciliationLine[];
  totals?: BakeryReconciliationTotals;
  settlement?: ReconciliationSettlementTotals;
  cashControl?: ReconciliationCashControl;
  ...
}
```

Each line (`BakeryDailyReconciliationLine`):
```typescript
{
  sku: string;
  itemId: string;       // ← primary key used for lookup in BakeryView
  itemName: string;
  unitPrice: number;
  openingStock: number;
  receivedStock: number;
  soldStock: number;
  waste: number;
  adjustment: number;
  closingExpected: number;   // ← availability qty used
  closingActual?: number;
  variance?: number;
}
```

`closingExpected` is computed as:
```
openingStock + receivedStock - soldStock - waste + adjustment
```

This reflects availability as of the last reconciliation save. `soldStock` is populated from completed bakery orders at save time.

## How SKU Mapping Works

**In BakeryView**, stock is looked up by `BakeryItem.id`:
```typescript
const rawQty = item.id in availabilityByItemId ? availabilityByItemId[item.id] : undefined;
```

The reconciliation line `itemId` field corresponds directly to `BakeryItem.id`. This is the canonical mapping — `BakeryDailyReconciliationLine.itemId` is populated from `bakeryItem.id` when the reconciliation is opened via `buildOpeningLinesFromItems()`.

**Note on SKU vs itemId**: `BakeryDailyReconciliationLine` also has a `sku` field (`item.sku || item.id`), but `itemId` is the safer lookup key because not all items have explicit SKU codes.

## How Availability Is Derived

```typescript
const rawQty = item.id in availabilityByItemId ? availabilityByItemId[item.id] : undefined;
const stockStatus = stockDataLoaded ? getStockStatus(rawQty) : 'unknown';
```

`getStockStatus`:
```typescript
function getStockStatus(qty: number | undefined): StockStatus {
  if (qty === undefined) return 'unknown';
  if (qty <= 0) return 'out_of_stock';
  if (qty <= LOW_STOCK_THRESHOLD) return 'low_stock';  // LOW_STOCK_THRESHOLD = 3
  return 'in_stock';
}
```

**Caveat**: `closingExpected` reflects the state at last reconciliation save, not real-time order count. If orders are placed after the last save, `soldStock` in the reconciliation doc will lag. This is an acceptable tradeoff — reconciliation is typically updated periodically by staff.

## What Happens for Unmapped / Unknown Stock Items

- No reconciliation doc for today: `stockDataLoaded = true`, `availabilityByItemId = {}` → `rawQty = undefined` → status `'unknown'`
- Reconciliation doc exists but item has no line: `rawQty = undefined` → status `'unknown'`
- `'unknown'` status: **no badge shown**, item is still orderable

**Design decision**: `'unknown'` renders no badge (not alarming) and does not block ordering. This matches the current business reality where staff may not have opened reconciliation for the day yet. Ordering is allowed — stock data is informational.

## UI States Added

| Status | Badge | Color | Add Button |
|---|---|---|---|
| `in_stock` | "In stock" pill | Emerald green | Active |
| `low_stock` | "Low stock · N" pill | Amber | Active |
| `out_of_stock` | "Out of stock" pill | Red | Replaced with disabled block |
| `unknown` | None | — | Active |

Out-of-stock disabled state (replaces button):
```
┌─────────────────────────────────┐
│         OUT OF STOCK            │  ← red-50 bg, red-200 border
│      Check again later          │  ← smaller muted text
└─────────────────────────────────┘
```

Stock data is loaded via `onSnapshot` subscription to `bakeryDailyReconciliation/{today}` on component mount. Badge only renders after `stockDataLoaded = true` to avoid flash of incorrect state.
