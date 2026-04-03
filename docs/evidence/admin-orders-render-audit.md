# Admin Orders Render Audit (Pass 09 — 2026-04-03)

## Count Source

**Status pill counts (line 583-587 in AdminOrdersView.tsx):**
```typescript
activeDayOrders.filter(o => o.status === 'completed').length
```

`activeDayOrders` = all orders where `resolveOrderBusinessDate(order) === activeBusinessDate`. No status or `activeOnly` filter applied. Shows raw counts for today.

## List Source

**`filteredOrders` (lines 289-318 in AdminOrdersView.tsx):**
```typescript
return activeDayOrders.filter((order) => {
  if (filters.status !== 'all' && order.status !== filters.status) return false;
  if (filters.serviceMode !== 'all' && ...) return false;
  if (!isDateInRange(order.createdAt, filters.dateRange)) return false;
  if (filters.station !== 'all' && ...) return false;
  if (filters.entryMode !== 'all' && ...) return false;
  if (filters.activeOnly) {
    if (order.status === 'completed') return false;  ← THE BUG
    if (order.status === 'rejected' && filters.status !== 'rejected') return false;
  }
  if (searchTerm && ...) return false;
  return true;
});
```

## Filter Chain Applied to Rendered List

1. `filters.status` — pass-through filter by status value
2. `filters.serviceMode` — pass-through filter
3. `filters.dateRange` — date range check on `order.createdAt`
4. `filters.station` — station visibility check
5. `filters.entryMode` — `order.orderEntryMode` check
6. `filters.activeOnly` — active-only guard ← WHERE THE BUG IS
7. `filters.search` — text search on id + customer name + phone

## Exact Root Cause

`filters.activeOnly` defaults to `true`. The guard:

```typescript
if (order.status === 'completed') return false;
```

is **unconditional** — it excludes all `completed` orders regardless of what `filters.status` is. There is no escape hatch for `filters.status === 'completed'`.

When the user clicks the "Done 3" pill:
- `filters.status` is set to `'completed'`
- `filters.activeOnly` stays `true` (not changed by the pill click)
- The first `if` in the `activeOnly` block fires and drops ALL completed orders
- `filteredOrders` returns an empty array
- `sections` = `[]`
- Empty state renders
- Count pill still shows 3 (reads from `activeDayOrders`, unaffected)

The `rejected` status had a partial fix: `if (order.status === 'rejected' && filters.status !== 'rejected')` — meaning `rejected` orders CAN show through when explicitly selected. The same exception did not exist for `completed`.

## Fix Applied

**`views/AdminOrdersView.tsx` — line 307:**

```typescript
// Before:
if (order.status === 'completed') return false;

// After:
if (order.status === 'completed' && filters.status !== 'completed') return false;
```

Now the `completed` exclusion matches the `rejected` pattern: when the user explicitly selects `status === 'completed'`, the `activeOnly` guard no longer drops completed orders.

## Behavior After Fix

| User action | `filters.status` | `filters.activeOnly` | Completed orders in list |
|---|---|---|---|
| Default (no filter selected) | `'all'` | `true` | Hidden ✓ |
| Click "Done 3" pill | `'completed'` | `true` | Shown ✓ |
| Click "Done 3" again (deselect) | `'all'` | `true` | Hidden ✓ |
| Toggle "All" (activeOnly=false) | any | `false` | Shown ✓ |
| Select "Completed" in filter dropdown | `'completed'` | `true` | Shown ✓ |
