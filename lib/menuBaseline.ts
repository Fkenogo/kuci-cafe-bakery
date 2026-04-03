import menuMarkdown from '../Kuci Menu.md?raw';
import type { Category, MenuItem } from '../types';
import { parseMenuMarkdown } from './menuParser';
import { normalizeMenuSource } from './menuNormalizer';
import { normalizeMenuItem } from './catalog';
import { SEED_CATEGORIES, SEED_MENU_ITEMS } from './seedData';

function buildSeedFallback(): { categories: Category[]; items: MenuItem[] } {
  const categoryByKey = new Map<string, Category>();
  SEED_CATEGORIES.forEach((category) => categoryByKey.set(category.id, category));

  const normalizedItems = SEED_MENU_ITEMS.flatMap((item) => {
    const category = categoryByKey.get(item.categoryKey);
    if (!category) return [];
    const normalized = normalizeMenuItem(
      {
        ...item,
        categoryId: category.id,
      },
      `seed-fallback menu/${item.id}`
    );
    return normalized ? [normalized] : [];
  });

  return {
    categories: [...SEED_CATEGORIES].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    items: normalizedItems.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
  };
}

function buildMarkdownBaseline(): { categories: Category[]; items: MenuItem[] } {
  const parsed = parseMenuMarkdown(menuMarkdown);
  const normalized = normalizeMenuSource(parsed);

  const items = normalized.items.flatMap((item) => {
    const canonical = normalizeMenuItem(item as MenuItem & Record<string, unknown>, `markdown-baseline/${item.id}`);
    return canonical ? [canonical] : [];
  });

  return {
    categories: normalized.categories.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    items: items.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
  };
}

function buildBaselineMenuCatalog(): { categories: Category[]; items: MenuItem[]; source: 'markdown' | 'seed_fallback' } {
  try {
    const markdownBaseline = buildMarkdownBaseline();
    if (markdownBaseline.categories.length > 0 && markdownBaseline.items.length > 0) {
      return { ...markdownBaseline, source: 'markdown' };
    }
  } catch (error) {
    console.warn('[menu-baseline] Failed to parse Kuci Menu.md baseline, using seed fallback', error);
  }

  const fallback = buildSeedFallback();
  return { ...fallback, source: 'seed_fallback' };
}

const baseline = buildBaselineMenuCatalog();

export const BASELINE_MENU_SOURCE = baseline.source;
export const BASELINE_MENU_CATEGORIES: Category[] = baseline.categories;
export const BASELINE_MENU_ITEMS: MenuItem[] = baseline.items;
