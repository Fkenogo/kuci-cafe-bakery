# Mobile Navigation Audit

## Files Audited
- `App.tsx`
- `components/Layout.tsx`

## Previous Behavior (Crowded)
`Layout` rendered `tabs` for all viewports. For operational roles, `App.tsx` provided a long tab list (admin: Orders, Create, Staff, Catalog, Front, Bakery Front, Kitchen, Barista, Reconciliation), which caused cramped mobile bottom navigation.

## Current Mobile Strategy
`Layout` now accepts `mobileTabs` and renders:
- Desktop management shell: full `tabs`
- Mobile/default shell: compact `mobileTabs` (or fallback `tabs`)

## Current Mobile Bottom Nav (By Context)
### Non-staff/customer paths
- Home
- Menu
- Bakery
- Orders
- Info

### Admin (staff paths)
- Home
- Orders
- Create
- Info

### Front Service
- Home
- Front
- Create
- Info

### Bakery Front Service
- Home
- Bakery
- Create
- Info

### Kitchen
- Home
- Kitchen
- Info

### Barista
- Home
- Barista
- Info

### Reconciliation roles
- Home
- Reconcile
- Info

## Items Moved Out of Mobile Bottom Nav
Secondary operations were removed from direct mobile bottom nav and surfaced via `InfoView` workspace links:
- Front
- Bakery Front
- Kitchen
- Barista
- Reconciliation
- Catalog
- Staff
- Admin Orders

## Why This Solves Crowding
- Mobile tabs are now capped to concise role-relevant actions.
- Labels remain readable.
- Touch targets are less cramped.
- Desktop still keeps richer operational tab breadth.
