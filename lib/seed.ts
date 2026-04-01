import { db } from './firebase';
import { collection, doc, getDoc, getDocs, limit, query, setDoc } from 'firebase/firestore';
import { SEED_BAKERY_CATEGORIES, SEED_BAKERY_ITEMS, SEED_CATEGORIES, SEED_SETTINGS, SEED_MENU_ITEMS } from './seedData';
import { normalizeBakeryCategory, normalizeBakeryItem, normalizeMenuItem, normalizeRestaurantSettings } from './catalog';
import { sanitizeForFirestoreWrite } from './firestoreSeedSanitizer';
import { runCatalogSeparationMigration } from './catalogSeparationMigration';

interface SeedSectionResult {
  ok: boolean;
  path: string;
  error?: string;
}

interface SeedResult {
  success: boolean;
  menuCount: number;
  categoriesCount: number;
  bakeryItemsCount: number;
  bakeryCategoriesCount: number;
  separationMigration: {
    deactivatedLegacyCategories: number;
    deactivatedLegacyMenuItems: number;
    reactivatedBakeryBreakfastCategory: boolean;
    deactivatedBakeryItemsMovedToMenu: number;
    upsertedMenuItemsFromBakery: number;
    deactivatedLegacyBakeryAliasItems: number;
  };
  settingsExists: boolean;
  errors: string[];
  mainError: string | null;
}

function getTopLevelKeys(value: unknown): string[] {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.keys(value as Record<string, unknown>)
    : [];
}

async function writeSeedDocument(path: string, payload: unknown): Promise<SeedSectionResult> {
  const segments = path.split('/');
  const [collectionName, docId] = segments;

  if (!collectionName || !docId) {
    const error = `Invalid Firestore path: ${path}`;
    console.error('[seed] ' + error);
    return { ok: false, path, error };
  }

  if (!docId.trim()) {
    const error = `Empty Firestore document ID for path: ${path}`;
    console.error('[seed] ' + error);
    return { ok: false, path, error };
  }

  const audit = sanitizeForFirestoreWrite(payload);
  const invalidPaths = [
    ...audit.undefinedPaths,
    ...audit.nanPaths,
    ...audit.unsupportedPaths,
  ];

  console.log(`[seed] writing ${path}`);
  console.log('[seed] original payload keys:', getTopLevelKeys(payload));
  console.log('[seed] undefined paths:', audit.undefinedPaths);
  console.log('[seed] NaN paths:', audit.nanPaths);
  console.log('[seed] unsupported paths:', audit.unsupportedPaths);
  console.log('[seed] sanitized payload:', audit.sanitized);

  if (!audit.sanitized || typeof audit.sanitized !== 'object' || Array.isArray(audit.sanitized)) {
    const error = `Sanitized payload for ${path} is not a Firestore document object.`;
    console.error('[seed] ' + error);
    return { ok: false, path, error };
  }

  try {
    await setDoc(doc(db, collectionName, docId), audit.sanitized);
    console.log(`[seed] wrote ${path}`);
    if (invalidPaths.length > 0) {
      console.warn(`[seed] ${path} contained invalid values and they were removed before write.`, invalidPaths);
    }
    return { ok: true, path };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[seed] failed writing ${path}:`, error);
    return { ok: false, path, error: message };
  }
}

export const seedFirestore = async () => {
  const projectId = db.app.options.projectId;
  const errors: string[] = [];

  console.log('[seed] Starting Firestore seed');
  console.log('[seed] Using Firebase project:', projectId);

  if (projectId !== 'kuci-cafe-bakery') {
    errors.push(`Unexpected Firebase project "${projectId}". Expected "kuci-cafe-bakery".`);
    console.error('[seed] Unexpected Firebase project. Expected "kuci-cafe-bakery".');
  }

  const settingsPayload = normalizeRestaurantSettings(SEED_SETTINGS);
  const settingsWrite = await writeSeedDocument('settings/restaurant', settingsPayload);
  if (!settingsWrite.ok && settingsWrite.error) {
    errors.push(`settings/restaurant: ${settingsWrite.error}`);
  }

  const categoryMap: Record<string, string> = {};
  let writtenCategories = 0;
  for (const category of SEED_CATEGORIES) {
    categoryMap[category.id] = category.id;
    const result = await writeSeedDocument(`categories/${category.id}`, category);
    if (result.ok) {
      writtenCategories += 1;
    } else if (result.error) {
      errors.push(`categories/${category.id}: ${result.error}`);
    }
  }

  let writtenMenuCount = 0;
  for (const item of SEED_MENU_ITEMS) {
    const categoryId = categoryMap[item.categoryKey];
    if (!categoryId) {
      const error = `menu/${item.id}: missing category mapping for key "${item.categoryKey}"`;
      console.error('[seed] ' + error);
      errors.push(error);
      continue;
    }

    const normalizedItem = normalizeMenuItem({
      ...item,
      categoryId,
    }, `seed menu/${item.id}`);

    if (!normalizedItem) {
      const error = `menu/${item.id}: normalizeMenuItem rejected payload`;
      console.error('[seed] ' + error);
      errors.push(error);
      continue;
    }

    const result = await writeSeedDocument(`menu/${item.id}`, normalizedItem);
    if (result.ok) {
      writtenMenuCount += 1;
    } else if (result.error) {
      errors.push(`menu/${item.id}: ${result.error}`);
    }
  }

  let writtenBakeryCategories = 0;
  for (const category of SEED_BAKERY_CATEGORIES) {
    const normalizedCategory = normalizeBakeryCategory(category, `seed bakeryCategories/${category.id}`);
    if (!normalizedCategory) {
      const error = `bakeryCategories/${category.id}: normalizeBakeryCategory rejected payload`;
      console.error('[seed] ' + error);
      errors.push(error);
      continue;
    }

    const result = await writeSeedDocument(`bakeryCategories/${category.id}`, normalizedCategory);
    if (result.ok) {
      writtenBakeryCategories += 1;
    } else if (result.error) {
      errors.push(`bakeryCategories/${category.id}: ${result.error}`);
    }
  }

  let writtenBakeryItems = 0;
  for (const item of SEED_BAKERY_ITEMS) {
    const normalizedItem = normalizeBakeryItem(item, `seed bakeryItems/${item.id}`);
    if (!normalizedItem) {
      const error = `bakeryItems/${item.id}: normalizeBakeryItem rejected payload`;
      console.error('[seed] ' + error);
      errors.push(error);
      continue;
    }

    const result = await writeSeedDocument(`bakeryItems/${item.id}`, normalizedItem);
    if (result.ok) {
      writtenBakeryItems += 1;
    } else if (result.error) {
      errors.push(`bakeryItems/${item.id}: ${result.error}`);
    }
  }

  const separationMigration = await runCatalogSeparationMigration();
  if (separationMigration.errors.length > 0) {
    errors.push(...separationMigration.errors.map((error) => `catalog-separation: ${error}`));
  }

  const [menuSnap, categoriesSnap, bakeryItemsSnap, bakeryCategoriesSnap, settingsSnap] = await Promise.all([
    getDocs(query(collection(db, 'menu'), limit(SEED_MENU_ITEMS.length))),
    getDocs(query(collection(db, 'categories'), limit(SEED_CATEGORIES.length))),
    getDocs(query(collection(db, 'bakeryItems'), limit(SEED_BAKERY_ITEMS.length))),
    getDocs(query(collection(db, 'bakeryCategories'), limit(SEED_BAKERY_CATEGORIES.length))),
    getDoc(doc(db, 'settings', 'restaurant')),
  ]);

  console.log('[seed] Post-seed verification');
  console.log('[seed] menu count:', menuSnap.size);
  console.log('[seed] categories count:', categoriesSnap.size);
  console.log('[seed] bakery items count:', bakeryItemsSnap.size);
  console.log('[seed] bakery categories count:', bakeryCategoriesSnap.size);
  console.log('[seed] settings exists:', settingsSnap.exists());

  const success =
    menuSnap.size > 0 &&
    categoriesSnap.size > 0 &&
    bakeryItemsSnap.size > 0 &&
    bakeryCategoriesSnap.size > 0 &&
    settingsSnap.exists() &&
    errors.length === 0;
  const mainError = errors[0] || (menuSnap.size === 0 ? 'No menu documents were written.' : null);

  if (!success) {
    console.error('[seed] Seed completed with failures:', errors);
  } else {
    console.log('[seed] Seed completed successfully.');
  }

  return {
    success,
    menuCount: menuSnap.size,
    categoriesCount: categoriesSnap.size,
    bakeryItemsCount: bakeryItemsSnap.size,
    bakeryCategoriesCount: bakeryCategoriesSnap.size,
    separationMigration: {
      deactivatedLegacyCategories: separationMigration.deactivatedLegacyCategories,
      deactivatedLegacyMenuItems: separationMigration.deactivatedLegacyMenuItems,
      reactivatedBakeryBreakfastCategory: separationMigration.reactivatedBakeryBreakfastCategory,
      deactivatedBakeryItemsMovedToMenu: separationMigration.deactivatedBakeryItemsMovedToMenu,
      upsertedMenuItemsFromBakery: separationMigration.upsertedMenuItemsFromBakery,
      deactivatedLegacyBakeryAliasItems: separationMigration.deactivatedLegacyBakeryAliasItems,
    },
    settingsExists: settingsSnap.exists(),
    errors,
    mainError,
  } satisfies SeedResult;
};
