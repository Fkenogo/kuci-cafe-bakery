# Staff Order Separation Audit (Source-of-Truth Escalation)

## Problem Summary
A source-of-truth mismatch exists between:
- prior implementation reports,
- attached source snapshots referenced by stakeholders,
- and live UI screenshots.

The mismatch directly affects confidence in whether staff-order separation is truly deployed.

## Requested Outcome (This Audit Pass)
- No new feature patching.
- Confirm source-of-truth for current local repo.
- Compare claims vs actual file evidence.
- Produce escalation-ready handover package.

## What Was Claimed in Prior Reports
- Dedicated route `/staff/orders/create` exists and is wired.
- Shared `/orders` is self-order only.
- Staff route hides personal widgets (`Empty Cravings`, `Past Cravings`, personal history).
- Staff create flow has explicit progression into menu/cart.

## What Is Actually Present in Current Local Source
Current local source at `/Users/theo/kuci-cafe-bakery` contains:
- `App.tsx` with `/staff/orders/create` route and wiring.
- `views/OrdersView.tsx` with `hideIdentityCapture`, `lockedStaffOrderSource`, and `hidePersonalOrderWidgets` props.
- `views/StaffOrderEntryView.tsx` with `Continue to Menu` progression.

## What Is Visible in Stakeholder Screenshots / Attached Snapshot Claims
Stakeholder-reported/attached facts indicate a different source snapshot:
1. `App.tsx` does NOT contain `/staff/orders/create`.
2. `App.tsx` still routes shared `/orders` for mixed flow.
3. `OrdersView.tsx` still shows empty-cart branch with `Empty Cravings`, `renderAssistedOrdersSection()`, `renderHistorySection()`.
4. `OrdersView.tsx` does NOT include newer separation flags.

## Exact Mismatch List
1. **Route presence mismatch**
   - Claimed/Current local: `/staff/orders/create` exists.
   - Attached snapshot claim: route absent.
2. **Prop/API mismatch in OrdersView**
   - Claimed/Current local: separation props exist.
   - Attached snapshot claim: props absent.
3. **Render-branch behavior mismatch**
   - Claimed/Current local: personal widgets gated for staff route.
   - Attached snapshot claim: personal widgets still render.
4. **Live UI mismatch**
   - Live screenshots still showing mixed widgets suggest deployed artifact does not match current local source.

## Suspected Root Cause
Most likely one (or more) of:
- Different source trees/snapshots are being compared.
- Deployment was built from a different commit/worktree than the audited local files.
- Stakeholder-attached files are from an older state.
- Deployment channel/environment is not the one built from this workspace.

## Deployed Build Provenance Status
Unverified in this pass. No deploy command or hosting release verification was executed.

## Recommendation for Consultant Escalation
1. Establish single source-of-truth commit SHA for release.
2. Capture exact deployed artifact provenance (branch, commit, build timestamp, channel/site).
3. Require pre-deploy and post-deploy route checks against same commit.
4. Add CI artifact manifest including route map hash and key file checks.
5. Freeze further feature patching until provenance mismatch is resolved.

## Terminal Evidence (Raw)

### `pwd`
```bash
/Users/theo/kuci-cafe-bakery
```

### `git branch --show-current`
```bash
main
```

### `git status --short`
```bash
 M .firebase/hosting.ZGlzdA.cache
 M App.tsx
 M components/Auth.tsx
 M components/Layout.tsx
 M components/staff/OperationalOrdersBoard.tsx
 M docs/auth-bootstrap.md
 M firestore.rules
 M hooks/useFirestore.ts
 M index.css
 M index.html
 M index.tsx
 M lib/accountingTreatment.ts
 M lib/catalog.ts
 M lib/firebase.ts
 M lib/orderPersistence.ts
 M lib/orderRouting.ts
 M types.ts
 M views/AdminCatalogView.tsx
 M views/AdminOrdersView.tsx
 M views/AdminStaffView.tsx
 M views/BakeryView.tsx
 M views/CustomerAuthView.tsx
 M views/HomeView.tsx
 M views/MenuView.tsx
 M views/OrdersView.tsx
 M views/ProfileView.tsx
 M views/ReconciliationView.tsx
?? KUCI_User_Guide.docx
?? KUCI_User_Guide.pdf
?? components/PwaInstallPrompt.tsx
?? docs/manuals/
?? lib/customerCategoryMapping.ts
?? lib/customerRewards.ts
?? lib/menuBaseline.ts
?? lib/orderPayments.ts
?? lib/staffInvites.ts
?? public/
?? views/AdminLoginView.tsx
?? views/StaffInviteView.tsx
?? views/StaffOrderEntryView.tsx
```

### repo directory listing (top-level)
```bash
/Users/theo/kuci-cafe-bakery
... (see docs/evidence/file-truth-check.md for focused evidence excerpts)
```

