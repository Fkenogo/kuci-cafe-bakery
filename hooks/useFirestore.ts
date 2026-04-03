import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { BakeryCategory, BakeryItem, Category, MenuItem, RestaurantSettings } from '../types';
import { normalizeBakeryCategory, normalizeBakeryItem, normalizeMenuItem, normalizeRestaurantSettings } from '../lib/catalog';
import { BASELINE_MENU_CATEGORIES, BASELINE_MENU_ITEMS, BASELINE_MENU_SOURCE } from '../lib/menuBaseline';
import { SEED_BAKERY_CATEGORIES, SEED_BAKERY_ITEMS } from '../lib/seedData';
import { applyCanonicalCustomerCategoryMapping } from '../lib/customerCategoryMapping';

function normalizeToken(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function categoryTokens(category: Partial<Category>): string[] {
  return [category.id, category.slug, category.name].map(normalizeToken).filter(Boolean);
}

function menuItemTokens(item: Partial<MenuItem>): string[] {
  const scopedName = `${item.name || ''}|${item.categoryId || item.category || item.categoryName || ''}`;
  return [item.id, item.slug, scopedName].map(normalizeToken).filter(Boolean);
}

function bakeryCategoryTokens(category: Partial<BakeryCategory>): string[] {
  return [category.id, category.slug, category.name].map(normalizeToken).filter(Boolean);
}

function bakeryItemTokens(item: Partial<BakeryItem>): string[] {
  const scopedName = `${item.name || ''}|${item.bakeryCategoryId || item.bakeryCategoryName || ''}`;
  return [item.id, item.slug, item.sku, scopedName].map(normalizeToken).filter(Boolean);
}

function mergeByTokens<T extends { id: string; sortOrder?: number }>(
  baseline: T[],
  overrides: T[],
  getTokens: (item: T) => string[]
): T[] {
  const mergedById = new Map<string, T>();
  const tokenToId = new Map<string, string>();

  const indexItem = (item: T) => {
    mergedById.set(item.id, item);
    getTokens(item).forEach((token) => tokenToId.set(token, item.id));
  };

  baseline.forEach(indexItem);

  overrides.forEach((overrideItem) => {
    const tokens = getTokens(overrideItem);
    const matchedId = tokens.find((token) => tokenToId.has(token));
    if (!matchedId) {
      indexItem(overrideItem);
      return;
    }

    const existing = mergedById.get(tokenToId.get(matchedId) || '');
    if (!existing) {
      indexItem(overrideItem);
      return;
    }

    const mergedItem = { ...existing, ...overrideItem };
    if (existing.id !== overrideItem.id) {
      mergedById.delete(existing.id);
    }
    mergedById.set(overrideItem.id, mergedItem);
    getTokens(mergedItem).forEach((token) => tokenToId.set(token, overrideItem.id));
  });

  return Array.from(mergedById.values());
}

function isVisibleCategory(category: Category): boolean {
  return category.active !== false && category.hiddenFromCustomer !== true && category.deprecated !== true;
}

function isVisibleMenuItem(item: MenuItem): boolean {
  const available = typeof item.isAvailable === 'boolean'
    ? item.isAvailable
    : typeof item.available === 'boolean'
      ? item.available
      : true;
  return item.active !== false && available !== false && item.hiddenFromCustomer !== true && item.deprecated !== true;
}

function isVisibleBakeryCategory(category: BakeryCategory): boolean {
  return category.active !== false && category.hiddenFromCustomer !== true && category.deprecated !== true;
}

function isVisibleBakeryItem(item: BakeryItem): boolean {
  return item.active !== false && item.hiddenFromCustomer !== true && item.deprecated !== true;
}

const BASELINE_BAKERY_CATEGORIES: BakeryCategory[] = SEED_BAKERY_CATEGORIES.flatMap((category) => {
  const normalized = normalizeBakeryCategory(category, `seed bakeryCategories/${category.id}`);
  return normalized ? [normalized] : [];
});

const BASELINE_BAKERY_ITEMS: BakeryItem[] = SEED_BAKERY_ITEMS.flatMap((item) => {
  const normalized = normalizeBakeryItem(item, `seed bakeryItems/${item.id}`);
  return normalized ? [normalized] : [];
});

export function useRestaurantData() {
  const [categories, setCategories] = useState<Category[]>(
    [...BASELINE_MENU_CATEGORIES].filter(isVisibleCategory).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
  );
  const [menuItems, setMenuItems] = useState<MenuItem[]>(
    [...BASELINE_MENU_ITEMS].filter(isVisibleMenuItem).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
  );
  const [bakeryCategories, setBakeryCategories] = useState<BakeryCategory[]>(
    BASELINE_BAKERY_CATEGORIES.filter(isVisibleBakeryCategory).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
  );
  const [bakeryItems, setBakeryItems] = useState<BakeryItem[]>(
    BASELINE_BAKERY_ITEMS.filter(isVisibleBakeryItem).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
  );
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    let latestVisibleCategories: Category[] = [...BASELINE_MENU_CATEGORIES]
      .filter(isVisibleCategory)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    let latestVisibleMenuItems: MenuItem[] = [...BASELINE_MENU_ITEMS]
      .filter(isVisibleMenuItem)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    const publishCanonicalCustomerCatalog = () => {
      const canonical = applyCanonicalCustomerCategoryMapping(latestVisibleCategories, latestVisibleMenuItems);
      setCategories(canonical.categories);
      setMenuItems(canonical.items.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)));
    };

    let loadedSources = 0;
    const markLoaded = () => {
      loadedSources += 1;
      if (loadedSources >= 5) setLoading(false);
    };
    
    // Fetch Settings
    const unsubSettings = onSnapshot(doc(db, 'settings', 'restaurant'), (doc) => {
      if (doc.exists()) {
        setSettings(normalizeRestaurantSettings(doc.data() as RestaurantSettings));
      }
      markLoaded();
    }, (err) => {
      setError(err.message);
      markLoaded();
    });

    // Fetch Categories
    const unsubCategories = onSnapshot(collection(db, 'categories'), (snapshot) => {
      const firestoreCategories = snapshot.docs
        .map((categoryDoc) => ({ id: categoryDoc.id, ...categoryDoc.data() } as Category))
        .filter((category) => category.categoryGroup !== 'bakery');

      const merged = mergeByTokens<Category>(BASELINE_MENU_CATEGORIES, firestoreCategories, categoryTokens)
        .filter(isVisibleCategory)
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      latestVisibleCategories = merged;
      publishCanonicalCustomerCatalog();
      markLoaded();
    }, (err) => {
      setError(err.message);
      markLoaded();
    });

    // Fetch Menu Items from Firestore menu collection
    const unsubMenuItems = onSnapshot(collection(db, 'menu'), (snapshot) => {
      const firestoreItems = snapshot.docs.flatMap((menuDoc) => {
        const normalizedItem = normalizeMenuItem({ id: menuDoc.id, ...menuDoc.data() }, `firestore menu/${menuDoc.id}`);
        return normalizedItem ? [normalizedItem as MenuItem] : [];
      });

      const merged = mergeByTokens<MenuItem>(BASELINE_MENU_ITEMS, firestoreItems, menuItemTokens)
        .filter(isVisibleMenuItem)
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      latestVisibleMenuItems = merged;
      publishCanonicalCustomerCatalog();
      markLoaded();

      if (import.meta.env.DEV) {
        console.debug('[menu-data] merged menu load', {
          baselineSource: BASELINE_MENU_SOURCE,
          baselineCategories: BASELINE_MENU_CATEGORIES.length,
          baselineItems: BASELINE_MENU_ITEMS.length,
          firestoreMenuDocs: snapshot.size,
          finalItems: merged.length,
        });
      }
    }, (err) => {
      setError(err.message);
      markLoaded();
    });

    const unsubBakeryCategories = onSnapshot(collection(db, 'bakeryCategories'), (snapshot) => {
      const firestoreCategories = snapshot.docs.flatMap((categoryDoc) => {
        const normalized = normalizeBakeryCategory({ id: categoryDoc.id, ...categoryDoc.data() }, `firestore bakeryCategories/${categoryDoc.id}`);
        return normalized ? [normalized] : [];
      });

      const merged = mergeByTokens(BASELINE_BAKERY_CATEGORIES, firestoreCategories, bakeryCategoryTokens)
        .filter(isVisibleBakeryCategory)
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

      setBakeryCategories(merged);
      markLoaded();
    }, (err) => {
      setError(err.message);
      markLoaded();
    });

    const unsubBakeryItems = onSnapshot(collection(db, 'bakeryItems'), (snapshot) => {
      const firestoreItems = snapshot.docs.flatMap((itemDoc) => {
        const normalized = normalizeBakeryItem({ id: itemDoc.id, ...itemDoc.data() }, `firestore bakeryItems/${itemDoc.id}`);
        return normalized ? [normalized] : [];
      });

      const merged = mergeByTokens(BASELINE_BAKERY_ITEMS, firestoreItems, bakeryItemTokens)
        .filter(isVisibleBakeryItem)
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      setBakeryItems(merged);
      markLoaded();
    }, (err) => {
      setError(err.message);
      markLoaded();
    });

    return () => {
      unsubSettings();
      unsubCategories();
      unsubMenuItems();
      unsubBakeryCategories();
      unsubBakeryItems();
    };
  }, []);

  return { categories, menuItems, bakeryCategories, bakeryItems, settings, loading, error };
}
