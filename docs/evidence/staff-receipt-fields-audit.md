# Staff Receipt Fields Audit (Pass 09 — 2026-04-03)

## Fields Available on PersistedOrder for Receipt

| Field | Type | Receipt Use | Status |
|---|---|---|---|
| `id` | `string?` | Order number (last 8 chars) | Available ✓ |
| `createdAt` | Firestore Timestamp | Order date | Available ✓ |
| `updatedAt` | Firestore Timestamp | Completion date | Available ✓ |
| `customer.name` | `string` | Customer name | Available ✓ |
| `customer.phone` | `string` | Customer phone | Available ✓ |
| `assistedCustomerName` | `string?` | Fallback customer name | Available ✓ |
| `assistedCustomerPhoneNormalized` | `string?` | Fallback phone | Available ✓ |
| `items[].itemName` | `string` | Item name per line | Available ✓ |
| `items[].quantity` | `number` | Qty per line | Available ✓ |
| `items[].unitPrice` | `number` | Unit price per line | Available ✓ |
| `items[].lineTotal` | `number` | Line total | Available ✓ |
| `items[].selectedOptions` | `string[]` | Customization options | Available ✓ |
| `subtotal` | `number` | Subtotal (if delivery fee present) | Available ✓ |
| `deliveryFee` | `number` | Delivery fee | Available ✓ |
| `total` | `number` | Grand total | Available ✓ |
| `checkoutPaymentChoice` | `'cash' \| 'mobile_money' \| 'pay_later'?` | Payment method | Available ✓ |
| `paymentStatus` | `OrderPaymentStatus` | Payment status | Available ✓ |
| `orderSource` | `'walk_in' \| 'phone_call' \| 'whatsapp' \| 'other'?` | Order channel | Available ✓ |
| `serviceMode` | `'pickup' \| 'dine_in' \| 'delivery'` | Service mode | Available ✓ |
| `createdByStaffName` | `string?` | Staff who created order | Available ✓ |
| `completedBy.displayName` | `string?` | Staff who completed | Available ✓ (fallback for staff name) |
| `status` | `OrderStatus` | Gate for receipt button | Available ✓ |

## Fields Missing for Full Receipt

None that are material. All receipt-relevant data is stored in `PersistedOrder`.

**Note:** `completedAt` is not a discrete field — completion timestamp is inferred from `updatedAt` (which is updated at completion). This is acceptable; the timestamp displayed as "Completed:" uses `updatedAt`.

## Assumptions

- `order.customer.name` is preferred over `assistedCustomerName` as it's the normalized field written by `createOrder`. Both are checked as fallbacks.
- `order.updatedAt` is used as the completion timestamp. This is correct for completed orders because `updateDoc` with `updatedAt: serverTimestamp()` runs at completion.
- `order.createdByStaffName` is preferred for the "Created by" field; `completedBy.displayName` is the fallback.
- Currency is always RWF. No formatting library needed.

## Receipt Rendering Approach

**Chosen: Standalone printable HTML page via Blob URL**

Implementation in `views/StaffOrderEntryView.tsx`:
- `esc()` function — HTML-escapes all user-supplied strings before injection into HTML
- `openReceiptWindow(order: PersistedOrder)` — builds HTML as an array of parts, creates a `Blob`, opens via `URL.createObjectURL()`
- `URL.revokeObjectURL()` called after 30 seconds to free memory
- Receipt opens in a new 480×700 popup window
- `@media print` CSS reduces padding for print output
- Staff can print (Ctrl+P) or screenshot for customer sharing

**Why this approach:**
- No new component file required
- No modal state in component
- No global CSS changes
- Print-native: browser print dialog opens directly from the new tab
- Shareable: staff can screenshot or "Save as PDF" via browser print
- Completely isolated from the main app's React tree
- All user strings HTML-escaped (XSS-safe)
