/**
 * menuImport.ts
 * Firestore import orchestrator for canonical menu data.
 *
 * Reads Kuci Menu.md at build time (Vite ?raw import), runs the parser +
 * normalizer pipeline, then writes categories and menu items to Firestore.
 *
 * Safe behaviors:
 * - Validates before writing
 * - Writes categories first, items after
 * - Fails loudly on missing required fields (no silent coercion)
 * - Deactivates known legacy category IDs that were replaced by this import
 *   so they no longer appear in the UI
 * - Does NOT delete any Firestore documents
 *
 * Demo seed data status after this import:
 * - The 10 demo items from seedData.ts are overwritten by the canonical import
 *   (same document IDs are regenerated from the menu file names)
 * - The seed utility (lib/seed.ts) is kept as-is for development use only;
 *   do not call it after running this import on production
 * - One legacy seed item ID ("red-wine") is deactivated because the import
 *   writes it as "red-wines" with proper bottle/glass variants
 * - Two legacy category IDs ("coffee-espresso", "cocktails-wines") are
 *   deactivated; their replacements are "coffee" and "cocktails"+"wines-spirits"
 */

import menuMarkdown from '../Kuci Menu.md?raw';
import { db } from './firebase';
import { collection, doc, getDocs, limit, query, setDoc } from 'firebase/firestore';
import { parseMenuMarkdown } from './menuParser';
import { normalizeMenuSource } from './menuNormalizer';
import { sanitizeForFirestoreWrite } from './firestoreSeedSanitizer';
import { normalizeMenuItem } from './catalog';
import { runCatalogSeparationMigration } from './catalogSeparationMigration';
import type { MenuCategory, MenuItem } from '../types';

// ---------------------------------------------------------------------------
// Legacy IDs that must be deactivated after this import runs
// ---------------------------------------------------------------------------

const LEGACY_CATEGORY_IDS_TO_DEACTIVATE = [
  'coffee-espresso',   // replaced by 'coffee'
  'cocktails-wines',   // split into 'cocktails' + 'wines-spirits'
];

const LEGACY_ITEM_IDS_TO_DEACTIVATE = [
  'red-wine',          // replaced by 'red-wines' (with bottle/glass variants)
];

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface ImportSectionResult {
  written: number;
  skipped: number;
  errors: string[];
}

export interface MenuImportResult {
  success: boolean;
  categories: ImportSectionResult;
  items: ImportSectionResult;
  deactivated: { categories: number; items: number };
  separationMigration: {
    deactivatedLegacyCategories: number;
    deactivatedLegacyMenuItems: number;
    reactivatedBakeryBreakfastCategory: boolean;
    deactivatedBakeryItemsMovedToMenu: number;
    upsertedMenuItemsFromBakery: number;
    deactivatedLegacyBakeryAliasItems: number;
  };
  ambiguities: string[];
  errors: string[];
  mainError: string | null;
}

// ---------------------------------------------------------------------------
// Internal write helper (mirrors seed.ts pattern)
// ---------------------------------------------------------------------------

async function writeDocument(
  collectionName: string,
  docId: string,
  payload: unknown
): Promise<{ ok: boolean; error?: string }> {
  if (!docId.trim()) {
    return { ok: false, error: `Empty document ID for ${collectionName}` };
  }

  const audit = sanitizeForFirestoreWrite(payload);

  if (!audit.sanitized || typeof audit.sanitized !== 'object' || Array.isArray(audit.sanitized)) {
    return { ok: false, error: `Sanitized payload for ${collectionName}/${docId} is not a Firestore document` };
  }

  const invalidPaths = [...audit.undefinedPaths, ...audit.nanPaths, ...audit.unsupportedPaths];
  if (invalidPaths.length > 0) {
    console.warn(`[menu-import] ${collectionName}/${docId}: stripped invalid fields`, invalidPaths);
  }

  try {
    await setDoc(doc(db, collectionName, docId), audit.sanitized);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[menu-import] failed to write ${collectionName}/${docId}:`, err);
    return { ok: false, error: message };
  }
}

async function deactivateDocument(
  collectionName: string,
  docId: string
): Promise<void> {
  try {
    await setDoc(
      doc(db, collectionName, docId),
      { active: false, isAvailable: false },
      { merge: true }
    );
    console.log(`[menu-import] deactivated ${collectionName}/${docId}`);
  } catch (err) {
    console.warn(`[menu-import] could not deactivate ${collectionName}/${docId}:`, err);
  }
}

// ---------------------------------------------------------------------------
// Category import
// ---------------------------------------------------------------------------

async function importCategories(
  categories: MenuCategory[]
): Promise<ImportSectionResult> {
  const result: ImportSectionResult = { written: 0, skipped: 0, errors: [] };

  for (const category of categories) {
    if (!category.id || !category.name) {
      result.skipped++;
      result.errors.push(`Category missing id or name: ${JSON.stringify(category)}`);
      continue;
    }

    const { ok, error } = await writeDocument('categories', category.id, category);
    if (ok) {
      result.written++;
    } else {
      result.skipped++;
      if (error) result.errors.push(`categories/${category.id}: ${error}`);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Menu item import
// ---------------------------------------------------------------------------

async function importItems(items: MenuItem[]): Promise<ImportSectionResult> {
  const result: ImportSectionResult = { written: 0, skipped: 0, errors: [] };

  for (const rawItem of items) {
    // Run through normalizeMenuItem for final validation
    const item = normalizeMenuItem(rawItem as Partial<MenuItem> & Record<string, unknown>, `menu-import/${rawItem.id}`);

    if (!item) {
      result.skipped++;
      result.errors.push(`menu/${rawItem.id}: normalizeMenuItem rejected item`);
      continue;
    }

    if (!item.categoryId) {
      result.skipped++;
      result.errors.push(`menu/${item.id}: missing categoryId — skipped`);
      continue;
    }

    if (item.basePrice === null && (item.variants?.length ?? 0) === 0) {
      // Allow null-price items (e.g. "Create Your Own Detox") but log them
      console.warn(`[menu-import] menu/${item.id}: no price — will import with null basePrice`);
    }

    const { ok, error } = await writeDocument('menu', item.id, item);
    if (ok) {
      result.written++;
    } else {
      result.skipped++;
      if (error) result.errors.push(`menu/${item.id}: ${error}`);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Post-import verification
// ---------------------------------------------------------------------------

async function verifyCollectionCount(collectionName: string, expectedMin: number): Promise<number> {
  try {
    const snap = await getDocs(query(collection(db, collectionName), limit(expectedMin + 50)));
    return snap.size;
  } catch {
    return -1;
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function importCanonicalMenuFromSource(): Promise<MenuImportResult> {
  const projectId = db.app.options.projectId;
  console.log('[menu-import] Starting canonical menu import');
  console.log('[menu-import] Firebase project:', projectId);

  if (projectId !== 'kuci-cafe-bakery') {
    const err = `Unexpected Firebase project "${projectId}". Expected "kuci-cafe-bakery".`;
    console.error('[menu-import]', err);
    return {
      success: false,
      categories: { written: 0, skipped: 0, errors: [] },
      items: { written: 0, skipped: 0, errors: [] },
      deactivated: { categories: 0, items: 0 },
      separationMigration: {
        deactivatedLegacyCategories: 0,
        deactivatedLegacyMenuItems: 0,
        reactivatedBakeryBreakfastCategory: false,
        deactivatedBakeryItemsMovedToMenu: 0,
        upsertedMenuItemsFromBakery: 0,
        deactivatedLegacyBakeryAliasItems: 0,
      },
      ambiguities: [],
      errors: [err],
      mainError: err,
    };
  }

  // Parse and normalize
  const parsed = parseMenuMarkdown(menuMarkdown);
  console.log(`[menu-import] Parsed ${parsed.sections.length} sections, ${parsed.ambiguities.length} ambiguities`);

  const normalized = normalizeMenuSource(parsed);
  const allAmbiguities = [...normalized.ambiguities];

  console.log(`[menu-import] Normalized: ${normalized.categories.length} categories, ${normalized.items.length} items`);
  if (allAmbiguities.length > 0) {
    console.warn('[menu-import] Ambiguities:', allAmbiguities);
  }

  // Validate — fail loudly if output is implausibly small
  if (normalized.categories.length < 10) {
    const err = `Normalization produced only ${normalized.categories.length} categories (expected ≥10). Aborting.`;
    console.error('[menu-import]', err);
    return {
      success: false,
      categories: { written: 0, skipped: 0, errors: [err] },
      items: { written: 0, skipped: 0, errors: [] },
      deactivated: { categories: 0, items: 0 },
      separationMigration: {
        deactivatedLegacyCategories: 0,
        deactivatedLegacyMenuItems: 0,
        reactivatedBakeryBreakfastCategory: false,
        deactivatedBakeryItemsMovedToMenu: 0,
        upsertedMenuItemsFromBakery: 0,
        deactivatedLegacyBakeryAliasItems: 0,
      },
      ambiguities: allAmbiguities,
      errors: [err],
      mainError: err,
    };
  }

  if (normalized.items.length < 50) {
    const err = `Normalization produced only ${normalized.items.length} items (expected ≥50). Aborting.`;
    console.error('[menu-import]', err);
    return {
      success: false,
      categories: { written: 0, skipped: 0, errors: [err] },
      items: { written: 0, skipped: 0, errors: [] },
      deactivated: { categories: 0, items: 0 },
      separationMigration: {
        deactivatedLegacyCategories: 0,
        deactivatedLegacyMenuItems: 0,
        reactivatedBakeryBreakfastCategory: false,
        deactivatedBakeryItemsMovedToMenu: 0,
        upsertedMenuItemsFromBakery: 0,
        deactivatedLegacyBakeryAliasItems: 0,
      },
      ambiguities: allAmbiguities,
      errors: [err],
      mainError: err,
    };
  }

  // Write categories first
  console.log('[menu-import] Writing categories...');
  const categoryResult = await importCategories(normalized.categories);
  console.log(`[menu-import] Categories: ${categoryResult.written} written, ${categoryResult.skipped} skipped`);

  // Write items
  console.log('[menu-import] Writing menu items...');
  const itemResult = await importItems(normalized.items);
  console.log(`[menu-import] Items: ${itemResult.written} written, ${itemResult.skipped} skipped`);

  // Deactivate legacy documents
  let deactivatedCategories = 0;
  let deactivatedItems = 0;

  for (const id of LEGACY_CATEGORY_IDS_TO_DEACTIVATE) {
    await deactivateDocument('categories', id);
    deactivatedCategories++;
  }

  for (const id of LEGACY_ITEM_IDS_TO_DEACTIVATE) {
    await deactivateDocument('menu', id);
    deactivatedItems++;
  }

  const separationMigration = await runCatalogSeparationMigration();

  // Verify
  const menuCount = await verifyCollectionCount('menu', normalized.items.length);
  const categoriesCount = await verifyCollectionCount('categories', normalized.categories.length);
  console.log(`[menu-import] Post-import: menu=${menuCount}, categories=${categoriesCount}`);

  const allErrors = [
    ...categoryResult.errors,
    ...itemResult.errors,
    ...separationMigration.errors.map((error) => `catalog-separation: ${error}`),
  ];

  const success =
    categoryResult.errors.length === 0 &&
    itemResult.errors.length === 0 &&
    categoryResult.written > 0 &&
    itemResult.written > 0;

  if (success) {
    console.log('[menu-import] Import completed successfully.');
  } else {
    console.error('[menu-import] Import completed with errors:', allErrors);
  }

  return {
    success,
    categories: categoryResult,
    items: itemResult,
    deactivated: { categories: deactivatedCategories, items: deactivatedItems },
    separationMigration: {
      deactivatedLegacyCategories: separationMigration.deactivatedLegacyCategories,
      deactivatedLegacyMenuItems: separationMigration.deactivatedLegacyMenuItems,
      reactivatedBakeryBreakfastCategory: separationMigration.reactivatedBakeryBreakfastCategory,
      deactivatedBakeryItemsMovedToMenu: separationMigration.deactivatedBakeryItemsMovedToMenu,
      upsertedMenuItemsFromBakery: separationMigration.upsertedMenuItemsFromBakery,
      deactivatedLegacyBakeryAliasItems: separationMigration.deactivatedLegacyBakeryAliasItems,
    },
    ambiguities: allAmbiguities,
    errors: allErrors,
    mainError: allErrors[0] ?? null,
  };
}
