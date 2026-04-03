# File Truth Check (Claims vs Current Source)

## Scope
This file compares report claims and stakeholder snapshot claims against **current local source** in `/Users/theo/kuci-cafe-bakery`.

## Side-by-Side Comparison

| Claim | Actual file evidence | Result |
|---|---|---|
| `App.tsx` contains `/staff/orders/create` | Present at `App.tsx:44`, routed at `App.tsx:604` | **TRUE (current local source)** |
| `StaffOrderEntryView` is wired in `App.tsx` | Import at `App.tsx:15`, render at `App.tsx:606` | **TRUE** |
| `OrdersView.tsx` has `hideIdentityCapture` | Present in props at `OrdersView.tsx:34` | **TRUE** |
| `OrdersView.tsx` has `lockedStaffOrderSource` | Present at `OrdersView.tsx:35`, used in checkout mapping | **TRUE** |
| `OrdersView.tsx` has `hidePersonalOrderWidgets` | Present at `OrdersView.tsx:36`, used in render guards | **TRUE** |
| Empty-cart branch still renders `Empty Cravings` unconditionally | Branch now gated; staff-hidden path returns alternate copy at `OrdersView.tsx:936-947` | **FALSE (for current local source)** |
| `renderAssistedOrdersSection()` and `renderHistorySection()` always render in empty branch | In empty branch yes for self flow, but hidden by `hidePersonalOrderWidgets` in staff flow | **PARTIAL / CONTEXT-DEPENDENT** |
| Staff create route in live screenshots still shows `Empty Cravings`, `My Assisted Orders`, `Past Cravings` | Screenshot evidence indicates mixed UI state | **UNVERIFIED AGAINST CURRENT LOCAL SOURCE** |
| Deployed build came from this exact working tree | No deploy provenance captured in this pass | **UNVERIFIED** |

## Mandatory Terminal Evidence

### repo path
```bash
pwd
/Users/theo/kuci-cafe-bakery
```

### branch
```bash
git branch --show-current
main
```

### status
```bash
git status --short
 M .firebase/hosting.ZGlzdA.cache
 M App.tsx
 ...
?? views/StaffOrderEntryView.tsx
```

### multiple-repo check
```bash
find /Users/theo -maxdepth 3 -type d -name 'kuci-cafe-bakery*' 2>/dev/null
/Users/theo/kuci-cafe-bakery
```

### grep: `/staff/orders/create`
```bash
rg -n "/staff/orders/create" App.tsx views/*.tsx components/*.tsx
App.tsx:44:  '/staff/orders/create',
App.tsx:604:      case '/staff/orders/create': return (
App.tsx:753:        navigate('/staff/orders/create');
```

### grep: `StaffOrderEntryView`
```bash
rg -n "StaffOrderEntryView" App.tsx views/*.tsx
App.tsx:15:import { StaffOrderEntryView } from './views/StaffOrderEntryView';
App.tsx:606:          <StaffOrderEntryView
views/StaffOrderEntryView.tsx:27:export const StaffOrderEntryView: React.FC<StaffOrderEntryViewProps> = ({
```

### grep: `hidePersonalOrderWidgets|hideIdentityCapture|lockedStaffOrderSource`
```bash
rg -n "hidePersonalOrderWidgets|hideIdentityCapture|lockedStaffOrderSource" views/OrdersView.tsx views/StaffOrderEntryView.tsx App.tsx
views/StaffOrderEntryView.tsx:206:          hideIdentityCapture
views/StaffOrderEntryView.tsx:207:          hidePersonalOrderWidgets
views/StaffOrderEntryView.tsx:208:          lockedStaffOrderSource={orderSource}
views/OrdersView.tsx:34:  hideIdentityCapture?: boolean;
views/OrdersView.tsx:35:  lockedStaffOrderSource?: 'walk_in' | 'phone_call' | 'whatsapp' | 'other';
views/OrdersView.tsx:36:  hidePersonalOrderWidgets?: boolean;
```

### grep: `renderHistorySection|renderAssistedOrdersSection`
```bash
rg -n "renderHistorySection|renderAssistedOrdersSection" views/OrdersView.tsx
669:  const renderHistorySection = () => {
794:  const renderAssistedOrdersSection = () => {
961:        {renderAssistedOrdersSection()}
962:        {renderHistorySection()}
1471:          {renderAssistedOrdersSection()}
1474:          {renderHistorySection()}
```

### grep: `navigate('/orders')`
```bash
rg -n "navigate\('/orders'\)" App.tsx views/*.tsx components/*.tsx
App.tsx:513:    navigate('/orders');
```

## Why Live UI Can Still Show Mixed Widgets
Given current local source, mixed widgets on staff-create screenshots strongly suggest one of:
1. deployed build from older source snapshot,
2. testing different environment/channel than this working tree,
3. stale cached app bundle on client.

