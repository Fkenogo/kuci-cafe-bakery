# Catalog Model

## Overview

This codebase now uses a normalized catalog contract for menu data. The goal of the model is to support:

- customer ordering
- seed-driven menu setup
- future admin editing
- future routing to kitchen, bakery, bar, and coffee production stations

The catalog foundation is implemented in:

- `types.ts`
- `lib/catalog.ts`
- `lib/seedData.ts`
- `lib/seed.ts`

## Final Menu Model

### MenuCategory

Used for menu grouping and future station-aware admin workflows.

Fields:

- `id`
- `name`
- `slug`
- `description?`
- `sortOrder?`
- `active`
- `iconName?`
- `station?`

### MenuItem

Primary catalog record for customer ordering.

Fields:

- `id`
- `name`
- `description`
- `categoryId`
- `categoryName?`
- `basePrice`
- `imageUrl?`
- `active`
- `available`
- `station`
- `itemType`
- `variants?`
- `modifierGroups?`
- `tags?`
- `tagline?`
- `note?`
- `reviews?`
- `averageRating?`
- `featured?`
- `sortOrder?`

Compatibility fields retained during migration:

- `category?`
- `price?`

These are preserved only to keep old local data and stale assumptions from breaking immediately.

### MenuVariant

Used for items with size or packaging-based price changes.

Fields:

- `id`
- `name`
- `price`
- `active`
- `description?`
- `isDefault?`

### ModifierGroup

Used for required or optional item choices.

Fields:

- `id`
- `name`
- `selectionType`
- `required?`
- `minSelections?`
- `maxSelections?`
- `includedInPrice?`
- `options`

### ModifierOption

Used inside a modifier group.

Fields:

- `id`
- `name`
- `priceDelta`
- `active`
- `description?`
- `isDefault?`
- `tags?`

### ItemCustomization

Persisted on cart items and order history.

Fields:

- `selectedVariantId?`
- `selectedVariantName?`
- `selectedVariantPrice?`
- `selectedModifiers?`
- `sides?`
- `toppings?`
- `extras?`
- `instructions?`
- `extraCost`

## Station Routing Approach

Every menu item has a `station` field. The supported values are:

- `kitchen`
- `bakery`
- `bar`
- `coffee`

Current usage:

- Used for normalized catalog ownership and future routing
- Used as a fallback for icon and image logic

Future intended usage:

- kitchen ticket routing
- coffee bar routing
- bar routing for cocktails and drinks
- bakery routing for pastry production

## Item Types Supported

### `simple`

Single-price item with no variants required.

Examples:

- Soda
- Passion Juice
- Cafe Au Lait
- Espresso Martini

### `variant`

Item with meaningful price variants.

Examples:

- Whole Fish
- Red Wines

### `customizable`

Item with configurable modifier groups.

Examples:

- KUCI Classic
- Chicken Stew
- Make Your Own Pizza

### `combo`

Bundled breakfast or meal with fixed base price and required sub-choices.

Examples:

- Kuchi Breakfast

## Real KUCI Seed Examples Added

The structured seed foundation now includes representative real KUCI examples for:

- Signature Meals
  - `KUCI CLASSIC`
  - `CHICKEN STEW`
  - `WHOLE FISH`
- Breakfast
  - `KUCHI BREAKFAST`
- Pizza
  - `MAKE YOUR OWN PIZZA`
- Fresh Juice / Coffee
  - `PASSION JUICE`
  - `CAFÉ AU LAIT`
- Beverages
  - `SODA`
- Cocktails / Wines
  - `ESPRESSO MARTINI`
  - `RED WINES`

These are seeded from `lib/seedData.ts`.

## Known Gaps Still Remaining

- The frontend still uses a lightweight customizer and does not yet expose every catalog capability elegantly.
- Existing views still lean on denormalized fields like `categoryName` for display convenience.
- The app still stores cart, history, and loyalty data in localStorage rather than in backend order records.
- Firestore rules were updated to align with the new model, but they still do not deeply validate nested variant/modifier structures.
- There is still no admin UI for editing categories, menu items, variants, or modifier groups.
- Production station routing is modeled in data only; no operational workflow consumes it yet.
- The full KUCI menu is not entered yet. This step establishes the normalized seed foundation with representative real examples.

## Recommended Next Steps

1. Migrate order/cart rendering fully to catalog-driven display helpers.
2. Add admin-side create/edit tooling for categories, items, variants, and modifier groups.
3. Persist orders to Firestore using the normalized catalog IDs and customization payload.
4. Add station-aware fulfillment logic only after the catalog model is stable in production data.
