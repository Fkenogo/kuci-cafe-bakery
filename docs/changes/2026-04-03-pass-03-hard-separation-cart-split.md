# Change Log: Pass 03 - Hard Separation via Cart Split

- Date/Time: 2026-04-03 (local)
- Objective: Separate self-order and staff-create-order cart state.

## Files Touched
- `App.tsx`

## Actual Code Status
- `cart` and `staffCart` both exist.
- `/orders` route uses `cart`.
- `/staff/orders/create` route uses `staffCart`.
- Add-to-cart switches target cart by `staffOrderBuildSession`.
- Staff create action resets staff session/cart and navigates to dedicated route.

## Verified
- `staffCart` state and storage key `kuci_staff_cart` present.
- Dedicated route wiring uses staff cart update/clear handlers.

## Not Verified
- Deployed environment provenance (whether this build is live).

## Screenshot Availability
- Not captured in this pass.

## Deployment Status
- Not deployed/verified in this pass.
