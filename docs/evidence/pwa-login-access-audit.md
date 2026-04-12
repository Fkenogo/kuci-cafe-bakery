# PWA Login Access Audit

## Files Audited
- `App.tsx`
- `views/InfoView.tsx`
- `views/AdminLoginView.tsx`
- `views/CustomerAuthView.tsx`
- `views/StaffInviteView.tsx`

## Previous Problem
Installed PWA users could not easily reach internal login without manually typing hidden paths (for example `/admin/login`).

## Required Placement
Staff/admin access entry must live inside `InfoView` (mobile far-right bottom-nav destination).

## Implemented Access Entry
`InfoView` now includes a dedicated section:
- Title: **Staff / Admin Access**
- Primary action: **Staff / Admin Login**
- Action callback: `onOpenStaffAccess`

In `App.tsx`, `InfoView` is wired as:
- `onOpenStaffAccess={() => navigate('/admin/login')}`

## Installed-PWA Flow (Now)
1. User opens installed KUCI app.
2. User taps bottom-nav **Info**.
3. User taps **Staff / Admin Login**.
4. App opens `/admin/login` (no manual URL typing required).
5. After authentication, existing role routing takes users to allowed workspace paths.

## Additional Workspace Shortcuts
If a signed-in operational user is detected in `InfoView`, workspace quick-link buttons appear for direct navigation (role-scoped).

## Scope Safety
- Customer flow remains guest-first.
- No staff/admin access button was added to Home/menu ordering surfaces.
- Access is discoverable in-app via Info, suitable for installed PWA usage.
