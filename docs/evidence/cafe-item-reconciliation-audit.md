# Cafe Item Reconciliation Audit (Pass 10 — 2026-04-03)

## Order / Item Fields Used

**Source**: `orders` state in `ReconciliationView` (already loaded via `onSnapshot` of full `orders` collection).

**Order-level fields used:**
| Field | Type | Used for |
|---|---|---|
| `id` | `string?` | Order reference (detail rows) |
| `status` | `OrderStatus` | Filter: must be `'completed'` |
| `serviceArea` | `OrderServiceArea` | Filter: must be `'cafe'` |
| `accountingTreatment` | `AccountingTreatment?` | Exclude `'cancelled'` |
| `serviceMode` | `OrderServiceMode` | Display + filter |
| `checkoutPaymentChoice` | `CheckoutPaymentChoice?` | Display + filter |
| `updatedAt` | Firestore Timestamp | Completion timestamp |

**Item-level fields used (from `order.items: PersistedOrderItem[]`):**
| Field | Type | Used for |
|---|---|---|
| `itemName` | `string` | Grouping key + display |
| `quantity` | `number` | Qty sold aggregate |
| `lineTotal` | `number` | Gross value aggregate |

`unitPrice` and `selectedOptions` are available but not displayed in the current implementation to keep the UI concise. Can be added if needed.

## How Summary Rows Are Derived

```
Step 1: cafeItemSalesRows
  → Filter orders: businessDate match + status=completed + serviceArea=cafe + not cancelled
  → Flatten order.items into rows with order context attached

Step 2: cafeItemSalesFiltered
  → Apply search (item name or order ID contains search term)
  → Apply serviceMode filter
  → Apply paymentChoice filter

Step 3: cafeItemSalesSummary
  → Group cafeItemSalesFiltered by itemName
  → Aggregate: qtySold += quantity, grossValue += lineTotal, orderIds.add(orderId)
  → Map to array, sort by grossValue descending
```

**Totals footer** sums qtySold and grossValue across all filtered summary rows. Order count in the footer uses `new Set(cafeItemSalesFiltered.map(r => r.orderId)).size` to count distinct orders (not sum of per-item order counts).

## What Filters Were Added

Three filter controls in the section header:

1. **Search** — text input filtering by item name or order ID
   - State: `cafeItemSearch: string`
   - Applied: `toLowerCase().includes(term)` on `itemName` and `orderId`

2. **Service mode** — select: All / Pickup / Dine-in / Delivery
   - State: `cafeItemServiceModeFilter: 'all' | 'pickup' | 'dine_in' | 'delivery'`
   - Applied to: `row.serviceMode`

3. **Payment method** — select: All / Cash / Mobile money / Pay later
   - State: `cafeItemPaymentFilter: 'all' | 'cash' | 'mobile_money' | 'pay_later'`
   - Applied to: `row.paymentChoice`

Filters default to `'all'`. When changed, they affect both the summary table and the detail rows.

## How This Complements the Settlement Summary

The existing settlement summary shows:
- **Money-level totals**: collectible expected cash, total received, variance
- **Classification**: gross, complimentary, credit, mixed-review values
- **Cash control**: opening float, counted cash, over/short

The new Item Sales Ledger adds:
- **Item-level visibility**: what was sold, how many of each item
- **Operational context**: which service mode, which payment channel per order line
- **Traceability**: order IDs linkable to specific completed orders

These are complementary layers — settlement tells you *how much money* should have been collected; the item ledger tells you *what was sold* to generate that revenue.

The item ledger section is **collapsible** (`<details>` element, closed by default) to keep the primary settlement view uncluttered. Admin/accountants open it when they need item-level audit detail.

## Schema / Data Implications

No new Firestore collections or document writes. The feature is purely derived from the existing `orders` collection that ReconciliationView already subscribes to. No schema changes required.

The detail rows use `timestampToDate(order.updatedAt)` for "Completed At" — this is the same function already used elsewhere in ReconciliationView (imported from `lib/bakeryReconciliation.ts`).
