# Change Log: Pass 11 — Assisted-By Staff Identity Display

- Date: 2026-04-03
- Branch: main
- Build: PASS
- Lint: PASS (tsc --noEmit, zero errors)

## Objective

Ensure staff identity (`createdByStaffName`) is consistently displayed wherever staff-assisted orders appear: My Assisted Orders history, Admin Orders view, Reconciliation audit tables, and digital receipts.

---

## What Changed

### 1. `lib/accountingTreatment.ts`

Added two fields to `ReconciliationAuditRow`:
```typescript
orderEntryMode: 'customer_self' | 'staff_assisted';
createdByStaffName: string;  // empty string for customer_self
```

Populated in `buildReconciliationAuditRows`:
```typescript
orderEntryMode: order.orderEntryMode === 'staff_assisted' ? 'staff_assisted' : 'customer_self',
createdByStaffName: order.orderEntryMode === 'staff_assisted' ? (order.createdByStaffName || '') : '',
```

### 2. `views/ReconciliationView.tsx`

In both the bakery and cafe Included-Order Audit tables, the Customer cell now shows "via [staffName]" as a sub-label when `row.orderEntryMode === 'staff_assisted'`:

```tsx
<td>
  <span>{row.customerName || 'Walk-in'}</span>
  {row.orderEntryMode === 'staff_assisted' && row.createdByStaffName && (
    <p className="text-[9px] text-[var(--color-primary)]/70 font-black uppercase tracking-wider mt-0.5">
      via {row.createdByStaffName}
    </p>
  )}
</td>
```

No new column — sub-label within the existing Customer cell keeps the table width unchanged.

### 3. `views/AdminOrdersView.tsx`

**Collapsed card summary:** Added "Assisted by [name]" sub-label in the Customer section for staff-assisted orders.

**Expanded card (Staff handling):** The `Staff handling` block now always renders for staff-assisted orders (even if frontAcceptedBy/completedBy are null), showing:
```
Assisted by Fred Kenogo
Accepted by [name]      ← only if set
Completed by [name]     ← only if set
```

### 4. `views/StaffOrderEntryView.tsx` — My Assisted Orders

Each history card now shows "Assisted by [staffName]" sub-label under the customer name:
```tsx
{order.createdByStaffName && (
  <p className="text-[9px] font-black uppercase tracking-widest text-[var(--color-primary)]/70 mt-0.5">
    Assisted by {order.createdByStaffName}
  </p>
)}
```

### 5. Receipt (no change needed)

Receipt already showed `createdByStaffName` as "Created by: [name]" since Pass 09. Confirmed still correct.

---

## What Was NOT Changed

- Order persistence path — `createdByStaffName` was already written correctly
- Loyalty rules — unchanged
- Stock availability — unchanged
- Reconciliation calculations — unchanged
- History filter logic — unchanged
- Staff create-order journey — unchanged
