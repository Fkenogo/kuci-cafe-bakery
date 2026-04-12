# Item Rating Audit

Date: 2026-04-04

## Files Audited

- `lib/catalog.ts`
- `lib/menuBaseline.ts`
- `lib/seedData.ts`
- `hooks/useFirestore.ts`
- `views/MenuView.tsx`
- `views/BakeryView.tsx`
- `views/HomeView.tsx`
- `views/OrdersView.tsx`
- `components/CustomizerModal.tsx`
- `types.ts`
- `lib/orderPersistence.ts`
- `App.tsx`
- `firestore.rules`
- `functions/src/index.ts`

## Audit Findings

### 1. Where current stars and numbers came from

Before this pass, visible item ratings came from `MenuItem.averageRating` and `MenuItem.reviews`.

- Seed/demo fallback data already contained hardcoded ratings:
  - `lib/seedData.ts`
  - Example: `kuci-classic` has `averageRating: 4.8` and a seeded review.
  - Example: `cafe-au-lait` has `averageRating: 4.9` and a seeded review.
- The menu baseline loader in `lib/menuBaseline.ts` can fall back to that seed data.
- Firestore `menu` documents could also contain `averageRating` and `reviews` because `normalizeMenuItem` in `lib/catalog.ts` preserved those fields.
- `hooks/useFirestore.ts` merged baseline menu items with Firestore `menu` docs, so the UI could show either:
  - seeded/static values from baseline content, or
  - whatever static `averageRating` / `reviews` happened to be stored on a menu doc.

### 2. Were ratings stored in Firestore?

There was no real customer rating collection.

- Firestore schema/comments mentioned `averageRating` and `reviews` on `menu`.
- `hooks/useFirestore.ts` read `menu`, but there was no `itemRatings` collection, no aggregate collection, and no rating write path.
- Bakery items were read from `bakeryItems`, but bakery item UI did not render ratings at all.

### 3. Were ratings derived from static fields in catalog/baseline/seeded content?

Yes.

- Static source confirmed in `lib/seedData.ts`.
- Those values flowed through `lib/menuBaseline.ts` and `hooks/useFirestore.ts`.
- `normalizeMenuItem` in `lib/catalog.ts` preserved incoming `averageRating` / `reviews` instead of recalculating them.

### 4. Were ratings ever written by users?

No real persistence existed.

- `components/CustomizerModal.tsx` had a `Write a Review` form UI.
- That form had local component state only.
- The `Post Review` button had no Firestore write handler and no submit logic.

### 5. Was there any existing review/comment schema?

Only a frontend shape existed.

- `types.ts` defined:
  - `Review { user, rating, comment, date }`
  - `MenuItem.reviews?`
  - `MenuItem.averageRating?`
- There was no dedicated Firestore review document schema and no item-level rating collection.

### 6. Which screens displayed ratings before this pass?

Cafe/menu ratings were displayed in:

- `views/MenuView.tsx`
- `views/HomeView.tsx`
  - search results
  - Barista’s Choice
  - Today’s Specials
  - Recent Cravings
- `components/CustomizerModal.tsx`

Bakery rating behavior before this pass:

- `views/BakeryView.tsx` did not render rating stars or counts.
- Bakery modal detail also had no real bakery rating source because `BakeryItem` had no rating fields and `adaptBakeryItemToMenuItem` did not map any.

### 7. Was there fake review count or fake star average rendered?

Yes, the star averages were effectively fake/static because they were not tied to customer order activity.

- The app rendered `averageRating` directly.
- The modal rendered `reviews` directly.
- Those values came from static seed/demo data or static menu doc fields.
- There was no real aggregate calculation from customer submissions.

There was also no real rating count field before this pass.

### 8. Were bakery and cafe items handled differently?

Yes.

- Cafe/menu items:
  - supported `averageRating` and `reviews` in the UI and type shape.
- Bakery items:
  - had no rating display in `views/BakeryView.tsx`
  - had no bakery rating fields in `BakeryItem`
  - were adapted into `MenuItem` for customization, but without real rating metadata

## Root Cause

The displayed rating system was not connected to completed orders or user submissions.

It was a presentation-only system built on:

- static seed/demo content in `lib/seedData.ts`
- optional static `averageRating` / `reviews` fields on Firestore menu docs
- a dead-end modal review form with no persistence

## What Needed To Be Replaced vs Reused

### Replaced

- Static rating display dependence on `averageRating` / `reviews` embedded in baseline/seed/menu content
- Dead `Write a Review` modal form

### Reused

- Existing `Review` display shape for showing recent public comments
- Existing order completion pipeline and order history UI in `views/OrdersView.tsx`
- Existing order document structure from `lib/orderPersistence.ts`
  - `orderId`
  - persisted `items[]`
  - `status`
  - `orderEntryMode`
  - `userId`

## Chosen Real Rating Model

### Write model

Collection: `itemRatings/{orderId}__{serviceArea}__{itemId}`

Stored fields:

- `orderId`
- `itemId`
- `itemName`
- `serviceArea` (`cafe` or `bakery`)
- `stars`
- `comment`
- `customerDisplayName`
- `userId`
- `quantityPurchased`
- `businessDate`
- `createdAt`
- `updatedAt`

Rule for first pass:

- one rating per item per order
- not one rating per quantity instance

### Aggregate model

Collection: `itemRatingAggregates/{serviceArea}__{itemId}`

Stored fields:

- `itemId`
- `serviceArea`
- `averageRating`
- `ratingCount`
- `reviews` (latest public comments snapshot)
- `updatedAt`

### Aggregate calculation

Chosen option: backend-maintained aggregates.

Why:

- safer than trusting the client to mutate catalog items
- fits the current Firebase architecture
- keeps customer writes isolated to `itemRatings`
- gives public catalog views a simple read path

Implementation:

- `functions/src/index.ts`
- Firestore trigger on `itemRatings/{ratingId}`
- recomputes average + count + recent review snapshot for the affected item

## Eligibility Rule For This Pass

Only completed self-orders can rate.

Applied rule:

- order must be `completed`
- order must have `orderEntryMode == customer_self`
- order must belong to the authenticated `userId`
- rating doc id is deterministic per `orderId + serviceArea + itemId`

Staff-assisted orders:

- not rateable in this pass
- reason: this pilot pass is meant to reflect ratings from the customer’s own app/account usage, not staff-entered transactions

## How Item Display Works After This Pass

Customer catalog screens no longer trust static seed/menu rating fields for display.

Instead:

- `hooks/useFirestore.ts` subscribes to `itemRatingAggregates`
- menu items and bakery items get rating data merged from aggregate docs
- if no aggregate exists, UI shows `No ratings yet`

## Screens Using Real Ratings After This Pass

- `views/MenuView.tsx`
- `views/HomeView.tsx`
- `views/BakeryView.tsx`
- `components/CustomizerModal.tsx`
- `views/OrdersView.tsx` for rating submission from order history

## Evidence Summary

### Old system

- static source:
  - `lib/seedData.ts`
- merged into live customer catalog:
  - `hooks/useFirestore.ts`
- rendered directly:
  - `views/MenuView.tsx`
  - `views/HomeView.tsx`
  - `components/CustomizerModal.tsx`
- fake write form:
  - `components/CustomizerModal.tsx`

### New system

- customer writes:
  - `itemRatings`
- backend aggregate sync:
  - `functions/src/index.ts`
- public display source:
  - `itemRatingAggregates`
- order-history rating entry:
  - `views/OrdersView.tsx`
