/**
 * menuNormalizer.ts
 * Maps ParsedMenu from menuParser into canonical MenuCategory + MenuItem objects.
 *
 * Design decisions:
 * - Option groups are defined here and embedded as modifierGroups in each item (same
 *   pattern as the existing seed flow — groups stay in code, not Firestore).
 * - Category station is a routing hint only; item-level prepStation is authoritative.
 * - Composite breakfast items carry components[] so multi-station routing works.
 * - Items whose rawName starts with "KUCHI" are normalised to "KUCI" (typo in source).
 */

import {
  CompositeMenuItemComponent,
  FulfillmentMode,
  MenuCategory,
  MenuItem,
  MenuItemType,
  MenuPrepStation,
  ModifierGroup,
  OptionGroupRegistryEntry,
  StationType,
} from '../types';
import { optionGroupsRegistry } from './seedData';
import { ParsedItem, ParsedMenu, ParsedSection, slugify } from './menuParser';

// ---------------------------------------------------------------------------
// Canonical option groups for this import
// (extends the existing registry with groups the normalizer needs)
// ---------------------------------------------------------------------------

const IMPORT_OPTION_GROUPS: Record<string, OptionGroupRegistryEntry> = {
  ...optionGroupsRegistry,

  pizza_meat: {
    id: 'pizza_meat',
    name: 'Choose your meat',
    required: true,
    multiSelect: false,
    options: [
      { id: 'pepperoni', name: 'Pepperoni', priceDelta: 0 },
      { id: 'chicken', name: 'Chicken', priceDelta: 0 },
      { id: 'sausage', name: 'Sausage', priceDelta: 0 },
      { id: 'fish', name: 'Fish', priceDelta: 0 },
      { id: 'ham', name: 'Ham', priceDelta: 0 },
    ],
  },

  light_breakfast_drink: {
    id: 'light_breakfast_drink',
    name: 'Choose your drink',
    required: true,
    multiSelect: false,
    options: [
      { id: 'house-juice', name: 'House Juice', priceDelta: 0, prepStation: 'barista' },
      { id: 'black-coffee', name: 'Black Coffee', priceDelta: 0, prepStation: 'barista' },
    ],
  },

  chicken_beef_choice: {
    id: 'chicken_beef_choice',
    name: 'Choose your protein',
    required: true,
    multiSelect: false,
    options: [
      { id: 'chicken', name: 'Chicken', priceDelta: 0 },
      { id: 'beef', name: 'Beef', priceDelta: 0 },
    ],
  },
};

function toModifierGroup(entry: OptionGroupRegistryEntry): ModifierGroup {
  const isAccompanimentPair = entry.id === 'accompaniments_2';
  return {
    id: entry.id,
    name: entry.name,
    selectionType: entry.multiSelect ? 'multiple' : 'single',
    required: entry.required,
    minSelections: isAccompanimentPair ? 2 : entry.required ? 1 : undefined,
    maxSelections: isAccompanimentPair ? 2 : entry.multiSelect ? undefined : 1,
    options: entry.options.map((o) => ({
      id: o.id,
      name: o.name,
      priceDelta: o.priceDelta,
      active: true,
      prepStation: o.prepStation,
      station: o.prepStation === 'barista'
        ? 'barista' as StationType
        : o.prepStation === 'kitchen'
          ? 'kitchen' as StationType
          : undefined,
    })),
  };
}

function getModifierGroups(ids: string[]): ModifierGroup[] {
  return ids
    .map((id) => IMPORT_OPTION_GROUPS[id])
    .filter((entry): entry is OptionGroupRegistryEntry => !!entry)
    .map(toModifierGroup);
}

// ---------------------------------------------------------------------------
// Category definitions
// ---------------------------------------------------------------------------

interface CategoryDef {
  id: string;
  name: string;
  sortOrder: number;
  station: StationType;
  iconName?: string;
  categoryGroup?: 'main' | 'bakery';
  subcategories?: MenuCategory['subcategories'];
  defaultFulfillmentMode?: FulfillmentMode;
}

// Order matters: more-specific title fragments must come before general ones.
// e.g. "iced espresso" before "coffee", "fresh juice" before "juice".
const SECTION_CATEGORY_MAP: Array<{ fragment: string; def: CategoryDef }> = [
  { fragment: 'signature meal',  def: { id: 'signature-meals', name: 'Signature Meals',  sortOrder: 10,  station: 'kitchen',       iconName: 'Utensils', categoryGroup: 'main' } },
  { fragment: 'omelette',        def: { id: 'omelettes',       name: 'Omelettes',        sortOrder: 20,  station: 'kitchen',       iconName: 'Egg', categoryGroup: 'main' } },
  { fragment: 'salad',           def: { id: 'salads',          name: 'Salads',            sortOrder: 30,  station: 'kitchen',       iconName: 'Leaf', categoryGroup: 'main' } },
  { fragment: 'dessert',         def: { id: 'desserts',        name: 'Desserts',          sortOrder: 40,  station: 'kitchen',       iconName: 'IceCream', categoryGroup: 'main' } },
  { fragment: 'burger',          def: { id: 'burgers',         name: 'Burgers',           sortOrder: 50,  station: 'kitchen',       iconName: 'Beef', categoryGroup: 'main' } },
  { fragment: 'soup',            def: { id: 'soups',           name: 'Soups',             sortOrder: 60,  station: 'kitchen',       iconName: 'UtensilsCrossed', categoryGroup: 'main' } },
  { fragment: 'sandwich',        def: { id: 'sandwiches',      name: 'Sandwiches',        sortOrder: 70,  station: 'kitchen',       iconName: 'Sandwich', categoryGroup: 'main' } },
  { fragment: 'bite',            def: { id: 'bites',           name: 'Bites & Snacks',    sortOrder: 80,  station: 'kitchen',       iconName: 'Zap', categoryGroup: 'main' } },
  { fragment: 'pasta',           def: { id: 'pasta',           name: 'Pasta',             sortOrder: 90,  station: 'kitchen',       iconName: 'ChefHat', categoryGroup: 'main' } },
  { fragment: 'sizzling',        def: { id: 'sizzling',        name: 'Sizzling',          sortOrder: 100, station: 'kitchen',       iconName: 'Flame', categoryGroup: 'main' } },
  { fragment: 'toast',           def: { id: 'toast',           name: 'Toast',             sortOrder: 110, station: 'kitchen',       iconName: 'Bread', categoryGroup: 'main' } },
  { fragment: 'pizza',           def: { id: 'pizza',           name: 'Pizza',             sortOrder: 120, station: 'kitchen',       iconName: 'Pizza', categoryGroup: 'main' } },
  { fragment: 'fresh juice',     def: { id: 'fresh-juice',     name: 'Fresh Juice',       sortOrder: 130, station: 'barista',       iconName: 'Cherry', categoryGroup: 'main' } },
  { fragment: 'cocktail',        def: { id: 'cocktails',       name: 'Cocktails',         sortOrder: 140, station: 'barista',       iconName: 'GlassWater', categoryGroup: 'main' } },
  { fragment: 'wine',            def: { id: 'wines-spirits',   name: 'Wines & Spirits',   sortOrder: 150, station: 'front_service', iconName: 'Wine', categoryGroup: 'main', defaultFulfillmentMode: 'ready_to_serve' } },
  { fragment: 'smoothie',        def: { id: 'smoothies',       name: 'Smoothies',         sortOrder: 170, station: 'barista',       iconName: 'GlassWater', categoryGroup: 'main' } },
  { fragment: 'frappe',          def: { id: 'frappe',          name: 'Frappé',            sortOrder: 180, station: 'barista',       iconName: 'Coffee', categoryGroup: 'main' } },
  { fragment: 'milk shake',      def: { id: 'milkshakes',      name: 'Milkshakes',        sortOrder: 190, station: 'barista',       iconName: 'Milk', categoryGroup: 'main' } },
  { fragment: 'iced espresso',   def: { id: 'iced-coffee',     name: 'Iced Coffee',       sortOrder: 220, station: 'barista',       iconName: 'Coffee', categoryGroup: 'main' } },
  { fragment: 'tea',             def: { id: 'teas',            name: 'Teas',              sortOrder: 200, station: 'barista',       iconName: 'Coffee', categoryGroup: 'main' } },
  { fragment: 'coffee',          def: { id: 'coffee',          name: 'Coffee',            sortOrder: 210, station: 'barista',       iconName: 'Coffee', categoryGroup: 'main' } },
  { fragment: 'breakfast',       def: { id: 'breakfast',       name: 'Breakfast',         sortOrder: 230, station: 'kitchen',       iconName: 'Sunrise', categoryGroup: 'main' } },
  // Plain BEVERAGES section (soda/water only)
  { fragment: 'beverage',        def: { id: 'beverages',       name: 'Beverages',         sortOrder: 160, station: 'front_service', iconName: 'GlassWater', categoryGroup: 'main', defaultFulfillmentMode: 'ready_to_serve' } },
];

const ITEM_CATEGORY_OVERRIDES: Record<string, CategoryDef> = {
  'fruit salad': {
    id: 'fresh-fruits',
    name: 'Fresh Fruits',
    sortOrder: 135,
    station: 'barista',
    iconName: 'Cherry',
    categoryGroup: 'main',
  },
  'fruit platter': {
    id: 'fresh-fruits',
    name: 'Fresh Fruits',
    sortOrder: 135,
    station: 'barista',
    iconName: 'Cherry',
    categoryGroup: 'main',
  },
};

function resolveCategoryDef(section: ParsedSection): CategoryDef | null {
  const lower = section.rawTitle.toLowerCase();
  for (const { fragment, def } of SECTION_CATEGORY_MAP) {
    if (lower.includes(fragment)) return def;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Item name normalisation
// ---------------------------------------------------------------------------

function normaliseItemName(rawName: string): string {
  // Source doc typo: "KUCHI BREAKFAST" should be "KUCI BREAKFAST"
  return rawName.startsWith('KUCHI ') ? 'KUCI ' + rawName.slice(6) : rawName;
}

function makeItemId(name: string, categoryId: string, seenIds: Set<string>): string {
  const base = slugify(name);
  if (!seenIds.has(base)) { seenIds.add(base); return base; }
  // Disambiguate with category suffix
  const candidate = `${base}-${slugify(categoryId)}`;
  seenIds.add(candidate);
  return candidate;
}

// ---------------------------------------------------------------------------
// Option group assignment by item name / category
// ---------------------------------------------------------------------------

interface ItemModConfig {
  optionGroupIds: string[];
  itemType?: MenuItemType;
}

function resolveItemMods(name: string, categoryId: string): ItemModConfig {
  const lower = name.toLowerCase();

  // MAKE YOUR OWN PIZZA
  if (lower === 'make your own pizza') {
    return {
      optionGroupIds: ['pizza_crust', 'pizza_sauce', 'pizza_cheese', 'pizza_meat', 'pizza_toppings'],
      itemType: 'configurable',
    };
  }

  // All Signature Meals get accompaniments; KUCI CLASSIC also gets protein choice
  if (categoryId === 'signature-meals') {
    const ids = lower === 'kuci classic'
      ? ['protein_selection', 'accompaniments_2']
      : ['accompaniments_2'];
    return { optionGroupIds: ids, itemType: 'configurable' };
  }

  // TACOS — protein choice
  if (lower === 'tacos') {
    return { optionGroupIds: ['protein_selection'], itemType: 'configurable' };
  }

  // BOILO — chicken or beef
  if (lower.startsWith('boilo')) {
    return { optionGroupIds: ['chicken_beef_choice'], itemType: 'configurable' };
  }

  // AGATOGO — chicken, beef, or fish
  if (lower.startsWith('agatogo')) {
    return { optionGroupIds: ['protein_selection'], itemType: 'configurable' };
  }

  return { optionGroupIds: [] };
}

// ---------------------------------------------------------------------------
// Composite breakfast component definitions
// ---------------------------------------------------------------------------

function buildBreakfastComponents(name: string): CompositeMenuItemComponent[] | null {
  const lower = name.toLowerCase();

  if (lower === 'light breakfast') {
    return [
      { id: 'eggs-bread', name: 'Scrambled Eggs & Bread', prepStation: 'kitchen', required: true, quantity: 1 },
      { id: 'drink', name: 'Drink', prepStation: 'barista', required: true, quantity: 1, optionGroupId: 'light_breakfast_drink' },
    ];
  }

  if (lower === 'continental breakfast') {
    return [
      { id: 'omelette', name: 'Omelette', prepStation: 'kitchen', required: true, quantity: 1, optionGroupId: 'omelette_style' },
      { id: 'fruits', name: 'Seasonal Fruits', prepStation: 'front', required: true, quantity: 1 },
      { id: 'drink', name: 'Tea or Coffee', prepStation: 'barista', required: true, quantity: 1, optionGroupId: 'breakfast_drink_choice' },
    ];
  }

  if (lower === 'kuci breakfast') {
    return [
      { id: 'omelette', name: 'Omelette', prepStation: 'kitchen', required: true, quantity: 1, optionGroupId: 'omelette_style' },
      { id: 'chicken-wing', name: 'Chicken Wing', prepStation: 'kitchen', required: true, quantity: 1 },
      { id: 'potato-cakes', name: 'Vegetable Potato Cakes', prepStation: 'kitchen', required: true, quantity: 1 },
      { id: 'fruits', name: 'Fresh Fruits', prepStation: 'front', required: true, quantity: 1 },
      { id: 'drink', name: 'Tea', prepStation: 'barista', required: true, quantity: 1, optionGroupId: 'breakfast_drink_choice' },
    ];
  }

  if (lower === 'full breakfast') {
    return [
      { id: 'main', name: 'Beef or Chapati + Omelette + Potato Cakes + Beef Strips + Vegetables', prepStation: 'kitchen', required: true, quantity: 1 },
      { id: 'proteins', name: 'Chicken Wings or Fish Fingers', prepStation: 'kitchen', required: true, quantity: 1 },
      { id: 'soup', name: 'Soup (Vegetable or Mushroom)', prepStation: 'kitchen', required: true, quantity: 1 },
      { id: 'fruits-juice', name: 'Fresh Fruits & House Juice', prepStation: 'front', required: true, quantity: 1 },
      { id: 'drink', name: 'Tea or Coffee', prepStation: 'barista', required: true, quantity: 1, optionGroupId: 'breakfast_drink_choice' },
    ];
  }

  return null;
}

// ---------------------------------------------------------------------------
// Per-item prep station resolution
// ---------------------------------------------------------------------------

function resolvePrepStation(categoryId: string, categoryDef: CategoryDef): MenuPrepStation {
  if (categoryDef.station === 'kitchen') return 'kitchen';
  if (categoryDef.station === 'barista') return 'barista';
  if (categoryDef.station === 'front_service') return 'front';
  return 'none';
}

function resolveStationType(prepStation: MenuPrepStation): StationType {
  if (prepStation === 'kitchen') return 'kitchen';
  if (prepStation === 'barista') return 'barista';
  return 'front_service';
}

function resolveFulfillmentMode(prepStation: MenuPrepStation, itemType: MenuItemType, categoryDef: CategoryDef): FulfillmentMode {
  if (categoryDef.defaultFulfillmentMode) return categoryDef.defaultFulfillmentMode;
  if (itemType === 'composite') return 'made_to_order';
  if (prepStation === 'kitchen' || prepStation === 'barista') return 'made_to_order';
  return 'ready_to_serve';
}

// ---------------------------------------------------------------------------
// Public normalised output shape
// ---------------------------------------------------------------------------

export interface NormalizedMenu {
  categories: MenuCategory[];
  items: MenuItem[];
  /** Option group IDs that are referenced by imported items */
  referencedOptionGroupIds: string[];
  ambiguities: string[];
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function normalizeMenuSource(parsed: ParsedMenu): NormalizedMenu {
  const categoriesMap = new Map<string, MenuCategory>();
  const items: MenuItem[] = [];
  const allAmbiguities = [...parsed.ambiguities];
  const seenItemIds = new Set<string>();
  const referencedGroupIds = new Set<string>();
  const ensureCategory = (def: CategoryDef) => {
    if (categoriesMap.has(def.id)) return;
    categoriesMap.set(def.id, {
      id: def.id,
      name: def.name,
      slug: def.id,
      sortOrder: def.sortOrder,
      active: true,
      iconName: def.iconName,
      station: def.station,
      categoryGroup: def.categoryGroup || 'main',
      ...(def.subcategories ? { subcategories: def.subcategories } : {}),
    });
  };

  for (const section of parsed.sections) {
    const def = resolveCategoryDef(section);

    if (!def) {
      allAmbiguities.push(`Section "${section.rawTitle}" (${section.sectionKey}) has no category mapping — skipped`);
      continue;
    }

    ensureCategory(def);

    for (const parsedItem of section.items) {
      const normalizedName = normaliseItemName(parsedItem.rawName).toLowerCase();
      const itemCategoryDef = ITEM_CATEGORY_OVERRIDES[normalizedName] || def;
      ensureCategory(itemCategoryDef);

      const normalised = normalizeItem(parsedItem, itemCategoryDef, section, seenItemIds, allAmbiguities);
      if (!normalised) continue;

      items.push(normalised);

      for (const gid of normalised.optionGroupIds ?? []) {
        referencedGroupIds.add(gid);
      }
    }
  }

  return {
    categories: Array.from(categoriesMap.values()).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    items: items.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    referencedOptionGroupIds: Array.from(referencedGroupIds),
    ambiguities: allAmbiguities,
  };
}

function normalizeItem(
  parsed: ParsedItem,
  def: CategoryDef,
  section: ParsedSection,
  seenIds: Set<string>,
  ambiguities: string[]
): MenuItem | null {
  const rawName = normaliseItemName(parsed.rawName);
  if (!rawName.trim()) return null;

  const id = makeItemId(rawName, def.id, seenIds);
  const { optionGroupIds, itemType: forcedType } = resolveItemMods(rawName, def.id);

  // Resolve item type
  let itemType: MenuItemType;
  if (forcedType) {
    itemType = forcedType;
  } else if ((parsed.priceVariants?.length ?? 0) > 0) {
    itemType = 'variant';
  } else if (optionGroupIds.length > 0) {
    itemType = 'configurable';
  } else {
    itemType = 'simple';
  }

  // Composite detection for breakfast items
  const components = def.id === 'breakfast' ? buildBreakfastComponents(rawName) : null;
  if (components) {
    itemType = 'composite';
  }

  // Composite items span multiple stations; use 'none' at the top level.
  const prepStation: MenuPrepStation = components ? 'none' : resolvePrepStation(def.id, def);
  const station: StationType = components ? 'kitchen' : resolveStationType(prepStation);
  const fulfillmentMode = resolveFulfillmentMode(prepStation, itemType, def);

  const basePrice = parsed.price;

  const variants = parsed.priceVariants?.map((v, i) => ({
    id: `${id}-${slugify(v.name)}`,
    name: v.name,
    price: v.price,
    active: true,
    isDefault: i === 0,
  }));

  const modifierGroupDefs = optionGroupIds.length > 0 ? getModifierGroups(optionGroupIds) : undefined;

  // For composite items, also expose their drink group
  const compositeOptionGroupIds = components
    ? [
        ...(rawName.toLowerCase() === 'light breakfast' ? ['light_breakfast_drink'] : []),
        ...(rawName.toLowerCase() === 'continental breakfast' ? ['omelette_style', 'breakfast_drink_choice'] : []),
        ...(rawName.toLowerCase() === 'kuci breakfast' ? ['omelette_style', 'breakfast_drink_choice'] : []),
        ...(rawName.toLowerCase() === 'full breakfast' ? ['breakfast_drink_choice'] : []),
      ]
    : optionGroupIds;

  const finalOptionGroupIds = compositeOptionGroupIds.length > 0 ? compositeOptionGroupIds : undefined;
  const finalModifierGroups = finalOptionGroupIds ? getModifierGroups(finalOptionGroupIds) : modifierGroupDefs;

  if (basePrice === null && (parsed.priceVariants?.length ?? 0) === 0) {
    ambiguities.push(`[${section.sectionKey}] "${rawName}" has no price — imported with null basePrice`);
  }

  const item: MenuItem = {
    id,
    name: rawName,
    description: parsed.description ?? parsed.tagline ?? rawName,
    descriptionShort: parsed.tagline,
    descriptionLong: parsed.description,
    category: def.name,
    categoryId: def.id,
    categoryName: def.name,
    basePrice,
    price: basePrice,
    tagline: parsed.tagline,
    active: true,
    isAvailable: true,
    available: true,
    station,
    prepStation,
    fulfillmentMode,
    itemType,
    sortOrder: undefined,
    featured: false,
    ...(variants ? { variants } : {}),
    ...(finalOptionGroupIds ? { optionGroupIds: finalOptionGroupIds } : {}),
    ...(finalModifierGroups ? { modifierGroups: finalModifierGroups } : {}),
    ...(components ? { components } : {}),
  };

  return item;
}

/**
 * Returns the full option group registry entries for all referenced groups.
 * Useful for import verification and future Firestore option group storage.
 */
export function getReferencedOptionGroups(ids: string[]): OptionGroupRegistryEntry[] {
  return ids
    .map((id) => IMPORT_OPTION_GROUPS[id])
    .filter((entry): entry is OptionGroupRegistryEntry => !!entry);
}
