# Assisted Staff Identity Audit (Pass 11 — 2026-04-03)

## Staff Identity Fields Before This Pass

**In `PersistedOrder` (types.ts):**
- `createdByStaffUid?: string` — UID of the staff who created the order ✓
- `createdByStaffRole?: Exclude<UserRole, 'user'>` — role of that staff ✓
- `createdByStaffName?: string` — display name of that staff ✓

**In `normalizeLiveOrder` (orderRouting.ts):**
All three fields are passed through from Firestore to `LiveOrder` with string validation guards. ✓

**In `orderPersistence.ts` write path:**
```typescript
createdByStaffUid: input.entry?.createdByStaff?.uid as string,
createdByStaffRole: input.entry?.createdByStaff?.role,
createdByStaffName: normalizeString(input.entry?.createdByStaff?.name),
```
`createdByStaff.name` comes from `orderEntryContext.staffIdentity.displayName` (OrdersView.tsx line 291). ✓

**Conclusion: persistence was already complete and correct. No changes to persistence path needed.**

## What Was Missing (Display Only)

| Location | Missing |
|---|---|
| My Assisted Orders history cards | `createdByStaffName` not shown |
| Admin Orders order cards (collapsed + expanded) | `createdByStaffName` not shown |
| Reconciliation bakery audit table | `createdByStaffName` not in `ReconciliationAuditRow` |
| Reconciliation cafe audit table | same |
| Digital receipt | Already present (Pass 09) ✓ |

## What Was Added

### `ReconciliationAuditRow` (lib/accountingTreatment.ts)
Two new fields added:
- `orderEntryMode: 'customer_self' | 'staff_assisted'`
- `createdByStaffName: string` (empty string for customer_self orders)

These are populated from the source `PersistedOrder` in `buildReconciliationAuditRows`. No structural changes to existing fields.

### Where Staff Identity Is Now Displayed

| Location | Display style | Condition |
|---|---|---|
| My Assisted Orders card | Sub-label: "Assisted by [name]" | `order.createdByStaffName` present |
| Admin Orders card (collapsed) | Sub-label: "Assisted by [name]" under customer phone | `order.orderEntryMode === 'staff_assisted'` |
| Admin Orders card (expanded) | Line in Staff handling block: "Assisted by Fred Kenogo" | `order.orderEntryMode === 'staff_assisted'` |
| Reconciliation bakery audit table | Sub-label in Customer cell: "via [name]" | `row.orderEntryMode === 'staff_assisted' && row.createdByStaffName` |
| Reconciliation cafe audit table | Same | Same |
| Digital receipt | "Created by: [name]" line | Always for staff-assisted (Pass 09) |

## Backward Compatibility for Older Assisted Orders

### Orders with `createdByStaffName` set (new orders, post-Pass 06+)
Display works correctly.

### Older orders with `createdByStaffName` missing or empty string

All display sites use safe guards:
- `order.createdByStaffName && (...)` — renders nothing if falsy
- `row.createdByStaffName && (...)` — same pattern in reconciliation
- Receipt: `order.createdByStaffName || order.completedBy?.displayName || '—'` — falls back to completedBy or dash

**Older assisted orders without staff name simply show no "Assisted by" label.** No crash, no broken layout, no misleading data.

### Orders with `orderEntryMode` not set (pre-`orderEntryMode` schema)
`normalizeLiveOrder` maps missing `orderEntryMode` to `undefined`, and all display checks use `=== 'staff_assisted'` explicitly. Missing value evaluates to false — no label shown. Safe.
