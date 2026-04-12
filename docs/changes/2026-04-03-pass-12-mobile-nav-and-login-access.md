# Pass 12 — Mobile Nav Declutter + In-App Staff/Admin Access

## Date
2026-04-03

## Objective
Improve mobile usability for admin/staff navigation and make staff/admin login discoverable inside installed PWA flow without hidden route typing.

## Scope
- Mobile bottom navigation declutter for operational users.
- Add staff/admin login access entry inside Info view.
- Keep desktop/tablet richer management navigation intact.

## Files Changed
- `App.tsx`
- `components/Layout.tsx`
- `views/InfoView.tsx`

## What Changed
1. Added mobile-specific tab support in `Layout` via optional `mobileTabs` prop.
2. Kept full management tabs on desktop management shell; use compact tabs on mobile.
3. Added role-aware compact mobile tab generation in `App.tsx`.
4. Wired `InfoView` with `onOpenStaffAccess` and workspace quick links.
5. Added explicit **Staff / Admin Access** section inside `InfoView` with **Staff / Admin Login** button routing to `/admin/login`.

## Result
- Mobile bottom nav is reduced to a compact set (4-5 items depending role context).
- Staff/admin login is reachable inside app through `InfoView`, including installed PWA usage.
- Desktop management nav remains unchanged in breadth.

## Verification
- `npm run lint` ✅
- `npm run build` ✅
