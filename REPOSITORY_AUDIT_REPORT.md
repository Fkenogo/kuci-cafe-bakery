# KUCI Cafe & Bakery MVP Audit Report

## Codebase Summary

This is a mobile-first restaurant ordering MVP for KUCI Cafe & Bakery in Nyamata. In simple terms, it lets a customer browse menu categories from Firestore, customize items, build a cart, place an order through WhatsApp or MoMo instructions, and keep a local wishlist, profile, loyalty points, and order history.

The likely target user is a walk-in or delivery customer using a phone. The likely admin/operator flow is lightweight: sign in with Google, seed Firestore data, and maintain menu/settings directly in Firebase. The app is not a full e-commerce system yet; it is more a branded ordering front end with local session state and external checkout/contact handoff.

The stack is React 19 + TypeScript + Vite + Tailwind 4 on the frontend, Firebase Auth + Firestore on the backend, plus a small Firebase Functions project that currently only contains placeholder triggers. Data flow is simple: Firestore provides `settings`, `categories`, and `menuItems`; the app stores cart/history/profile/wishlist in `localStorage`; order submission opens WhatsApp or `tel:` instead of creating backend orders.

### Key Implemented Features

- Firestore-backed restaurant settings, categories, and menu items via `hooks/useFirestore.ts`
- Home/menu/bakery/info/orders/profile views via `App.tsx`
- Item customization modal with sides, toppings, extras, and notes via `components/CustomizerModal.tsx`
- Local cart, wishlist, loyalty points, and order history via `App.tsx`
- Google sign-in via `components/Auth.tsx`
- Firestore seed button for one hardcoded admin email via `components/SeedButton.tsx`

### Clearly Unfinished or Partial

- Review submission UI has no submit logic in `components/CustomizerModal.tsx`
- Feedback form has no backend or action in `views/InfoView.tsx`
- Orders are never written to Firestore despite a trigger existing in `functions/src/index.ts`
- Seed data is only a tiny sample while a huge unused static menu still exists in `constants.tsx` and `lib/seedData.ts`

## Repository Structure And Quality

The repo is small and easy to navigate, but it is very MVP-flat: `views/`, `components/`, `lib/`, `hooks/`, and a separate `functions/` folder. Separation of concerns is acceptable at a small scale, but state management, navigation, product logic, and persistence are all concentrated in `App.tsx`, which will become fragile quickly.

### Quality Observations

- Naming is inconsistent: `contactInfo` in types but `contact` in view code, `category` in app docs but `categoryId` in rules/schema.
- Documentation is weak and outdated: `README.md` still describes an AI Studio/Gemini app.
- Dead or stale code exists: large static menu/constants, unused imports, prompt-history artifacts, and placeholder functions.
- Type safety is weak enough that runtime bugs slip through even though `npm run lint` and `npm run build` currently pass.
- Config clarity is poor: Firebase schema docs, Firestore rules, frontend types, and UI code disagree on field names.

## Feature Audit

### Menu Browsing

Menu browsing is supposed to work by choosing a category and viewing matching items. It is implemented in `views/HomeView.tsx` and `views/MenuView.tsx`. In reality, home-to-menu category selection is broken because `App.tsx` ignores the selected category and `App.tsx` does not provide `selectedCategory` or `setSelectedCategory`, so category tabs can fail at runtime.

### Ordering

Ordering is supposed to collect cart items, customer details, delivery mode, and then send the order through MoMo or WhatsApp. The implementation is in `views/OrdersView.tsx`. In practice, the WhatsApp and MoMo flows read `settings.contact.*`, but the actual type and seed data use `contactInfo` in `types.ts` and `lib/seedData.ts`, so those actions will break with real settings data.

### Info / Contact

Info/contact is supposed to show hours, map, contact channels, and payment instructions. It is implemented in `views/InfoView.tsx`. It will break for the same reason: it expects `settings.contact` and optional fields like `tagline` and `hours` that are not in the declared `RestaurantSettings` shape.

### Customization

Customization works visually and mostly functionally, but it relies on category names in several places inside `components/CustomizerModal.tsx`. Since menu items now store category IDs, image selection and some category-specific behaviors are inconsistent.

### Auth

Auth is supposed to gate admin seeding and personalize the user. Sign-in works through Google popup in `components/Auth.tsx`, but there is no user profile write to Firestore, no role assignment flow, and no integration with the `users` rules model.

## Issues

### Bugs

- Critical: order and info flows dereference `settings.contact.*`, but settings data is `contactInfo.*`; this breaks MoMo, WhatsApp, map, phone, vendor, and hours UI. Files: `views/OrdersView.tsx`, `views/InfoView.tsx`, `types.ts`.
- Critical: menu navigation state is incomplete; home category selection is ignored and `MenuView` expects props not passed by `App`. Files: `App.tsx`, `views/MenuView.tsx`.
- Medium: order/profile item icons use category names, but menu items now store category IDs, so icons mostly fall back incorrectly. Files: `views/OrdersView.tsx`, `views/ProfileView.tsx`, `constants.tsx`.
- Medium: item imagery/customization conditions still compare `item.category` to display names instead of category IDs. File: `components/CustomizerModal.tsx`.
- Low: loyalty/order IDs and profile member ID use `Math.random`, making state unstable and non-reproducible. Files: `App.tsx`, `views/OrdersView.tsx`, `views/ProfileView.tsx`.

### Logical Gaps / Incomplete Features

- Critical: no real order persistence; completing an order only updates local state, so staff never receives structured data unless WhatsApp succeeds. Files: `App.tsx`, `views/OrdersView.tsx`.
- Medium: review form is a dead-end UI with no submit handler or storage. File: `components/CustomizerModal.tsx`.
- Medium: feedback form is cosmetic only. File: `views/InfoView.tsx`.
- Medium: seed flow only inserts 3 sample menu items, so the seeded app is barely usable. File: `lib/seedData.ts`.
- Low: cloud functions are placeholders and never receive data from the frontend. File: `functions/src/index.ts`.

### Security Concerns

- Medium: admin access is hardcoded to one email in both UI and rules, which is brittle and not operationally safe. Files: `App.tsx`, `firestore.rules`.
- Medium: no backend validation for orders because there is no backend order write path.
- Low: root `package.json` includes `firebase-admin` and `firebase-functions` even though browser code should not need server SDKs.

### Performance / Scalability Risks

- Medium: the main bundle is large for a simple mobile app; build output produced a 784 kB JS chunk.
- Medium: the app subscribes to whole collections with no pagination or lazy loading. File: `hooks/useFirestore.ts`.
- Low: the giant unused static menu in `constants.tsx` adds maintenance noise and risks accidental divergence.

### Integration Problems

- Critical: Firestore rules require `categoryId`, but seed/frontend write `category`. Files: `firestore.rules`, `lib/seed.ts`, `firebase-blueprint.json`.
- Medium: README and Vite config still reference Gemini/AI Studio even though the app does not use it. Files: `README.md`, `vite.config.ts`.
- Medium: auth model and Firestore `users` rules are disconnected; no user documents are created. Files: `components/Auth.tsx`, `firestore.rules`.

### Testing Gaps

- Critical: there are no repository tests outside dependencies.
- Medium: `tsconfig` is not strict, which helps runtime schema bugs pass static checks.

## Prioritized Fix Plan

1. Stabilize data contracts first: unify `RestaurantSettings.contactInfo` vs `contact`, and `MenuItem.category` vs `categoryId` across types, rules, seed data, and all views.
2. Fix navigation and ordering flow next: add real selected-category state in `App`, repair `MenuView` props, and make WhatsApp/MoMo actions read the correct settings fields.
3. Remove or quarantine dead MVP leftovers: unused static menu, stale Gemini docs/config, unused imports, and placeholder functionality that confuses maintenance.
4. Tighten the minimum safety net: add strict TypeScript options incrementally, plus a few focused tests for category filtering, order total calculation, and settings field mapping.
5. Decide the MVP order strategy: either keep the current “WhatsApp handoff only” model and make that explicit, or add a minimal `orders` collection write before invoking external channels.
6. Defer polish items: review submission, feedback backend, richer admin tooling, and cloud function expansion can wait until the core data model is coherent.

## Verification

No code changes were made as part of the audit itself.

The following checks were run:

- `npm run lint`
- `npm run build`

Both passed, but the build still emits a large-bundle warning and several runtime issues remain because the current typing/configuration does not enforce the real data shape strongly enough.
