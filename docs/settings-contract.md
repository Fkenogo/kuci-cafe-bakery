# Restaurant Settings Contract

## Final Contract

`RestaurantSettings`

- `name: string`
- `tagline?: string`
- `description?: string`
- `logo?: string`
- `active?: boolean`
- `contactInfo: RestaurantContactInfo`
- `colors`
- `extraCosts`
- `deliveryOptions`
- `paymentMethods?: string[]`
- `socialLinks?: Record<string, string>`
- `customizationOptions`

`RestaurantContactInfo`

- `phone?: string`
- `whatsapp?: string`
- `email?: string`
- `location?: string`
- `mapLink?: string`
- `contactPerson?: string`
- `momoPayCode?: string`
- `momoMerchantName?: string`
- `hours?: string`

## Legacy Read Normalization

The app now reads one active structure: `settings.contactInfo.*`.

For transition safety, `normalizeRestaurantSettings` still accepts legacy Firestore documents that use:

- `settings.contact.*`
- `contactInfo.paybill`
- `contactInfo.vendor`

Those are normalized into:

- `contactInfo.momoPayCode`
- `contactInfo.momoMerchantName`

This compatibility is read-only. New seed data and active app code should not write the legacy fields anymore.

## Checkout / Info Rules

- WhatsApp ordering only enables when `contactInfo.whatsapp` exists.
- Mobile Money guidance only enables when `contactInfo.momoPayCode` exists.
- Phone call links only render when `contactInfo.phone` exists.
- Map links only render when `contactInfo.mapLink` exists.
- Hours display falls back to a neutral message when `contactInfo.hours` is absent.
- Delivery pricing falls back to the local constant map if Firestore `deliveryOptions` is missing.

## Station / Backend Impact

This step does not add backend order persistence or admin tooling. It only stabilizes the customer-facing settings contract so later order persistence can rely on one source of truth for:

- order handoff destination
- payment instructions
- store identity / location
- delivery pricing display

## Known Gaps

- No admin UI exists yet for editing settings.
- Firestore rules still allow broad writes to `settings/restaurant`; nested validation is not enforced in this step.
- `CONTACT_INFO` in `constants.tsx` remains a static fallback used by a few non-settings CTAs outside checkout/info.
