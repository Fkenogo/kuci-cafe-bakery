# KUCI Cafe & Bakery Product Report

## 1. Product Summary

This product is a mobile-first digital menu and lightweight ordering app for a local cafe and bakery, specifically branded for KUCI Cafe & Bakery in Nyamata. It helps customers browse menu items, customize meals, save favorites, place orders via WhatsApp or MoMo, and keep a simple personal order history and loyalty balance. It appears designed as an MVP for a hospitality business that wants to digitize menu discovery and ordering without building a full e-commerce backend.

Evidence: `metadata.json`, `App.tsx`, `views/OrdersView.tsx`, `types.ts`

## 2. Problem It Solves

The real-world problem is that a cafe or bakery needs a better customer ordering experience than a static paper menu, Instagram posts, or manual WhatsApp chat alone. This app gives the business a branded digital storefront where customers can discover the menu, see categories, customize orders, choose delivery or pickup, and send a structured order through familiar channels like WhatsApp and mobile money rather than forcing the business to operate a full e-commerce backend.

Evidence: `views/HomeView.tsx`, `views/MenuView.tsx`, `views/InfoView.tsx`, `views/OrdersView.tsx`

## 3. Target Users

- Customers ordering food and drinks  
  They use the app to browse the menu, customize meals, save favorites, and place an order.

- Repeat customers / loyalty users  
  They use saved profile info, order history, and loyalty points to reorder faster.

- Store staff or owner  
  They likely use Firebase data and the seed/admin flow to maintain menu categories, settings, and availability.

- Business operator / founder  
  They use it as a branded ordering surface for a single location rather than a marketplace.

Evidence: `views/ProfileView.tsx`, `components/Auth.tsx`, `components/SeedButton.tsx`, `hooks/useFirestore.ts`

## 4. Core User Journey

A customer lands on the home screen, browses featured menu items or categories, searches for food, and opens an item to customize it. They add items to a cart, choose eat-in, pickup, or delivery, enter their name and phone number, then place the order through WhatsApp or follow MoMo payment instructions. After that, the app stores the order locally, updates loyalty points, and allows the customer to reorder later.

Evidence: `App.tsx`, `views/HomeView.tsx`, `components/CustomizerModal.tsx`, `views/OrdersView.tsx`

## 5. Main Features Found in the Codebase

### Fully Implemented

- Menu browsing by category
- Search across menu items
- Item customization for some meal types
- Cart management
- Wishlist/favorites
- Basic profile storage
- Loyalty points and local order history
- Contact/info page with map, phone, WhatsApp, payment info
- Firebase-backed menu/settings/categories loading
- Google sign-in
- Firestore seed flow for initial content

Evidence: `views/MenuView.tsx`, `views/HomeView.tsx`, `components/CustomizerModal.tsx`, `App.tsx`, `lib/seed.ts`

### Partially Implemented

- WhatsApp ordering  
  The flow exists, but it depends on mismatched settings fields and is not backed by a real order record.

- MoMo payment flow  
  Present as a dial string flow, but also depends on the same data mismatch.

- Review submission  
  There is a review form UI, but no persistence.

- Feedback/contact form  
  Form exists, but no submission handling.

- Admin capability  
  Admin identity is hardcoded and only used for seeding, not a real dashboard.

- Bakery section  
  Exists as a separate view but is mostly a themed subset of menu data plus static messaging.

Evidence: `views/OrdersView.tsx`, `components/CustomizerModal.tsx`, `views/InfoView.tsx`, `views/BakeryView.tsx`

### Planned / Implied By The Code Structure

- Real order persistence to Firestore
- Notifications or automations when orders are created
- More complete admin/back-office menu management
- Proper user records with roles
- Structured reviews/ratings
- Full catalog import instead of sample seeding only
- Potential multi-item/menu operations driven from Firebase rules and blueprint schema

Evidence: `functions/src/index.ts`, `firestore.rules`, `firebase-blueprint.json`, `lib/seedData.ts`

## 6. Admin / Back Office Capabilities

Based on the code, admin/internal operators can:

- Sign in with Google
- Seed initial Firestore data
- Control restaurant settings, categories, and menu items through Firebase data
- Potentially manage access through Firestore `users` roles, though that flow is not actually implemented in the app

What they cannot clearly do yet:

- Manage orders from a dashboard
- Edit menu items from the UI
- Handle inventory or kitchen workflow
- Manage staff accounts in-app
- View analytics or customer insights

Evidence: `components/Auth.tsx`, `components/SeedButton.tsx`, `firestore.rules`, `hooks/useFirestore.ts`

## 7. Business Use Case

This looks like a single-merchant ordering product for cafes, bakeries, or casual restaurants that want a branded digital ordering experience without relying entirely on a marketplace app. Commercially, it could be positioned as:

- a white-label restaurant ordering app
- a digital menu + WhatsApp ordering solution
- a lightweight hospitality MVP for local food businesses
- a custom branded ordering experience for independent cafes

The product does not look like a marketplace, POS, or delivery fleet platform. It looks more like a merchant-owned customer ordering surface.

Evidence: `metadata.json`, `views/OrdersView.tsx`, `types.ts`, `lib/seedData.ts`

## 8. One-Line Description

1. A branded mobile ordering app for cafes and bakeries.
2. A digital menu and WhatsApp ordering experience for local restaurants.
3. A lightweight customer ordering platform for independent food businesses.
4. A mobile-first menu, loyalty, and reordering app for cafes.
5. A simple online ordering solution for restaurants without marketplace complexity.
6. A customer-facing ordering app built for cafes, bakeries, and quick-service brands.
7. A digital storefront for food businesses with menu browsing and direct order handoff.
8. A restaurant menu and order flow designed around WhatsApp and mobile money.
9. A branded ordering experience for hospitality businesses that want to own the customer relationship.
10. A simple food ordering MVP for cafes that want discovery, customization, and repeat orders.

## 9. Medium-Length Description

1. This product is a mobile-first digital ordering app for cafes and bakeries. Customers can browse the menu, customize meals, save favorite items, choose pickup or delivery, and place structured orders through WhatsApp or mobile money. It combines digital menu discovery with lightweight order handling, making it a practical fit for independent food businesses that want a branded customer experience without building a full delivery platform.

2. KUCI Cafe & Bakery’s app is designed to replace fragmented ordering with one simple flow. Instead of relying on static menus and unstructured chat messages, customers can search the menu, personalize dishes, manage a cart, and send a ready-to-process order. The product also supports loyalty points, repeat orders, and profile-based convenience, making it more useful for returning customers.

3. This solution appears to be a merchant-owned ordering platform for a local hospitality business. It helps customers discover food and beverage options, place orders with clear details, and interact through channels they already use, such as WhatsApp and phone-based mobile money. For the business, it acts as a branded digital storefront backed by Firebase-managed menu content.

4. The product is a lightweight restaurant commerce experience focused on customer convenience and operational simplicity. It includes category-based menu browsing, item customization, local loyalty tracking, and direct ordering handoff. Rather than functioning like a large delivery marketplace, it appears built for a single business that wants direct digital ordering and stronger repeat customer engagement.

5. This is a digital menu and ordering MVP for independent food businesses. It gives customers a polished front end for browsing, customizing, and reordering meals while letting the business manage menu data through Firebase. The product is especially suited to businesses that want to modernize ordering without committing to a complex POS, delivery fleet, or full online checkout stack.

## 10. Founder/Profile Version

1. Built a mobile-first ordering app for a cafe and bakery, enabling customers to browse menus, customize meals, place orders through WhatsApp, and use loyalty-driven reordering.

2. Designed and developed a branded digital ordering experience for a hospitality business, combining menu discovery, customer profiles, local loyalty tracking, and lightweight direct-order fulfillment.

3. Created a restaurant ordering MVP that helps independent food businesses move from manual ordering to a structured mobile experience with search, cart, customization, and repeat-order flows.

4. Led development of a digital menu and order platform for a local cafe, focused on improving customer convenience and helping the business own the ordering relationship outside third-party marketplaces.

5. Built a Firebase-backed hospitality app that gives customers a modern mobile ordering journey while giving the business a manageable way to publish menu content and support direct orders.

## 11. Website Version

### Headline

Order your favorites from KUCI in just a few taps

### Subheadline

Browse the menu, customize your meal, choose pickup or delivery, and place your order directly through KUCI’s mobile ordering experience.

### Short Features Block

- Browse the full cafe and bakery menu by category
- Customize meals, sides, and extras before ordering
- Save favorite items and reorder faster next time
- Earn loyalty points and keep track of past orders
- Order directly through WhatsApp and mobile money

### How It Works

1. Explore the menu and pick what you want.
2. Customize your items and add them to your order.
3. Choose eat-in, pickup, or delivery.
4. Send your order directly to KUCI through WhatsApp.

## 12. What Is Still Unclear

- Whether this is intended to stay a single-store app or become a reusable white-label product.  
  Assumption: currently single-store, but structurally could be adapted.

- Whether loyalty points are meant to be purely local MVP behavior or a real customer rewards system.  
  Assumption: currently MVP-only and stored locally.

- Whether MoMo is meant to be only payment instructions or a true payment integration.  
  Assumption: currently instruction-based, not integrated checkout.

- Whether Firestore is supposed to be edited manually by staff or eventually through an admin dashboard.  
  Assumption: manual for now, dashboard later.

- Whether order persistence was intentionally deferred or simply unfinished.  
  Assumption: unfinished, because cloud functions reference `orders/{orderId}`.

- Whether Google sign-in is for customers, staff, or both.  
  Assumption: both are possible, but only admin seeding is meaningfully gated today.

Evidence for uncertainty: `functions/src/index.ts`, `firestore.rules`, `App.tsx`, `components/Auth.tsx`

## Recommended Public Positioning

### Best Simple Description

A branded mobile ordering app for cafes and bakeries that combines digital menu browsing, meal customization, and direct order handoff through WhatsApp.

### Best LinkedIn-Ready Version

Built a mobile-first cafe ordering platform that lets customers browse menus, customize meals, place direct orders via WhatsApp, and return through loyalty and reorder flows.

### Best Investor/Partner-Facing Version

A lightweight digital commerce platform for independent food businesses, helping cafes and bakeries turn menu discovery, customer retention, and direct ordering into a branded mobile experience without depending entirely on third-party marketplaces.

### Best Short Tagline

Digital ordering for independent food brands.

## Source Files Used

Main sources used for these conclusions:

- `App.tsx`
- `views/HomeView.tsx`
- `views/MenuView.tsx`
- `views/OrdersView.tsx`
- `views/ProfileView.tsx`
- `types.ts`
- `firestore.rules`
- `functions/src/index.ts`
