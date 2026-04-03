import type { Category, MenuItem } from '../types';

export interface CanonicalCustomerCategory {
  key: string;
  name: string;
  slug: string;
  sortOrder: number;
  iconName?: string;
}

const CANONICAL_CATEGORIES: CanonicalCustomerCategory[] = [
  { key: 'signature-meals', name: 'Signature Meals', slug: 'signature-meals', sortOrder: 10, iconName: 'Utensils' },
  { key: 'breakfast', name: 'Breakfast', slug: 'breakfast', sortOrder: 20, iconName: 'Coffee' },
  { key: 'omelettes', name: 'Omelettes', slug: 'omelettes', sortOrder: 30, iconName: 'Egg' },
  { key: 'salads', name: 'Salads', slug: 'salads', sortOrder: 40, iconName: 'Salad' },
  { key: 'desserts', name: 'Desserts', slug: 'desserts', sortOrder: 50, iconName: 'IceCream' },
  { key: 'burgers', name: 'Burgers', slug: 'burgers', sortOrder: 60, iconName: 'Beef' },
  { key: 'soups', name: 'Soups', slug: 'soups', sortOrder: 70, iconName: 'Utensils' },
  { key: 'sandwiches', name: 'Sandwiches', slug: 'sandwiches', sortOrder: 80, iconName: 'Sandwich' },
  { key: 'bites', name: 'Bites', slug: 'bites', sortOrder: 90, iconName: 'Flame' },
  { key: 'pasta', name: 'Pasta', slug: 'pasta', sortOrder: 100, iconName: 'Utensils' },
  { key: 'sizzling', name: 'Sizzling', slug: 'sizzling', sortOrder: 110, iconName: 'Flame' },
  { key: 'toast', name: 'Toast', slug: 'toast', sortOrder: 120, iconName: 'Sandwich' },
  { key: 'pizza', name: 'Pizza', slug: 'pizza', sortOrder: 130, iconName: 'Pizza' },
  { key: 'fresh-juice', name: 'Fresh Juice', slug: 'fresh-juice', sortOrder: 140, iconName: 'Cherry' },
  { key: 'smoothies', name: 'Smoothies', slug: 'smoothies', sortOrder: 150, iconName: 'Milk' },
  { key: 'frappe', name: 'Frappe', slug: 'frappe', sortOrder: 160, iconName: 'Coffee' },
  { key: 'milkshakes', name: 'Milkshakes', slug: 'milkshakes', sortOrder: 170, iconName: 'Milk' },
  { key: 'teas', name: 'Tea', slug: 'teas', sortOrder: 180, iconName: 'Coffee' },
  { key: 'coffee-espresso', name: 'Coffee & Espresso', slug: 'coffee-espresso', sortOrder: 190, iconName: 'Coffee' },
  { key: 'iced-coffee', name: 'Iced Coffee', slug: 'iced-coffee', sortOrder: 200, iconName: 'Coffee' },
  { key: 'cocktails-wines', name: 'Cocktails & Wines', slug: 'cocktails-wines', sortOrder: 210, iconName: 'Wine' },
  { key: 'beverages', name: 'Beverages', slug: 'beverages', sortOrder: 220, iconName: 'GlassWater' },
];

const CANONICAL_BY_KEY = new Map(CANONICAL_CATEGORIES.map((category) => [category.key, category]));

function normalizeToken(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const CATEGORY_ALIASES: Record<string, string> = {
  'signature-meals': 'signature-meals',
  'kuci-signature-meals': 'signature-meals',
  'breakfast': 'breakfast',
  'kuci-breakfast': 'breakfast',
  'omelettes': 'omelettes',
  'omelette': 'omelettes',
  'salads': 'salads',
  'salad': 'salads',
  'desserts': 'desserts',
  'dessert': 'desserts',
  'burgers': 'burgers',
  'burger': 'burgers',
  'soups': 'soups',
  'soup': 'soups',
  'sandwiches': 'sandwiches',
  'sandwich': 'sandwiches',
  'bites': 'bites',
  'bites-and-snacks': 'bites',
  'kuci-bites': 'bites',
  'pasta': 'pasta',
  'kuci-pasta': 'pasta',
  'sizzling': 'sizzling',
  'toast': 'toast',
  'pizza': 'pizza',
  'fresh-juice': 'fresh-juice',
  'kuci-fresh-juice': 'fresh-juice',
  'smoothies': 'smoothies',
  'frappe': 'frappe',
  'milk-shake': 'milkshakes',
  'milkshake': 'milkshakes',
  'milkshakes': 'milkshakes',
  'tea': 'teas',
  'teas': 'teas',
  'kuci-teas': 'teas',
  'coffee': 'coffee-espresso',
  'coffee-espresso': 'coffee-espresso',
  'coffee-and-espresso': 'coffee-espresso',
  'iced-coffee': 'iced-coffee',
  'iced-espresso-and-coffee': 'iced-coffee',
  'iced-espresso-coffee': 'iced-coffee',
  'cocktails': 'cocktails-wines',
  'wines': 'cocktails-wines',
  'wines-spirits': 'cocktails-wines',
  'cocktails-wines': 'cocktails-wines',
  'cafe-signature-cocktails': 'cocktails-wines',
  'caf-signature-cocktails': 'cocktails-wines',
  'beverages': 'beverages',
};

const ITEM_ID_OVERRIDES: Record<string, string> = {
  affogato: 'coffee-espresso',
  afogato: 'iced-coffee',
};

function resolveCanonicalKeyFromValues(values: Array<unknown>): string | null {
  for (const rawValue of values) {
    const token = normalizeToken(rawValue);
    if (!token) continue;
    const direct = CATEGORY_ALIASES[token];
    if (direct) return direct;
  }
  return null;
}

function resolveItemCanonicalKey(item: MenuItem): string | null {
  const byItemId = ITEM_ID_OVERRIDES[item.id];
  if (byItemId) return byItemId;
  return resolveCanonicalKeyFromValues([item.categoryId, item.categoryName, item.category]);
}

function resolveCategoryCanonicalKey(category: Category): string | null {
  return resolveCanonicalKeyFromValues([category.id, category.slug, category.name]);
}

export function applyCanonicalCustomerCategoryMapping(
  categories: Category[],
  items: MenuItem[],
): { categories: Category[]; items: MenuItem[] } {
  const overrideCategoryByCanonical = new Map<string, Category>();
  categories.forEach((category) => {
    const canonicalKey = resolveCategoryCanonicalKey(category);
    if (canonicalKey) {
      overrideCategoryByCanonical.set(canonicalKey, category);
    }
  });

  const mappedItems = items.map((item) => {
    const canonicalKey = resolveItemCanonicalKey(item);
    if (!canonicalKey) return item;
    const canonical = CANONICAL_BY_KEY.get(canonicalKey);
    if (!canonical) return item;
    return {
      ...item,
      categoryId: canonical.key,
      categoryName: canonical.name,
      category: canonical.name,
    };
  });

  const mappedCategorySet = new Set<string>();
  const unresolvedCategoryIds = new Set<string>();
  mappedItems.forEach((item) => {
    const canonicalKey = resolveItemCanonicalKey(item);
    if (canonicalKey) {
      mappedCategorySet.add(canonicalKey);
      return;
    }
    if (item.categoryId) unresolvedCategoryIds.add(item.categoryId);
  });

  const canonicalCategories: Category[] = CANONICAL_CATEGORIES
    .filter((canonical) => mappedCategorySet.has(canonical.key))
    .map((canonical) => {
      const override = overrideCategoryByCanonical.get(canonical.key);
      return {
        id: canonical.key,
        slug: canonical.slug,
        name: override?.name || canonical.name,
        iconName: override?.iconName || canonical.iconName,
        description: override?.description,
        active: override?.active ?? true,
        hiddenFromCustomer: override?.hiddenFromCustomer ?? false,
        sortOrder: override?.sortOrder ?? canonical.sortOrder,
        station: override?.station,
        categoryGroup: 'main' as const,
      };
    })
    .filter((category) => category.active !== false && category.hiddenFromCustomer !== true)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  const fallbackCategories: Category[] = categories
    .filter((category) => unresolvedCategoryIds.has(category.id))
    .map((category) => ({
      ...category,
      categoryGroup: 'main' as const,
    }))
    .filter((category) => category.active !== false && category.hiddenFromCustomer !== true);

  const mappedCategories: Category[] = [...canonicalCategories, ...fallbackCategories].sort(
    (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)
  );

  if (import.meta.env.DEV) {
    const counts = mappedCategories.map((category) => ({
      key: category.id,
      name: category.name,
      count: mappedItems.filter((item) => item.categoryId === category.id).length,
    }));
    console.debug('[menu-canonical] final customer categories', counts);
    console.debug('[menu-canonical] coffee-espresso items', mappedItems.filter((item) => item.categoryId === 'coffee-espresso').map((item) => item.name));
    console.debug('[menu-canonical] iced-coffee items', mappedItems.filter((item) => item.categoryId === 'iced-coffee').map((item) => item.name));
    console.debug('[menu-canonical] bites items', mappedItems.filter((item) => item.categoryId === 'bites').map((item) => item.name));
  }

  return {
    categories: mappedCategories,
    items: mappedItems,
  };
}
