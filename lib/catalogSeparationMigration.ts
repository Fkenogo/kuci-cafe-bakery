import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import type { MenuItem } from '../types';
import { normalizeMenuItem } from './catalog';
import { db } from './firebase';
import { sanitizeForFirestoreWrite } from './firestoreSeedSanitizer';

export const LEGACY_BAKERY_CATEGORY_IDS = ['breads', 'cakes', 'pastries-snacks', 'breakfast-light-bites'] as const;
export const LEGACY_BAKERY_MENU_ITEM_IDS = ['banana-cake-slice'] as const;
const BAKERY_ITEMS_TO_MOVE_TO_MENU = ['omelette', 'toast', 'bakery-omelette', 'bakery-toast'] as const;
const BAKERY_ALIAS_IDS_TO_DEPRECATE = ['bakery-pancake', 'bakery-sausage-roll', 'bakery-vegetable-samosa', 'bakery-chapati'] as const;

export interface CatalogSeparationMigrationResult {
  deactivatedLegacyCategories: number;
  deactivatedLegacyMenuItems: number;
  reactivatedBakeryBreakfastCategory: boolean;
  deactivatedBakeryItemsMovedToMenu: number;
  upsertedMenuItemsFromBakery: number;
  deactivatedLegacyBakeryAliasItems: number;
  errors: string[];
}

const LEGACY_MARKERS = {
  hiddenFromCustomer: true,
  deprecated: true,
} as const;

const MENU_FROM_BAKERY_TEMPLATES: Array<Partial<MenuItem> & { id: string }> = [
  {
    id: 'omelette',
    name: 'OMELETTE',
    description: 'Freshly prepared omelette from the live kitchen line.',
    category: 'Breakfast',
    categoryId: 'breakfast',
    categoryName: 'Breakfast',
    basePrice: 3500,
    station: 'kitchen',
    prepStation: 'kitchen',
    fulfillmentMode: 'made_to_order',
    itemType: 'configurable',
    descriptionShort: 'Kitchen-made omelette',
    sortOrder: 2,
    tags: ['breakfast', 'egg'],
    optionGroupIds: ['omelette_style'],
  },
  {
    id: 'toast',
    name: 'TOAST',
    description: 'Fresh hot toast prepared to order in the kitchen.',
    category: 'Breakfast',
    categoryId: 'breakfast',
    categoryName: 'Breakfast',
    basePrice: 2500,
    station: 'kitchen',
    prepStation: 'kitchen',
    fulfillmentMode: 'made_to_order',
    itemType: 'simple',
    descriptionShort: 'Kitchen toast made to order',
    sortOrder: 3,
    tags: ['breakfast', 'toast'],
  },
];

async function deactivateCategoryDocs(ids: readonly string[]): Promise<{ updated: number; errors: string[] }> {
  let updated = 0;
  const errors: string[] = [];

  for (const id of ids) {
    try {
      await setDoc(
        doc(db, 'categories', id),
        {
          active: false,
          ...LEGACY_MARKERS,
          legacySource: 'old_menu_bakery',
        },
        { merge: true }
      );
      updated += 1;
    } catch (error) {
      errors.push(`categories/${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { updated, errors };
}

async function deactivateMenuDocsByIds(ids: readonly string[]): Promise<{ updated: number; errors: string[] }> {
  let updated = 0;
  const errors: string[] = [];

  for (const id of ids) {
    try {
      await setDoc(
        doc(db, 'menu', id),
        {
          active: false,
          isAvailable: false,
          available: false,
          hiddenFromCustomer: true,
          deprecated: true,
          legacySource: 'old_menu_bakery',
        },
        { merge: true }
      );
      updated += 1;
    } catch (error) {
      errors.push(`menu/${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { updated, errors };
}

async function deactivateMenuDocsByCategoryIds(categoryIds: readonly string[]): Promise<{ updated: number; errors: string[] }> {
  const errors: string[] = [];

  try {
    const snapshot = await getDocs(query(collection(db, 'menu'), where('categoryId', 'in', [...categoryIds])));
    let updated = 0;

    for (const menuDoc of snapshot.docs) {
      try {
        await setDoc(
          doc(db, 'menu', menuDoc.id),
          {
            active: false,
            isAvailable: false,
            available: false,
            hiddenFromCustomer: true,
            deprecated: true,
            legacySource: 'old_menu_bakery',
          },
          { merge: true }
        );
        updated += 1;
      } catch (error) {
        errors.push(`menu/${menuDoc.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return { updated, errors };
  } catch (error) {
    return {
      updated: 0,
      errors: [`menu category query: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

async function reactivateBakeryBreakfastCategory(): Promise<{ updated: boolean; errors: string[] }> {
  try {
    await setDoc(
      doc(db, 'bakeryCategories', 'breakfast-light-bites'),
      {
        active: true,
        hiddenFromCustomer: false,
        deprecated: false,
        legacySource: 'bakery_front_catalog',
      },
      { merge: true }
    );
    return { updated: true, errors: [] };
  } catch (error) {
    return {
      updated: false,
      errors: [`bakeryCategories/breakfast-light-bites: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

async function moveBakeryItemsToMenu(): Promise<{ deactivatedBakeryItems: number; upsertedMenuItems: number; errors: string[] }> {
  const errors: string[] = [];
  let deactivatedBakeryItems = 0;
  let upsertedMenuItems = 0;

  for (const id of BAKERY_ITEMS_TO_MOVE_TO_MENU) {
    try {
      const sourceRef = doc(db, 'bakeryItems', id);
      const sourceSnap = await getDoc(sourceRef);
      if (!sourceSnap.exists()) {
        continue;
      }

      await setDoc(
        sourceRef,
        {
          active: false,
          ...LEGACY_MARKERS,
          legacySource: 'moved_to_menu_from_bakery',
        },
        { merge: true }
      );
      deactivatedBakeryItems += 1;
    } catch (error) {
      errors.push(`bakeryItems/${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const template of MENU_FROM_BAKERY_TEMPLATES) {
    const normalized = normalizeMenuItem(
      {
        ...template,
        active: true,
        available: true,
        isAvailable: true,
        serviceArea: 'cafe',
      } as Partial<MenuItem> & Record<string, unknown>,
      `catalog-separation/menu/${template.id}`
    );

    if (!normalized) {
      errors.push(`menu/${template.id}: normalizeMenuItem rejected migration template`);
      continue;
    }

    try {
      const audit = sanitizeForFirestoreWrite(normalized);
      if (!audit.sanitized || typeof audit.sanitized !== 'object' || Array.isArray(audit.sanitized)) {
        throw new Error(`Sanitized payload invalid for menu/${template.id}`);
      }
      await setDoc(doc(db, 'menu', template.id), audit.sanitized, { merge: true });
      upsertedMenuItems += 1;
    } catch (error) {
      errors.push(`menu/${template.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { deactivatedBakeryItems, upsertedMenuItems, errors };
}

async function deactivateLegacyBakeryAliases(): Promise<{ updated: number; errors: string[] }> {
  const errors: string[] = [];
  let updated = 0;

  for (const aliasId of BAKERY_ALIAS_IDS_TO_DEPRECATE) {
    try {
      const aliasRef = doc(db, 'bakeryItems', aliasId);
      const aliasSnap = await getDoc(aliasRef);
      if (!aliasSnap.exists()) continue;

      await setDoc(
        aliasRef,
        {
          active: false,
          ...LEGACY_MARKERS,
          legacySource: 'renamed_bakery_item_alias',
        },
        { merge: true }
      );
      updated += 1;
    } catch (error) {
      errors.push(`bakeryItems/${aliasId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { updated, errors };
}

export async function runCatalogSeparationMigration(): Promise<CatalogSeparationMigrationResult> {
  const categoryResult = await deactivateCategoryDocs(LEGACY_BAKERY_CATEGORY_IDS);
  const menuByIdResult = await deactivateMenuDocsByIds(LEGACY_BAKERY_MENU_ITEM_IDS);
  const menuByCategoryResult = await deactivateMenuDocsByCategoryIds(LEGACY_BAKERY_CATEGORY_IDS);
  const breakfastCategoryResult = await reactivateBakeryBreakfastCategory();
  const movedBakeryItemsResult = await moveBakeryItemsToMenu();
  const aliasResult = await deactivateLegacyBakeryAliases();

  return {
    deactivatedLegacyCategories: categoryResult.updated,
    deactivatedLegacyMenuItems: menuByIdResult.updated + menuByCategoryResult.updated,
    reactivatedBakeryBreakfastCategory: breakfastCategoryResult.updated,
    deactivatedBakeryItemsMovedToMenu: movedBakeryItemsResult.deactivatedBakeryItems,
    upsertedMenuItemsFromBakery: movedBakeryItemsResult.upsertedMenuItems,
    deactivatedLegacyBakeryAliasItems: aliasResult.updated,
    errors: [
      ...categoryResult.errors,
      ...menuByIdResult.errors,
      ...menuByCategoryResult.errors,
      ...breakfastCategoryResult.errors,
      ...movedBakeryItemsResult.errors,
      ...aliasResult.errors,
    ],
  };
}
