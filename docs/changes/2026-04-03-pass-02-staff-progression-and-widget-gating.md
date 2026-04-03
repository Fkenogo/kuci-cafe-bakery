# Change Log: Pass 02 - Progression and Widget Gating

- Date/Time: 2026-04-03 (local)
- Objective: Add visible progression from customer details to build order, and suppress personal widgets in staff create flow.

## Files Touched
- `views/StaffOrderEntryView.tsx`
- `views/OrdersView.tsx`
- `App.tsx`

## Actual Code Status
- `Continue to Menu` progression exists in `StaffOrderEntryView`.
- Staff flow passes `hidePersonalOrderWidgets` and `hideIdentityCapture` into `OrdersView`.
- `OrdersView` has guards to suppress history/assisted widgets for staff flow.

## Verified
- `hidePersonalOrderWidgets` symbol present and used.
- Empty-cart branch has separate staff message when personal widgets are hidden.

## Not Verified
- Visual confirmation in deployed environment at screenshot time.

## Screenshot Availability
- Not captured in this pass.

## Deployment Status
- Not deployed/verified in this pass.
