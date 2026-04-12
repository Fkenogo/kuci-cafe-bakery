# 2026-04-04 Pass 13: Real Item Ratings

## Goal

Replace static/fake item ratings with a real first-pass customer rating flow tied to completed self-orders.

## What Changed

### Rating write path

- Added `itemRatings` as the customer write collection.
- Rating doc id is deterministic: `{orderId}__{serviceArea}__{itemId}`.
- Ratings are created from `views/OrdersView.tsx`.
- Customers can submit:
  - `1-5` stars
  - optional short comment

### Eligibility

- Only completed self-orders can rate.
- Staff-assisted orders are excluded in this pass.
- Ratings are shown from the customer’s `Past Cravings` history card in `views/OrdersView.tsx`.

### Aggregates

- Added `itemRatingAggregates`.
- Added Firestore Functions trigger in `functions/src/index.ts`.
- Aggregate docs store:
  - average rating
  - rating count
  - recent review snapshot

### Customer catalog display

- `hooks/useFirestore.ts` now merges rating aggregate docs into both:
  - cafe menu items
  - bakery items
- This pass intentionally stops trusting static baseline/seed/menu rating fields for customer-facing display.
- Unrated items now show `No ratings yet`.

### UI updates

- `views/MenuView.tsx`
  - shows real average + count or `No ratings yet`
- `views/HomeView.tsx`
  - updated all rating surfaces to use real aggregate-backed values
- `views/BakeryView.tsx`
  - bakery items now display real ratings too
- `components/CustomizerModal.tsx`
  - removed the fake local-only review submission path
  - keeps read-only public review display
  - directs users to rate from completed orders instead

### Types and shared helpers

- `types.ts`
  - added rating doc + aggregate interfaces
  - added `ratingCount` support
- `lib/itemRatings.ts`
  - shared ids, normalization, and rating summary helpers

### Security rules

- Added `itemRatings` rules:
  - authenticated owner only
  - completed self-order only
  - deterministic doc id
  - constrained update path
- Added public-read / no-client-write rules for `itemRatingAggregates`

## Files Changed

- `types.ts`
- `lib/itemRatings.ts`
- `hooks/useFirestore.ts`
- `lib/catalog.ts`
- `views/MenuView.tsx`
- `views/HomeView.tsx`
- `views/BakeryView.tsx`
- `views/OrdersView.tsx`
- `components/CustomizerModal.tsx`
- `firestore.rules`
- `functions/src/index.ts`
- `docs/evidence/item-rating-audit.md`
- `docs/changes/2026-04-04-pass-13-real-item-ratings.md`

## Testing

App checks completed:

- `npm run lint`
- `npm run build`
- `cd functions && npm run build`

Code-path verification completed:

- confirmed old static rating source in `lib/seedData.ts`
- confirmed old display usage in customer views
- confirmed no previous rating write handler existed
- confirmed new rating flow is gated to completed self-orders in `views/OrdersView.tsx`
- confirmed aggregate-backed display path is wired through `hooks/useFirestore.ts`

Manual Firebase end-to-end submission proof is still environment-dependent:

- this pass does not include emulator screenshots
- real persistence/update behavior requires running against the configured Firebase project or emulator with completed eligible orders present

## Notes

This is intentionally a small pilot-safe version.

- one rating per item per order
- no giant review management system
- no automatic ratings from staff-assisted orders
- averages/counts are derived from the dedicated rating system, not seed/demo content
