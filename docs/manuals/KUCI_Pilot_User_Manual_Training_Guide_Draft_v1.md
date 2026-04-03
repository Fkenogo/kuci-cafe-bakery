# KUCI Cafe & Bakery
## Pilot User Manual / Training Guide

**Version:** Draft v1  
**Date:** [Insert Date]

---

## 1. Executive Overview

### What KUCI solves
KUCI provides one operational system for customer ordering, staff preparation flow, catalog control, and daily reconciliation.

### Why KUCI is needed
Before a unified flow, food and drink operations can suffer from:
- Fragmented order handling across teams
- Missed or delayed orders
- Weak visibility between front service and preparation stations
- Inconsistent handover tracking
- Poor daily reconciliation discipline
- Uncontrolled catalog updates

### What KUCI improves
KUCI helps pilot teams:
- Capture customer orders in one flow (guest ordering)
- Route orders clearly to the correct lane (Cafe vs Bakery)
- Coordinate front service, kitchen, barista, and bakery front roles
- Track order lifecycle status from pending to completion
- Control menu and bakery catalog updates through admin tools
- Run daily reconciliation with clearer accountability

---

## 2. Who Uses the System

### Admin / Owner
- Oversees operational health
- Manages catalog, staff access, and invites
- Monitors orders and stale recovery
- Uses reconciliation dashboards

### Front Service (Cafe)
- Accepts cafe-lane orders
- Monitors preparation progress
- Completes handover

### Kitchen
- Handles food prep tasks assigned to kitchen
- Progresses tasks through accept -> preparing -> ready

### Barista
- Handles beverage prep tasks assigned to barista
- Progresses tasks through accept -> preparing -> ready

### Bakery Front
- Handles bakery-lane customer handover flow
- Processes ready bakery orders without unnecessary kitchen/barista dispatch for ready-to-serve bakery items

### Reconciliation Users
- Bakery reconciliation role: bakery stock and settlement controls
- Cafe reconciliation role: cafe order-to-cash controls

### Customers (Guest Users)
- Browse menu and bakery catalog
- Add items to order
- Customize items where applicable
- Checkout as guests (name and phone required)

---

## 3. User Roles and Permissions

> Role permissions are enforced in operational screens. Users should only operate in their assigned role.

### `admin`
**Can access:**
- Admin Orders
- Admin Staff and invites
- Admin Catalog
- Front/Kitchen/Barista/Bakery boards
- Reconciliation

**Responsible for:**
- Oversight and correction
- Catalog governance
- Staff access management
- Stale order recovery

**Should not:**
- Bypass process discipline unless correcting incidents

### `front_service` (Cafe Front)
**Can access:**
- Cafe front operational board

**Responsible for:**
- Accepting cafe orders
- Completing handover when prep is ready

**Should not:**
- Perform kitchen/barista queue actions

### `bakery_front_service`
**Can access:**
- Bakery front board

**Responsible for:**
- Handling bakery-lane acceptance and handover

**Should not:**
- Operate cafe-only order flow unless assigned

### `kitchen`
**Can access:**
- Kitchen queue

**Responsible for:**
- Food prep station actions

**Should not:**
- Complete front handover steps

### `barista`
**Can access:**
- Barista queue

**Responsible for:**
- Beverage prep station actions

**Should not:**
- Complete front handover steps

### `bakery_account_reconciliation`
**Can access:**
- Reconciliation (bakery mode)

**Responsible for:**
- Bakery daily stock and settlement records

### `cafe_account_reconciliation`
**Can access:**
- Reconciliation (cafe mode)

**Responsible for:**
- Cafe expected vs received controls and variance tracking

### `user` (Customer account type)
**Can access:**
- Customer-facing app areas

**Note:**
- Customer ordering is guest-first; sign-in is not required for placing an order.

---

## 4. Main Solution Modules

### 4.1 Customer Ordering Side
- Home
- Menu
- Bakery
- Orders (cart + checkout)
- Info

### 4.2 Menu / Bakery Browsing
- Cafe menu categories and items
- Bakery categories and bakery items
- Item detail and customization where configured

### 4.3 Cart and Checkout
- Add to order
- Update quantities
- Clear order with confirmation
- Guest identity capture (name, phone)
- Service mode selection (pickup, dine-in, delivery)

### 4.4 Staff Operational Boards
- Cafe Front board
- Bakery Front board
- Kitchen queue
- Barista queue

### 4.5 Orders Management (Admin)
- Full order visibility
- Filtering and status controls
- Stale recovery queue and actions
- Pilot smoke-test panel

### 4.6 Catalog Management (Admin)
- Separate Cafe and Bakery modes
- Category and item management
- Item personalization/modifier groups
- Active/visible/archive/delete controls

### 4.7 Reconciliation
- Bakery reconciliation mode
- Cafe reconciliation mode
- Settlement treatment support
- Cash control/handover fields

### 4.8 Staff Access / Invitations
- Admin login route (`/admin/login`)
- Invite management (admin)
- Invite claim route (`/staff-invite?token=...`)

---

## 5. Core Workflows

### A. Customer Order Flow (Guest)
1. Customer opens app and browses Menu or Bakery.
2. Customer selects items and taps **Add to Order**.
3. If item has options, customer customizes in item modal.
4. Customer opens **Orders** tab (cart).
5. Customer enters required contact details:
   - Name
   - Phone
6. Customer selects service mode:
   - Pickup
   - Dine-In
   - Delivery (with delivery context)
7. Customer submits order.
8. Order enters operational boards based on routing metadata.

### B. Front Service Workflow (Cafe)
1. Open Cafe Front board.
2. Review **Pending** orders.
3. Tap **Accept Order**.
4. If prep is needed, order moves through station workflow.
5. Monitor when order becomes **Ready for Handover**.
6. Complete handover with **Mark Complete**.

### C. Kitchen Workflow
1. Open Kitchen queue.
2. Review **Queued** tasks.
3. Tap **Accept Task**.
4. Tap **Start Preparing**.
5. Tap **Mark Ready** when done.

### D. Barista Workflow
1. Open Barista queue.
2. Review beverage tasks.
3. Tap **Accept Task**.
4. Tap **Start Preparing**.
5. Tap **Mark Ready** when done.

### E. Bakery Front Workflow
1. Open Bakery Front board.
2. Accept bakery-lane orders.
3. For ready-to-serve bakery items, complete handover flow directly.
4. Mark completed handover.

### F. Reconciliation Workflow
#### Bakery Mode
1. Select business date.
2. Open/continue reconciliation.
3. Review sold lines and stock fields.
4. Enter received/waste/adjustments/closing actual.
5. Review totals and variance.
6. Save draft or close day.

#### Cafe Mode
1. Select business date.
2. Open/continue reconciliation.
3. Review completed cafe orders and expected values.
4. Enter received payment totals.
5. Review collectible expected cash vs received variance.
6. Save draft or close day.

### G. Admin Workflow
1. Access admin via `/admin/login`.
2. Review Orders board health (including stale recovery when needed).
3. Manage staff access and invites.
4. Maintain catalog in Cafe/Bakery sections.
5. Validate reconciliation completion for business day.

---

## 6. Feature-by-Feature Usage Guide

### 6.1 Access and Sign-in
**What it does:** Enables internal users to access restricted operational tools.  
**When to use:** Staff/admin only.  
**How to use:**
- Admin entry: `/admin/login`
- Invited staff onboarding: `/staff-invite?token=...`

**Current behavior:**
- Customer flow has no visible sign-in pressure.
- Operational access remains role-based.

### 6.2 Staff Invite Links
**What it does:** Assigns role-based onboarding via invite tokens.  
**When to use:** New staff onboarding or role-specific access onboarding.  
**How to use:**
1. Admin opens staff admin page.
2. Create invite with role and optional identity binding (email/phone).
3. Share invite link securely.
4. Staff opens link and signs in.
5. Staff claims invite and is routed to role workspace.

### 6.3 Category and Item Management
**What it does:** Controls customer-visible catalog and operational metadata.  
**When to use:** Menu updates, bakery updates, cleanup, pilot corrections.  
**How to use:**
1. Open Admin Catalog.
2. Choose **Cafe** or **Bakery** mode.
3. Edit categories or items through modal editor.
4. Save changes and verify customer visibility.

### 6.4 Archive vs Delete
**Archive:** Soft deactivation (preferred for operational safety).  
**Delete:** Permanent removal (use carefully, especially for pilot test data).

### 6.5 Personalization / Modifiers
**What it does:** Allows options like size/toppings/add-ons.  
**When to use:** Configurable items.  
**How to use:**
1. In item editor, open Personalization section.
2. Add modifier group(s).
3. Add options with price delta and active flag.
4. Save item.

### 6.6 Visibility and Availability Controls
- **Active in system:** item/category exists operationally
- **Visible to customers:** shown in customer browsing
- **Available now:** currently orderable

### 6.7 Routing/Operations Fields (Catalog)
**Important fields:**
- Prep Station
- Fulfillment Mode
- Service Area

**Operational impact:** Incorrect routing fields can send work to wrong lanes.

### 6.8 Order Filtering and Search
Available in staff/admin boards:
- status filters
- service mode filters
- date range filters
- station filters (where relevant)
- search by customer/order references

---

## 7. Status Meanings

### Order lifecycle statuses
- **pending**: waiting for front acceptance
- **front_accepted**: accepted by front, awaiting or entering station workflow
- **in_progress**: station prep underway
- **ready_for_handover**: ready for front handover
- **completed**: order handed over and closed
- **rejected**: order or station work rejected and needs follow-up

### Station statuses
- **queued**: station task waiting
- **accepted**: station accepted task
- **preparing**: station actively preparing
- **ready**: station done, waiting for front handover
- **rejected**: station rejected task

### Catalog statuses
- **active**: enabled in system
- **hidden**: not shown to customers
- **unavailable**: visible but not currently orderable
- **archived/deprecated**: intentionally retired from normal use

### Invite statuses
- **pending**: invite can be claimed
- **claimed**: invite already used
- **revoked**: invite cancelled by admin
- **expired**: invite no longer valid

---

## 8. Operational Rules Users Must Understand

1. Cafe and Bakery are separate operational lanes.
2. Routing is item-driven (not just category labels).
3. Ready-to-serve bakery items should follow bakery front handover flow.
4. Front acceptance and completion are critical for clean lifecycle closure.
5. Day-bound logic matters:
   - Active operational queues are current business date only.
   - Older unresolved orders are handled via stale recovery controls.
6. Archive is not delete:
   - archive hides/deactivates safely
   - delete removes record permanently
7. Only authorized staff should use operational and admin tools.

---

## 9. Common Mistakes and How to Avoid Them

### Mistake: Archiving instead of deleting test data (or vice versa)
**Avoid by:** choosing action intentionally:
- Archive for safe retirement
- Delete only for true cleanup

### Mistake: Editing wrong domain (Cafe vs Bakery)
**Avoid by:** confirming active mode tab before edits.

### Mistake: Item not visible after save
**Check:**
- active flag
- visible/hidden flag
- available now flag
- correct category assignment

### Mistake: Category cannot be archived/deleted
**Reason:** linked items still exist.  
**Fix:** move, hide, archive, or delete linked items first.

### Mistake: Order appears stalled
**Check:**
- current status
- station status
- whether it is stale (previous business date)

### Mistake: Wrong account claims invite
**Avoid by:** sharing invite to intended user identity and verifying email/phone binding.

---

## 10. Troubleshooting (Operational)

### “I can’t see my orders”
- Confirm role and board (Front/Kitchen/Barista/Bakery Front)
- Confirm active business date context
- Check filters (status/service mode/search)

### “I can’t access my role”
- Confirm user role assignment in staff admin
- Confirm `isActive` is enabled
- Re-login if role was changed recently

### “Invite link does not work”
- Verify token link is complete
- Verify invite status is pending (not revoked/expired/claimed)
- Verify signed-in identity matches invite constraints if applied

### “Item not showing to customer”
- Check active, visible, available-now flags
- Check correct category/domain
- Check not archived/deprecated

### “Order stuck in queue”
- Check if station action is pending (accept/start/ready)
- Check if front handover completion was missed
- If previous-day unresolved, use stale recovery queue (admin)

### “Image not displaying”
- Confirm image URL is direct image link
- Avoid page links that do not serve raw image

### “Category cannot be archived”
- Category still has linked items. Resolve linked items first.

### “Sign-in issue for internal users”
- Use `/admin/login` for admin/internal entry
- Use `/staff-invite?token=...` for invite onboarding
- For Google OAuth mismatch errors, verify console redirect URI configuration

---

## 11. Pilot Usage Guidance

### Who should use what during pilot
- **Customers:** guest ordering only
- **Front/Kitchen/Barista/Bakery Front:** live operational boards
- **Admin:** oversight, catalog, stale recovery, invite management
- **Reconciliation users:** end-of-day controls by mode

### What to test carefully
- End-to-end order lifecycle (accept -> prep -> ready -> complete)
- Bakery lane vs cafe lane separation
- Catalog changes reflecting correctly in customer flow
- Reconciliation save/open/close behavior
- Invite onboarding reliability

### What feedback to collect
- Speed and clarity of staff actions
- Confusing statuses or labels
- Catalog editing pain points
- Reconciliation usability and variance clarity
- Access/onboarding friction

### What to report immediately
- Orders that cannot progress or close
- Wrong-lane routing behavior
- Missing reconciliation persistence
- Access leaks or incorrect permissions
- Invite claim errors blocking onboarding

---

## 12. Quick Reference Appendix

### A. Roles at a glance
- Admin: full operational and management oversight
- Front Service: cafe acceptance and handover
- Kitchen: food prep station
- Barista: beverage prep station
- Bakery Front: bakery-lane front handling
- Bakery/Cafe Reconciliation: mode-specific daily controls

### B. Key actions by role
- Front: Accept Order, Mark Complete
- Kitchen/Barista: Accept Task, Start Preparing, Mark Ready
- Bakery Front: Accept, handover completion
- Admin: manage orders/stale recovery/catalog/staff invites

### C. Key status flow
- pending -> front_accepted -> in_progress -> ready_for_handover -> completed
- rejected = requires follow-up

### D. Daily operating summary
1. Open with catalog + access checks
2. Process live orders by lane and station
3. Ensure handover completion closes order lifecycle
4. Resolve stale exceptions through admin recovery
5. Complete reconciliation before day close

---

## 13. Pilot-Stage Notes (Current Behavior)

- Guest ordering is the primary customer path.
- Internal access uses `/admin/login` and invite claim path `/staff-invite`.
- Invite onboarding exists and is role-driven, with token-hash based invite records.
- Full enterprise hardening (for example, stricter lockouts/migrations) may still be phased after pilot feedback.

