import {
  BakeryCategory,
  BakeryItem,
  Category,
  CartItem,
  DeliveryInfo,
  FulfillmentMode,
  ItemCustomization,
  MenuPrepStation,
  MenuItem,
  MenuItemType,
  MenuVariant,
  RestaurantContactInfo,
  RestaurantSettings,
  SelectedModifier,
  StationType,
} from '../types';

export function normalizeStationType(value: unknown): StationType {
  if (value === 'kitchen' || value === 'bakery' || value === 'front_service' || value === 'barista') {
    return value;
  }

  if (value === 'bar' || value === 'coffee') {
    return 'barista';
  }

  return 'kitchen';
}

export function mapStationTypeToMenuPrepStation(value: unknown): MenuPrepStation {
  const station = normalizeStationType(value);
  if (station === 'kitchen') return 'kitchen';
  if (station === 'barista') return 'barista';
  if (station === 'front_service' || station === 'bakery') return 'front';
  return 'none';
}

export function normalizeMenuPrepStation(value: unknown): MenuPrepStation {
  if (value === 'kitchen' || value === 'barista' || value === 'front' || value === 'none') {
    return value;
  }
  return mapStationTypeToMenuPrepStation(value);
}

export function mapMenuPrepStationToLegacyStation(prepStation: MenuPrepStation): StationType {
  if (prepStation === 'kitchen') return 'kitchen';
  if (prepStation === 'barista') return 'barista';
  if (prepStation === 'front') return 'front_service';
  return 'kitchen';
}

const warnedCatalogRecords = new Set<string>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function warnInvalidCatalogRecord(context: string, item: unknown, reason: string) {
  const record = isRecord(item) ? item : {};
  const id = typeof record.id === 'string' && record.id ? record.id : 'unknown';
  const warningKey = `${context}:${id}:${reason}`;

  if (!warnedCatalogRecords.has(warningKey)) {
    warnedCatalogRecords.add(warningKey);
    console.warn(`[catalog] Skipping invalid record in ${context}: ${reason}`, item);
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeVariant(variant: unknown, context: string): MenuVariant | null {
  if (!isRecord(variant)) {
    warnInvalidCatalogRecord(context, variant, 'variant is not an object');
    return null;
  }

  const id = typeof variant.id === 'string' && variant.id.trim().length > 0 ? variant.id.trim() : null;
  const name = typeof variant.name === 'string' && variant.name.trim().length > 0 ? variant.name.trim() : null;
  const price = isFiniteNumber(variant.price) && variant.price >= 0 ? variant.price : null;

  if (!id || !name || price === null) {
    warnInvalidCatalogRecord(context, variant, 'variant is missing id, name, or valid price');
    return null;
  }

  return {
    ...(variant as unknown as Partial<MenuVariant>),
    id,
    name,
    price,
    active: typeof variant.active === 'boolean' ? variant.active : true,
  };
}

function getActiveVariantPrices(item: Partial<MenuItem> | null | undefined): number[] {
  if (!item?.variants?.length) return [];

  return item.variants
    .filter((variant) => variant?.active !== false && isFiniteNumber(variant?.price))
    .map((variant) => variant.price);
}

function inferStation(categoryName?: string): StationType {
  const name = (categoryName || '').toLowerCase();
  if (name.includes('coffee') || name.includes('espresso') || name.includes('tea')) return 'barista';
  if (name.includes('cocktail') || name.includes('wine') || name.includes('beverage') || name.includes('juice')) return 'barista';
  if (name.includes('bakery') || name.includes('pastr')) return 'bakery';
  return 'kitchen';
}

function inferMenuPrepStation(categoryName?: string): MenuPrepStation {
  return mapStationTypeToMenuPrepStation(inferStation(categoryName));
}

function inferItemType(item: Partial<MenuItem>): MenuItemType {
  if ((item.variants?.length || 0) > 0) return 'variant';
  if ((item.components?.length || 0) > 0) return 'composite';
  if ((item.modifierGroups?.length || 0) > 0) return 'configurable';
  return 'simple';
}

function normalizeMenuItemType(value: unknown, fallback: MenuItemType): MenuItemType {
  if (value === 'simple' || value === 'variant' || value === 'configurable' || value === 'composite') {
    return value;
  }
  if (value === 'customizable') return 'configurable';
  if (value === 'combo') return 'composite';
  return fallback;
}

function inferFulfillmentMode(prepStation: MenuPrepStation, itemType: MenuItemType): FulfillmentMode {
  if (itemType === 'composite') return 'made_to_order';
  if (prepStation === 'kitchen' || prepStation === 'barista') return 'made_to_order';
  return 'ready_to_serve';
}

export function getMenuItemCategoryId(item: Partial<MenuItem> | null | undefined): string {
  if (!item) return '';
  return item.categoryId || item.category || '';
}

function normalizeCategoryToken(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function expandCategoryTokens(baseToken: string): string[] {
  if (!baseToken) return [];
  const expanded = new Set<string>([baseToken]);
  const parts = baseToken.split('-').filter(Boolean);
  parts.forEach((part) => expanded.add(part));
  if (parts.includes('and')) {
    expanded.add(parts.filter((part) => part !== 'and').join('-'));
  }
  return Array.from(expanded);
}

export function getMenuItemCategoryTokens(item: Partial<MenuItem> | null | undefined): Set<string> {
  const tokens = new Set<string>();
  if (!item) return tokens;

  const add = (value: unknown) => {
    const token = normalizeCategoryToken(value);
    expandCategoryTokens(token).forEach((expandedToken) => tokens.add(expandedToken));
  };

  add(item.categoryId);
  add(item.category);
  add(item.categoryName);
  return tokens;
}

export function getCategoryTokens(category: Partial<Category> | null | undefined): Set<string> {
  const tokens = new Set<string>();
  if (!category) return tokens;
  const add = (value: unknown) => {
    const token = normalizeCategoryToken(value);
    expandCategoryTokens(token).forEach((expandedToken) => tokens.add(expandedToken));
  };
  add(category.id);
  add(category.slug);
  add(category.name);
  return tokens;
}

export function menuItemMatchesCategory(
  item: Partial<MenuItem> | null | undefined,
  category: Partial<Category> | null | undefined
): boolean {
  const itemTokens = getMenuItemCategoryTokens(item);
  if (itemTokens.size === 0) return false;
  const categoryTokens = getCategoryTokens(category);
  if (categoryTokens.size === 0) return false;
  for (const token of itemTokens) {
    if (categoryTokens.has(token)) return true;
  }
  return false;
}

export function getMenuItemBasePrice(item: Partial<MenuItem> | null | undefined): number | null {
  if (!item) return null;
  if (isFiniteNumber(item.basePrice) && item.basePrice >= 0) return item.basePrice;
  if (isFiniteNumber(item.price) && item.price >= 0) return item.price;

  const variantPrices = getActiveVariantPrices(item);
  if (variantPrices.length > 0) {
    return Math.min(...variantPrices);
  }

  return null;
}

export function getDefaultVariant(item: Partial<MenuItem> | null | undefined): MenuVariant | undefined {
  return item.variants?.find((variant) => variant.isDefault) || item.variants?.[0];
}

export function getMenuItemStartingPrice(item: Partial<MenuItem> | null | undefined): number | null {
  const activeVariantPrices = getActiveVariantPrices(item);
  if (activeVariantPrices.length > 0) {
    return Math.min(...activeVariantPrices);
  }

  const basePrice = getMenuItemBasePrice(item);
  return basePrice !== null ? basePrice : null;
}

export function formatRwf(amount: number): string {
  return `${amount.toLocaleString()} RWF`;
}

export function getMenuItemPriceLabel(item: Partial<MenuItem> | null | undefined): string {
  const activeVariantPrices = getActiveVariantPrices(item);
  if (activeVariantPrices.length > 0) {
    const prices = activeVariantPrices;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? formatRwf(min) : `From ${formatRwf(min)}`;
  }

  const basePrice = getMenuItemBasePrice(item);
  return basePrice !== null ? formatRwf(basePrice) : 'Unavailable';
}

export function getMenuItemCategoryName(item: Partial<MenuItem> | null | undefined, categories: Category[] = []): string {
  if (!item) return 'Menu';
  const categoryId = getMenuItemCategoryId(item);
  return categories.find((category) => category.id === categoryId)?.name || item.categoryName || item.category || 'Menu';
}

export function getCategoryIconKey(item: Partial<MenuItem> | null | undefined, categories: Category[] = []): string {
  return getMenuItemCategoryName(item, categories) || item?.prepStation || item?.station || 'kitchen';
}

export function getMenuItemPrimaryImage(item: Partial<MenuItem> | null | undefined, categories: Category[] = []): string {
  if (!item) {
    return 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=800';
  }
  if (item.imageUrl) return item.imageUrl;

  const categoryName = getMenuItemCategoryName(item, categories);
  const prepStation = normalizeMenuPrepStation(item.prepStation || item.station || inferMenuPrepStation(categoryName));

  if (categoryName.includes('Pizza')) return 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&q=80&w=800';
  if (categoryName.includes('Cocktail') || categoryName.includes('Wine')) return 'https://images.unsplash.com/photo-1545438102-799c3991ffb2?auto=format&fit=crop&q=80&w=800';
  if (categoryName.includes('Coffee') || categoryName.includes('Espresso') || prepStation === 'barista') return 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&q=80&w=800';
  if (prepStation === 'front') return 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&q=80&w=800';
  if ((item.tags || []).includes('breakfast')) return 'https://images.unsplash.com/photo-1528207776546-365bb710ee93?auto=format&fit=crop&q=80&w=800';

  return 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=800';
}

export function getCartItemUnitPrice(item: Partial<CartItem> | null | undefined): number {
  return (getMenuItemBasePrice(item) ?? 0) + (item.customization?.extraCost || 0);
}

export function normalizeMenuItem(input: (Partial<MenuItem> & Record<string, unknown>) | null | undefined, context = 'catalog'): MenuItem | null {
  if (!isRecord(input)) {
    warnInvalidCatalogRecord(context, input, 'record is not an object');
    return null;
  }

  const id = typeof input.id === 'string' && input.id.trim().length > 0 ? input.id : null;
  const name = typeof input.name === 'string' && input.name.trim().length > 0 ? input.name : null;

  if (!id || !name) {
    warnInvalidCatalogRecord(context, input, 'missing required id or name');
    return null;
  }

  const category =
    (typeof input.category === 'string' && input.category.trim().length > 0 ? input.category.trim() : null) ||
    (typeof input.categoryName === 'string' && input.categoryName.trim().length > 0 ? input.categoryName.trim() : null);
  const categoryId = typeof input.categoryId === 'string' && input.categoryId.trim().length > 0
    ? input.categoryId.trim()
    : (category || '');

  if (!category) {
    warnInvalidCatalogRecord(context, input, 'missing required category');
    return null;
  }

  const variants = Array.isArray(input.variants)
    ? input.variants.flatMap((variant, index) => {
        const normalizedVariant = normalizeVariant(variant, `${context} variant[${index}]`);
        return normalizedVariant ? [normalizedVariant] : [];
      })
    : undefined;
  const basePrice = getMenuItemBasePrice({
    ...input,
    variants,
  });
  const prepStation = normalizeMenuPrepStation(input.prepStation || input.station || inferMenuPrepStation(category));
  const station = normalizeStationType(input.station || mapMenuPrepStationToLegacyStation(prepStation));
  const inferredItemType = inferItemType({
    ...input,
    variants,
  });
  const itemType = normalizeMenuItemType(input.itemType, inferredItemType);
  const fulfillmentMode = (input.fulfillmentMode === 'made_to_order' || input.fulfillmentMode === 'ready_to_serve')
    ? input.fulfillmentMode
    : inferFulfillmentMode(prepStation, itemType);
  const serviceArea = input.serviceArea === 'bakery' ? 'bakery' : 'cafe';
  const isAvailable = typeof input.isAvailable === 'boolean'
    ? input.isAvailable
    : typeof input.available === 'boolean'
      ? input.available
      : true;

  return {
    ...(input as MenuItem),
    id,
    name,
    category,
    categoryId,
    categoryName: category,
    basePrice,
    price: basePrice,
    descriptionShort: typeof input.descriptionShort === 'string' ? input.descriptionShort : typeof input.tagline === 'string' ? input.tagline : undefined,
    descriptionLong: typeof input.descriptionLong === 'string' ? input.descriptionLong : typeof input.note === 'string' ? input.note : undefined,
    station,
    prepStation,
    fulfillmentMode,
    itemType,
    serviceArea,
    active: typeof input.active === 'boolean' ? input.active : true,
    isAvailable,
    available: isAvailable,
    variants,
    optionGroupIds: Array.isArray(input.optionGroupIds)
      ? input.optionGroupIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : Array.isArray(input.modifierGroups)
        ? input.modifierGroups
            .map((group) => group?.id)
            .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        : undefined,
    modifierGroups: input.modifierGroups as MenuItem['modifierGroups'],
    components: Array.isArray(input.components)
      ? input.components
          .filter((component): component is NonNullable<MenuItem['components']>[number] => {
            return !!component &&
              typeof component.id === 'string' &&
              component.id.trim().length > 0 &&
              typeof component.name === 'string' &&
              component.name.trim().length > 0 &&
              (component.prepStation === 'kitchen' || component.prepStation === 'barista' || component.prepStation === 'front' || component.prepStation === 'none') &&
              typeof component.required === 'boolean' &&
              typeof component.quantity === 'number' &&
              component.quantity > 0;
          })
      : undefined,
    tags: input.tags as string[] | undefined,
  };
}

export function normalizeRestaurantSettings(input: RestaurantSettings | Record<string, unknown>): RestaurantSettings {
  const settings = input as RestaurantSettings & Record<string, unknown>;
  const legacyContact = settings['contact'] as Record<string, unknown> | undefined;
  const rawContact = (settings.contactInfo || legacyContact || {}) as Record<string, unknown>;
  const contactInfo: RestaurantContactInfo = {
    phone: typeof rawContact.phone === 'string' ? rawContact.phone : undefined,
    whatsapp: typeof rawContact.whatsapp === 'string' ? rawContact.whatsapp : undefined,
    email: typeof rawContact.email === 'string' ? rawContact.email : undefined,
    location: typeof rawContact.location === 'string' ? rawContact.location : undefined,
    mapLink: typeof rawContact.mapLink === 'string' ? rawContact.mapLink : undefined,
    contactPerson: typeof rawContact.contactPerson === 'string' ? rawContact.contactPerson : undefined,
    momoPayCode:
      typeof rawContact.momoPayCode === 'string'
        ? rawContact.momoPayCode
        : typeof rawContact.paybill === 'string'
          ? rawContact.paybill
          : undefined,
    momoMerchantName:
      typeof rawContact.momoMerchantName === 'string'
        ? rawContact.momoMerchantName
        : typeof rawContact.vendor === 'string'
          ? rawContact.vendor
          : undefined,
    hours: typeof rawContact.hours === 'string' ? rawContact.hours : undefined,
  };

  return {
    ...settings,
    description: typeof settings.description === 'string' ? settings.description : undefined,
    active: typeof settings.active === 'boolean' ? settings.active : true,
    contactInfo,
    deliveryOptions: (settings.deliveryOptions || {}) as Record<string, DeliveryInfo>,
    paymentMethods: Array.isArray(settings.paymentMethods) ? (settings.paymentMethods as string[]) : undefined,
    socialLinks: typeof settings.socialLinks === 'object' && settings.socialLinks !== null
      ? (settings.socialLinks as Record<string, string>)
      : undefined,
  };
}

export function normalizeBakeryCategory(input: Partial<BakeryCategory> | null | undefined, context = 'bakery-category'): BakeryCategory | null {
  if (!isRecord(input)) {
    warnInvalidCatalogRecord(context, input, 'record is not an object');
    return null;
  }

  const id = typeof input.id === 'string' && input.id.trim().length > 0 ? input.id.trim() : null;
  const name = typeof input.name === 'string' && input.name.trim().length > 0 ? input.name.trim() : null;
  const slug = typeof input.slug === 'string' && input.slug.trim().length > 0 ? input.slug.trim() : null;

  if (!id || !name || !slug) {
    warnInvalidCatalogRecord(context, input, 'missing id, name, or slug');
    return null;
  }

  return {
    ...(input as BakeryCategory),
    id,
    name,
    slug,
    active: typeof input.active === 'boolean' ? input.active : true,
    ...(typeof input.sortOrder === 'number' ? { sortOrder: input.sortOrder } : {}),
    ...(typeof input.iconName === 'string' ? { iconName: input.iconName } : {}),
    ...(typeof input.description === 'string' ? { description: input.description } : {}),
    ...(input.serviceAreaDefault === 'bakery' || input.serviceAreaDefault === 'cafe'
      ? { serviceAreaDefault: input.serviceAreaDefault }
      : {}),
    ...(input.frontLaneDefault === 'bakery_front' || input.frontLaneDefault === 'cafe_front'
      ? { frontLaneDefault: input.frontLaneDefault }
      : {}),
    ...(input.dispatchModeDefault === 'station_prep' || input.dispatchModeDefault === 'front_only' || input.dispatchModeDefault === 'bakery_front_only' || input.dispatchModeDefault === 'mixed_split'
      ? { dispatchModeDefault: input.dispatchModeDefault }
      : {}),
    ...(typeof input.hiddenFromCustomer === 'boolean' ? { hiddenFromCustomer: input.hiddenFromCustomer } : {}),
    ...(typeof input.deprecated === 'boolean' ? { deprecated: input.deprecated } : {}),
    ...(typeof input.legacySource === 'string' ? { legacySource: input.legacySource } : {}),
  };
}

export function normalizeBakeryItem(input: Partial<BakeryItem> | null | undefined, context = 'bakery-item'): BakeryItem | null {
  if (!isRecord(input)) {
    warnInvalidCatalogRecord(context, input, 'record is not an object');
    return null;
  }

  const id = typeof input.id === 'string' && input.id.trim().length > 0 ? input.id.trim() : null;
  const name = typeof input.name === 'string' && input.name.trim().length > 0 ? input.name.trim() : null;
  const slug = typeof input.slug === 'string' && input.slug.trim().length > 0 ? input.slug.trim() : null;
  const bakeryCategoryId = typeof input.bakeryCategoryId === 'string' && input.bakeryCategoryId.trim().length > 0 ? input.bakeryCategoryId.trim() : null;
  const description = typeof input.description === 'string' && input.description.trim().length > 0 ? input.description.trim() : null;

  if (!id || !name || !slug || !bakeryCategoryId || !description) {
    warnInvalidCatalogRecord(context, input, 'missing required fields');
    return null;
  }

  const price = isFiniteNumber(input.price) && input.price >= 0 ? input.price : null;
  const prepStation = normalizeMenuPrepStation(input.prepStation || 'front');
  const fulfillmentMode = (input.fulfillmentMode === 'made_to_order' || input.fulfillmentMode === 'ready_to_serve')
    ? input.fulfillmentMode
    : prepStation === 'kitchen' || prepStation === 'barista'
      ? 'made_to_order'
      : 'ready_to_serve';
  const itemType = (
    input.itemType === 'bread' ||
    input.itemType === 'whole_cake' ||
    input.itemType === 'slice' ||
    input.itemType === 'pastry' ||
    input.itemType === 'simple' ||
    input.itemType === 'variant' ||
    input.itemType === 'configurable' ||
    input.itemType === 'composite'
  )
    ? input.itemType
    : (input.variants?.length ? 'variant' : input.modifierGroups?.length ? 'configurable' : 'simple');
  const serviceArea = input.serviceArea === 'cafe' ? 'cafe' : 'bakery';

  return {
    ...(input as BakeryItem),
    id,
    name,
    slug,
    bakeryCategoryId,
    description,
    price,
    prepStation,
    fulfillmentMode,
    itemType,
    serviceArea,
    active: typeof input.active === 'boolean' ? input.active : true,
    ...(typeof input.sortOrder === 'number' ? { sortOrder: input.sortOrder } : {}),
    ...(typeof input.imageUrl === 'string' ? { imageUrl: input.imageUrl } : {}),
    ...(typeof input.bakeryCategoryName === 'string' ? { bakeryCategoryName: input.bakeryCategoryName } : {}),
    ...(typeof input.hiddenFromCustomer === 'boolean' ? { hiddenFromCustomer: input.hiddenFromCustomer } : {}),
    ...(typeof input.deprecated === 'boolean' ? { deprecated: input.deprecated } : {}),
    ...(typeof input.legacySource === 'string' ? { legacySource: input.legacySource } : {}),
    ...(Array.isArray(input.variants) ? { variants: input.variants } : {}),
    ...(Array.isArray(input.modifierGroups) ? { modifierGroups: input.modifierGroups } : {}),
    ...(typeof input.sku === 'string' && input.sku.trim().length > 0 ? { sku: input.sku.trim() } : {}),
  };
}

export function adaptBakeryItemToMenuItem(item: BakeryItem, category?: BakeryCategory): MenuItem {
  const station = mapMenuPrepStationToLegacyStation(item.prepStation);
  const menuItemType: MenuItemType =
    item.itemType === 'simple' || item.itemType === 'variant' || item.itemType === 'configurable' || item.itemType === 'composite'
      ? item.itemType
      : item.variants?.length
        ? 'variant'
        : item.modifierGroups?.length
          ? 'configurable'
          : 'simple';

  return {
    id: item.id,
    name: item.name,
    description: item.description,
    descriptionShort: item.description,
    category: category?.name || item.bakeryCategoryName || 'Bakery',
    categoryId: item.bakeryCategoryId,
    categoryName: category?.name || item.bakeryCategoryName || 'Bakery',
    basePrice: item.price,
    price: item.price,
    active: item.active,
    isAvailable: item.active,
    available: item.active,
    station,
    prepStation: item.prepStation,
    fulfillmentMode: item.fulfillmentMode,
    itemType: menuItemType,
    serviceArea: 'bakery',
    imageUrl: item.imageUrl,
    sortOrder: item.sortOrder,
    averageRating: item.averageRating,
    ratingCount: item.ratingCount,
    reviews: item.reviews,
    ...(item.variants ? { variants: item.variants } : {}),
    ...(item.modifierGroups ? { modifierGroups: item.modifierGroups } : {}),
  };
}

export function getRestaurantContactInfo(settings: RestaurantSettings | null | undefined): RestaurantContactInfo {
  return settings?.contactInfo || {};
}

export function getDeliveryOptions(settings: RestaurantSettings | null | undefined, fallback: Record<string, DeliveryInfo>): Record<string, DeliveryInfo> {
  if (!settings?.deliveryOptions || Object.keys(settings.deliveryOptions).length === 0) {
    return fallback;
  }

  return settings.deliveryOptions;
}

export function getWhatsAppHref(phoneNumber?: string, message?: string): string | null {
  if (!phoneNumber) return null;

  const normalizedPhone = phoneNumber.replace(/[^\d]/g, '');
  if (!normalizedPhone) return null;

  return message
    ? `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/${normalizedPhone}`;
}

export function getPhoneHref(phoneNumber?: string): string | null {
  if (!phoneNumber) return null;
  return `tel:${phoneNumber}`;
}

export function getMomoDialHref(payCode?: string): string | null {
  if (!payCode) return null;

  const normalizedPayCode = payCode.replace(/[^\d]/g, '');
  if (!normalizedPayCode) return null;

  return `tel:*182*8*1*${normalizedPayCode}%23`;
}

export function summarizeSelectedModifiers(selectedModifiers: SelectedModifier[] = []): string[] {
  return selectedModifiers.flatMap((group) => group.optionNames);
}

export function getSelectedVariantPrice(item: Partial<MenuItem> | null | undefined, customization?: ItemCustomization): number {
  if (customization?.selectedVariantPrice) return customization.selectedVariantPrice;
  return getDefaultVariant(item)?.price || getMenuItemBasePrice(item) || 0;
}
