import React, { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { AlertCircle, Archive, ChevronDown, ChevronRight, Copy, Eye, EyeOff, Loader2, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { db } from '../lib/firebase';
import { importCanonicalMenuFromSource } from '../lib/menuImport';
import { seedFirestore } from '../lib/seed';
import { BakeryCategory, BakeryItem, MenuCategory, MenuItem, ModifierGroup } from '../types';
import { mapMenuPrepStationToLegacyStation } from '../lib/catalog';

interface AdminCatalogViewProps {
  isAdmin: boolean;
}

type CatalogMode = 'cafe' | 'bakery';
type EditorType = 'category' | 'item';
type EditorMode = 'create' | 'edit';

interface ModifierOptionForm {
  id: string;
  name: string;
  priceDelta: string;
  active: boolean;
}

interface ModifierGroupForm {
  id: string;
  name: string;
  selectionType: 'single' | 'multiple';
  required: boolean;
  minSelections: string;
  maxSelections: string;
  options: ModifierOptionForm[];
}

interface CategoryFormState {
  id: string;
  name: string;
  description: string;
  iconName: string;
  slug: string;
  sortOrder: string;
  active: boolean;
  hiddenFromCustomer: boolean;
  categoryGroup: 'main' | 'bakery';
  serviceAreaDefault: 'cafe' | 'bakery';
  frontLaneDefault: 'cafe_front' | 'bakery_front';
  dispatchModeDefault: 'station_prep' | 'front_only' | 'bakery_front_only' | 'mixed_split';
}

interface ItemFormState {
  id: string;
  name: string;
  categoryId: string;
  price: string;
  shortDescription: string;
  fullDescription: string;
  imageUrl: string;
  active: boolean;
  availableNow: boolean;
  hiddenFromCustomer: boolean;
  featured: boolean;
  prepStation: 'kitchen' | 'barista' | 'front' | 'none';
  fulfillmentMode: 'made_to_order' | 'ready_to_serve';
  serviceArea: 'cafe' | 'bakery';
  prepInstructionsEnabled: boolean;
  prepInstructionsLabel: string;
  slug: string;
  sku: string;
  sortOrder: string;
  itemType: 'simple' | 'variant' | 'configurable' | 'composite' | 'bread' | 'whole_cake' | 'slice' | 'pastry';
  station: 'kitchen' | 'barista' | 'front_service' | 'bakery' | 'bar' | 'coffee';
  modifierGroups: ModifierGroupForm[];
}

interface EditorState {
  open: boolean;
  mode: CatalogMode;
  editorType: EditorType;
  editorMode: EditorMode;
  id: string | null;
}

const DEFAULT_EDITOR_STATE: EditorState = {
  open: false,
  mode: 'cafe',
  editorType: 'category',
  editorMode: 'create',
  id: null,
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => stripUndefinedDeep(entry)) as T;
  if (!value || typeof value !== 'object') return value;
  if (!isPlainObject(value)) return value;
  const output: Record<string, unknown> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
    if (entry === undefined) return;
    output[key] = stripUndefinedDeep(entry);
  });
  return output as T;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function sanitizeText(value: string): string {
  return value.trim();
}

function parseNumberInput(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function looksLikeNonDirectImageUrl(value: string): boolean {
  const url = value.trim().toLowerCase();
  if (!url) return false;
  const directImagePattern = /\.(jpg|jpeg|png|webp|gif|avif|svg)(\?.*)?$/i;
  if (directImagePattern.test(url)) return false;
  const likelyPageHosts = ['ibb.co', 'imgur.com', 'drive.google.com', 'dropbox.com', 'facebook.com', 'instagram.com', 'pinterest.com'];
  const directHostAllowlist = ['i.ibb.co', 'i.imgur.com', 'images.unsplash.com'];
  if (directHostAllowlist.some((host) => url.includes(host))) return false;
  return likelyPageHosts.some((host) => url.includes(host));
}

function buildUniqueId(base: string, existingIds: string[]): string {
  const root = slugify(base) || 'record';
  if (!existingIds.includes(root)) return root;
  let index = 2;
  while (existingIds.includes(`${root}-${index}`)) {
    index += 1;
  }
  return `${root}-${index}`;
}

function emptyCategoryForm(mode: CatalogMode): CategoryFormState {
  return {
    id: '',
    name: '',
    description: '',
    iconName: '',
    slug: '',
    sortOrder: '0',
    active: true,
    hiddenFromCustomer: false,
    categoryGroup: mode === 'bakery' ? 'bakery' : 'main',
    serviceAreaDefault: 'bakery',
    frontLaneDefault: 'bakery_front',
    dispatchModeDefault: 'bakery_front_only',
  };
}

function emptyItemForm(mode: CatalogMode): ItemFormState {
  return {
    id: '',
    name: '',
    categoryId: '',
    price: '0',
    shortDescription: '',
    fullDescription: '',
    imageUrl: '',
    active: true,
    availableNow: true,
    hiddenFromCustomer: false,
    featured: false,
    prepStation: mode === 'bakery' ? 'front' : 'kitchen',
    fulfillmentMode: mode === 'bakery' ? 'ready_to_serve' : 'made_to_order',
    serviceArea: mode === 'bakery' ? 'bakery' : 'cafe',
    prepInstructionsEnabled: false,
    prepInstructionsLabel: 'Special instructions',
    slug: '',
    sku: '',
    sortOrder: '0',
    itemType: mode === 'bakery' ? 'bread' : 'simple',
    station: mode === 'bakery' ? 'bakery' : 'kitchen',
    modifierGroups: [],
  };
}

function mapModifierGroups(groups: ModifierGroup[] | undefined): ModifierGroupForm[] {
  if (!groups?.length) return [];
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    selectionType: group.selectionType,
    required: !!group.required,
    minSelections: String(group.minSelections ?? 0),
    maxSelections: String(group.maxSelections ?? (group.selectionType === 'single' ? 1 : group.options.length || 1)),
    options: (group.options || []).map((option) => ({
      id: option.id,
      name: option.name,
      priceDelta: String(option.priceDelta ?? 0),
      active: option.active !== false,
    })),
  }));
}

function toModifierGroups(groups: ModifierGroupForm[]): ModifierGroup[] {
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    selectionType: group.selectionType,
    required: group.required,
    minSelections: Number(group.minSelections) || 0,
    maxSelections: Number(group.maxSelections) || (group.selectionType === 'single' ? 1 : group.options.length || 1),
    options: group.options.map((option) => ({
      id: option.id,
      name: option.name,
      priceDelta: Number(option.priceDelta) || 0,
      active: option.active,
    })),
  }));
}

export const AdminCatalogView: React.FC<AdminCatalogViewProps> = ({ isAdmin }) => {
  const [mode, setMode] = useState<CatalogMode>('cafe');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryActionFocusId, setCategoryActionFocusId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [bakeryCategories, setBakeryCategories] = useState<BakeryCategory[]>([]);
  const [bakeryItems, setBakeryItems] = useState<BakeryItem[]>([]);

  const [categorySearch, setCategorySearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const [editor, setEditor] = useState<EditorState>(DEFAULT_EDITOR_STATE);
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(emptyCategoryForm('cafe'));
  const [itemForm, setItemForm] = useState<ItemFormState>(emptyItemForm('cafe'));
  const [categorySlugTouched, setCategorySlugTouched] = useState(false);
  const [itemSlugTouched, setItemSlugTouched] = useState(false);
  const [showCategoryAdvanced, setShowCategoryAdvanced] = useState(false);
  const [showItemAdvanced, setShowItemAdvanced] = useState(false);
  const [showItemOperations, setShowItemOperations] = useState(false);
  const [showPersonalization, setShowPersonalization] = useState(false);
  const [collapsedModifierGroups, setCollapsedModifierGroups] = useState<Record<string, boolean>>({});
  const [showTools, setShowTools] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [importing, setImporting] = useState(false);
  const showImageUrlHint = looksLikeNonDirectImageUrl(itemForm.imageUrl);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!error) return;
    const timeout = window.setTimeout(() => setError(null), 7000);
    return () => window.clearTimeout(timeout);
  }, [error]);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    const unsubs = [
      onSnapshot(collection(db, 'categories'), (snapshot) => {
        const docs = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as MenuCategory) }));
        setCategories(docs.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)));
      }, (err) => setError(err.message)),
      onSnapshot(collection(db, 'menu'), (snapshot) => {
        const docs = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as MenuItem) }));
        setMenuItems(docs.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)));
      }, (err) => setError(err.message)),
      onSnapshot(collection(db, 'bakeryCategories'), (snapshot) => {
        const docs = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as BakeryCategory) }));
        setBakeryCategories(docs.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)));
      }, (err) => setError(err.message)),
      onSnapshot(collection(db, 'bakeryItems'), (snapshot) => {
        const docs = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as BakeryItem) }));
        setBakeryItems(docs.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)));
        setLoading(false);
      }, (err) => {
        setError(err.message);
        setLoading(false);
      }),
    ];

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [isAdmin]);

  const activeCategories = mode === 'cafe' ? categories : bakeryCategories;
  const activeItems = mode === 'cafe' ? menuItems : bakeryItems;

  const categoryItemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (mode === 'cafe') {
      menuItems.forEach((item) => {
        counts[item.categoryId] = (counts[item.categoryId] || 0) + 1;
      });
    } else {
      bakeryItems.forEach((item) => {
        counts[item.bakeryCategoryId] = (counts[item.bakeryCategoryId] || 0) + 1;
      });
    }
    return counts;
  }, [mode, menuItems, bakeryItems]);

  const filteredCategories = useMemo(() => {
    return activeCategories.filter((category) => {
      const matchesSearch = `${category.name} ${category.slug}`.toLowerCase().includes(categorySearch.toLowerCase().trim());
      const matchesActive = activeFilter === 'all' || (activeFilter === 'active' ? category.active : !category.active);
      return matchesSearch && matchesActive;
    });
  }, [activeCategories, categorySearch, activeFilter]);

  const filteredItems = useMemo(() => {
    return activeItems.filter((item) => {
      const categoryId = mode === 'cafe' ? (item as MenuItem).categoryId : (item as BakeryItem).bakeryCategoryId;
      if (categoryFilter && categoryId !== categoryFilter) return false;
      const hay = `${item.name} ${item.slug || ''} ${categoryId || ''} ${(item as MenuItem).sku || ''}`.toLowerCase();
      const matchesSearch = hay.includes(itemSearch.toLowerCase().trim());
      const matchesActive = activeFilter === 'all' || (activeFilter === 'active' ? item.active : !item.active);
      return matchesSearch && matchesActive;
    });
  }, [activeItems, itemSearch, activeFilter, mode, categoryFilter]);

  useEffect(() => {
    if (!categoryActionFocusId) return;
    const linkedCount = categoryItemCounts[categoryActionFocusId] || 0;
    if (linkedCount > 0) return;
    setError(null);
    setCategoryActionFocusId(null);
  }, [categoryActionFocusId, categoryItemCounts]);

  const currentCategoryName = (id: string): string => {
    const category = activeCategories.find((entry) => entry.id === id);
    return category?.name || id;
  };

  const closeEditor = () => {
    setEditor(DEFAULT_EDITOR_STATE);
    setEditorError(null);
    setShowCategoryAdvanced(false);
    setShowItemAdvanced(false);
    setShowItemOperations(false);
    setShowPersonalization(false);
    setCollapsedModifierGroups({});
    setCategorySlugTouched(false);
    setItemSlugTouched(false);
  };

  const runSave = async (action: () => Promise<void>, successMessage: string) => {
    try {
      setSaving(true);
      setEditorError(null);
      setNotice(null);
      await action();
      setNotice(successMessage);
      closeEditor();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Could not save catalog changes.';
      setEditorError(message);
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const validateSlugAndSku = (collectionName: 'categories' | 'menu' | 'bakeryCategories' | 'bakeryItems', id: string, slug: string, sku?: string) => {
    if (collectionName === 'categories') {
      const existing = categories.filter((entry) => entry.id !== id);
      if (existing.some((entry) => entry.slug === slug)) throw new Error('Category slug must be unique.');
      return;
    }
    if (collectionName === 'menu') {
      const existing = menuItems.filter((entry) => entry.id !== id);
      if (existing.some((entry) => (entry.slug || '') === slug)) throw new Error('Item slug must be unique in menu.');
      if (sku && existing.some((entry) => (entry.sku || '') === sku)) throw new Error('SKU must be unique in menu.');
      return;
    }
    if (collectionName === 'bakeryCategories') {
      const existing = bakeryCategories.filter((entry) => entry.id !== id);
      if (existing.some((entry) => entry.slug === slug)) throw new Error('Category slug must be unique in bakery categories.');
      return;
    }
    const existing = bakeryItems.filter((entry) => entry.id !== id);
    if (existing.some((entry) => entry.slug === slug)) throw new Error('Item slug must be unique in bakery items.');
    if (sku && existing.some((entry) => (entry.sku || '') === sku)) throw new Error('SKU must be unique in bakery items.');
  };

  const validateModifierGroups = (groups: ModifierGroupForm[]) => {
    for (const [groupIndex, group] of groups.entries()) {
      if (!sanitizeText(group.name)) {
        throw new Error(`Modifier group ${groupIndex + 1} needs a name.`);
      }

      const min = parseNumberInput(group.minSelections);
      const max = parseNumberInput(group.maxSelections);
      if (min === null || max === null || min < 0 || max < 0) {
        throw new Error(`Modifier group "${group.name}" has invalid min/max values.`);
      }
      if (min > max) {
        throw new Error(`Modifier group "${group.name}" has min selections greater than max selections.`);
      }
      if (group.selectionType === 'single' && max > 1) {
        throw new Error(`Modifier group "${group.name}" is single-select and max must be 1.`);
      }

      if (!group.options.length) {
        throw new Error(`Modifier group "${group.name}" must contain at least one option.`);
      }

      for (const option of group.options) {
        if (!sanitizeText(option.name)) {
          throw new Error(`Modifier group "${group.name}" has an option without a name.`);
        }
        const priceDelta = parseNumberInput(option.priceDelta);
        if (priceDelta === null) {
          throw new Error(`Modifier option "${option.name}" has invalid extra price.`);
        }
      }
    }
  };

  const openCreateCategoryEditor = () => {
    setError(null);
    setNotice(null);
    setCategoryActionFocusId(null);
    setEditor({ open: true, mode, editorType: 'category', editorMode: 'create', id: null });
    setCategoryForm(emptyCategoryForm(mode));
    setSelectedCategoryId(null);
    setEditorError(null);
    setCategorySlugTouched(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openEditCategoryEditor = (category: MenuCategory | BakeryCategory) => {
    setError(null);
    setNotice(null);
    setCategoryActionFocusId(null);
    setEditor({ open: true, mode, editorType: 'category', editorMode: 'edit', id: category.id });
    setSelectedCategoryId(category.id);
    setCategoryForm({
      id: category.id,
      name: category.name,
      description: category.description || '',
      iconName: category.iconName || '',
      slug: category.slug,
      sortOrder: String(category.sortOrder || 0),
      active: category.active,
      hiddenFromCustomer: !!category.hiddenFromCustomer,
      categoryGroup: (category as MenuCategory).categoryGroup || (mode === 'bakery' ? 'bakery' : 'main'),
      serviceAreaDefault: (category as BakeryCategory).serviceAreaDefault || 'bakery',
      frontLaneDefault: (category as BakeryCategory).frontLaneDefault || 'bakery_front',
      dispatchModeDefault: (category as BakeryCategory).dispatchModeDefault || 'bakery_front_only',
    });
    setEditorError(null);
    setCategorySlugTouched(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openCreateItemEditor = () => {
    setError(null);
    setNotice(null);
    setCategoryActionFocusId(null);
    setEditor({ open: true, mode, editorType: 'item', editorMode: 'create', id: null });
    setItemForm(emptyItemForm(mode));
    setSelectedItemId(null);
    setEditorError(null);
    setItemSlugTouched(false);
    setShowItemOperations(false);
    setShowPersonalization(false);
    setCollapsedModifierGroups({});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openEditItemEditor = (item: MenuItem | BakeryItem) => {
    setError(null);
    setNotice(null);
    setCategoryActionFocusId(null);
    if (mode === 'cafe') {
      const menuItem = item as MenuItem;
      setItemForm({
        id: menuItem.id,
        name: menuItem.name,
        categoryId: menuItem.categoryId,
        price: String(menuItem.basePrice ?? menuItem.price ?? 0),
        shortDescription: menuItem.descriptionShort || '',
        fullDescription: menuItem.descriptionLong || menuItem.description || '',
        imageUrl: menuItem.imageUrl || '',
        active: menuItem.active,
        availableNow: menuItem.isAvailable,
        hiddenFromCustomer: !!menuItem.hiddenFromCustomer,
        featured: !!menuItem.featured,
        prepStation: menuItem.prepStation,
        fulfillmentMode: menuItem.fulfillmentMode,
        serviceArea: menuItem.serviceArea || 'cafe',
        prepInstructionsEnabled: !!(menuItem as MenuItem & { prepInstructionsEnabled?: boolean }).prepInstructionsEnabled,
        prepInstructionsLabel: (menuItem as MenuItem & { prepInstructionsLabel?: string }).prepInstructionsLabel || 'Special instructions',
        slug: menuItem.slug || '',
        sku: menuItem.sku || '',
        sortOrder: String(menuItem.sortOrder || 0),
        itemType: menuItem.itemType,
        station: menuItem.station,
        modifierGroups: mapModifierGroups(menuItem.modifierGroups),
      });
    } else {
      const bakeryItem = item as BakeryItem;
      setItemForm({
        id: bakeryItem.id,
        name: bakeryItem.name,
        categoryId: bakeryItem.bakeryCategoryId,
        price: String(bakeryItem.price ?? 0),
        shortDescription: bakeryItem.description || '',
        fullDescription: bakeryItem.description || '',
        imageUrl: bakeryItem.imageUrl || '',
        active: bakeryItem.active,
        availableNow: bakeryItem.active,
        hiddenFromCustomer: !!bakeryItem.hiddenFromCustomer,
        featured: false,
        prepStation: bakeryItem.prepStation,
        fulfillmentMode: bakeryItem.fulfillmentMode,
        serviceArea: bakeryItem.serviceArea,
        prepInstructionsEnabled: !!(bakeryItem as BakeryItem & { prepInstructionsEnabled?: boolean }).prepInstructionsEnabled,
        prepInstructionsLabel: (bakeryItem as BakeryItem & { prepInstructionsLabel?: string }).prepInstructionsLabel || 'Special instructions',
        slug: bakeryItem.slug,
        sku: bakeryItem.sku || '',
        sortOrder: String(bakeryItem.sortOrder || 0),
        itemType: bakeryItem.itemType,
        station: bakeryItem.prepStation === 'barista' ? 'barista' : bakeryItem.prepStation === 'kitchen' ? 'kitchen' : 'bakery',
        modifierGroups: mapModifierGroups(bakeryItem.modifierGroups),
      });
    }

    setEditor({ open: true, mode, editorType: 'item', editorMode: 'edit', id: item.id });
    setSelectedItemId(item.id);
    setEditorError(null);
    setItemSlugTouched(true);
    const modifierGroups = mode === 'cafe'
      ? ((item as MenuItem).modifierGroups || [])
      : ((item as BakeryItem).modifierGroups || []);
    setShowPersonalization(modifierGroups.length > 0);
    setShowItemOperations(false);
    setCollapsedModifierGroups(
      modifierGroups.reduce((acc, group) => ({ ...acc, [group.id]: true }), {} as Record<string, boolean>)
    );
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveCategory = async () => {
    const name = sanitizeText(categoryForm.name);
    const description = sanitizeText(categoryForm.description);
    const iconName = sanitizeText(categoryForm.iconName);
    const slug = slugify(categoryForm.slug || categoryForm.name);
    const sortOrder = parseNumberInput(categoryForm.sortOrder);

    if (!name) throw new Error('Category name is required.');
    if (!slug) throw new Error('Category slug is required.');
    if (sortOrder === null) throw new Error('Sort order must be numeric.');

    const targetCollection = mode === 'cafe' ? 'categories' : 'bakeryCategories';
    const existingIds = (mode === 'cafe' ? categories : bakeryCategories).map((entry) => entry.id);
    const id = editor.editorMode === 'edit' && categoryForm.id
      ? categoryForm.id
      : buildUniqueId(categoryForm.slug || categoryForm.name, existingIds);

    validateSlugAndSku(targetCollection, id, slug);

    if (mode === 'cafe') {
      await setDoc(
        doc(db, 'categories', id),
        stripUndefinedDeep({
          id,
          name,
          slug,
          description,
          iconName,
          sortOrder,
          active: categoryForm.active,
          hiddenFromCustomer: categoryForm.hiddenFromCustomer,
          categoryGroup: categoryForm.categoryGroup,
          updatedAt: serverTimestamp(),
          ...(editor.editorMode === 'create' ? { createdAt: serverTimestamp() } : {}),
        }),
        { merge: true }
      );
      return;
    }

    await setDoc(
      doc(db, 'bakeryCategories', id),
      stripUndefinedDeep({
        id,
        name,
        slug,
        description,
        iconName,
        sortOrder,
        active: categoryForm.active,
        hiddenFromCustomer: categoryForm.hiddenFromCustomer,
        serviceAreaDefault: categoryForm.serviceAreaDefault,
        frontLaneDefault: categoryForm.frontLaneDefault,
        dispatchModeDefault: categoryForm.dispatchModeDefault,
        updatedAt: serverTimestamp(),
        ...(editor.editorMode === 'create' ? { createdAt: serverTimestamp() } : {}),
      }),
      { merge: true }
    );
  };

  const saveItem = async () => {
    const name = sanitizeText(itemForm.name);
    const shortDescription = sanitizeText(itemForm.shortDescription);
    const fullDescription = sanitizeText(itemForm.fullDescription);
    const imageUrl = sanitizeText(itemForm.imageUrl);
    const slug = slugify(itemForm.slug || itemForm.name);
    const sku = sanitizeText(itemForm.sku);
    const price = parseNumberInput(itemForm.price);
    const sortOrder = parseNumberInput(itemForm.sortOrder);

    if (!name) throw new Error('Item name is required.');
    if (!itemForm.categoryId) throw new Error('Item category is required.');
    if (!slug) throw new Error('Item slug is required.');
    if (price === null || price < 0) throw new Error('Price must be a non-negative number.');
    if (sortOrder === null) throw new Error('Sort order must be numeric.');
    if (!['kitchen', 'barista', 'front', 'none'].includes(itemForm.prepStation)) throw new Error('Prep Station is invalid.');
    if (!['made_to_order', 'ready_to_serve'].includes(itemForm.fulfillmentMode)) throw new Error('Fulfillment Mode is invalid.');
    if (!['cafe', 'bakery'].includes(itemForm.serviceArea)) throw new Error('Service Area is invalid.');

    validateModifierGroups(itemForm.modifierGroups);

    const targetCollection = mode === 'cafe' ? 'menu' : 'bakeryItems';
    const existingIds = (mode === 'cafe' ? menuItems : bakeryItems).map((entry) => entry.id);
    const id = editor.editorMode === 'edit' && itemForm.id
      ? itemForm.id
      : buildUniqueId(itemForm.slug || itemForm.name, existingIds);

    validateSlugAndSku(targetCollection, id, slug, sku || undefined);

    if (mode === 'cafe') {
      const category = categories.find((entry) => entry.id === itemForm.categoryId);
      await setDoc(
        doc(db, 'menu', id),
        stripUndefinedDeep({
          id,
          name,
          slug,
          description: shortDescription || fullDescription,
          descriptionShort: shortDescription,
          descriptionLong: fullDescription,
          categoryId: itemForm.categoryId,
          category: category?.name || '',
          categoryName: category?.name || '',
          basePrice: price,
          price,
          imageUrl,
          active: itemForm.active,
          isAvailable: itemForm.availableNow,
          available: itemForm.availableNow,
          hiddenFromCustomer: itemForm.hiddenFromCustomer,
          featured: itemForm.featured,
          sortOrder,
          sku: sku || undefined,
          itemType: itemForm.itemType,
          serviceArea: itemForm.serviceArea,
          prepStation: itemForm.prepStation,
          fulfillmentMode: itemForm.fulfillmentMode,
          station: itemForm.station || mapMenuPrepStationToLegacyStation(itemForm.prepStation),
          modifierGroups: toModifierGroups(itemForm.modifierGroups),
          prepInstructionsEnabled: itemForm.prepInstructionsEnabled,
          prepInstructionsLabel: itemForm.prepInstructionsEnabled ? sanitizeText(itemForm.prepInstructionsLabel || 'Special instructions') : undefined,
          updatedAt: serverTimestamp(),
          ...(editor.editorMode === 'create' ? { createdAt: serverTimestamp() } : {}),
        }),
        { merge: true }
      );
      return;
    }

    const category = bakeryCategories.find((entry) => entry.id === itemForm.categoryId);
    await setDoc(
      doc(db, 'bakeryItems', id),
      stripUndefinedDeep({
        id,
        name,
        slug,
        description: fullDescription || shortDescription,
        bakeryCategoryId: itemForm.categoryId,
        bakeryCategoryName: category?.name || '',
        price,
        imageUrl,
        active: itemForm.active,
        hiddenFromCustomer: itemForm.hiddenFromCustomer,
        sortOrder,
        prepStation: itemForm.prepStation,
        fulfillmentMode: itemForm.fulfillmentMode,
        itemType: itemForm.itemType,
        serviceArea: itemForm.serviceArea,
        sku: sku || undefined,
        modifierGroups: toModifierGroups(itemForm.modifierGroups),
        prepInstructionsEnabled: itemForm.prepInstructionsEnabled,
        prepInstructionsLabel: itemForm.prepInstructionsEnabled ? sanitizeText(itemForm.prepInstructionsLabel || 'Special instructions') : undefined,
        updatedAt: serverTimestamp(),
        ...(editor.editorMode === 'create' ? { createdAt: serverTimestamp() } : {}),
      }),
      { merge: true }
    );
  };

  const toggleCategoryHidden = async (entry: MenuCategory | BakeryCategory, targetHidden: boolean) => {
    const collectionName = mode === 'cafe' ? 'categories' : 'bakeryCategories';

    await runSave(async () => {
      await setDoc(doc(db, collectionName, entry.id), stripUndefinedDeep({
        hiddenFromCustomer: targetHidden,
        updatedAt: serverTimestamp(),
      }), { merge: true });
    }, `${targetHidden ? 'Hidden' : 'Visible'} ${entry.name}.`);
  };

  const toggleItemHidden = async (entry: MenuItem | BakeryItem, targetHidden: boolean) => {
    const collectionName = mode === 'cafe' ? 'menu' : 'bakeryItems';

    await runSave(async () => {
      await setDoc(doc(db, collectionName, entry.id), stripUndefinedDeep({
        hiddenFromCustomer: targetHidden,
        updatedAt: serverTimestamp(),
      }), { merge: true });
    }, `${targetHidden ? 'Hidden' : 'Visible'} ${entry.name}.`);
  };

  const archiveCategory = async (category: MenuCategory | BakeryCategory) => {
    const linkedCount = categoryItemCounts[category.id] || 0;
    if (linkedCount > 0) {
      setNotice(null);
      setCategoryActionFocusId(category.id);
      setError('Cannot archive this category because it contains active items. Move, hide, or delete those items first.');
      return;
    }

    await runSave(async () => {
      setCategoryActionFocusId(null);
      const collectionName = mode === 'cafe' ? 'categories' : 'bakeryCategories';
      await setDoc(doc(db, collectionName, category.id), stripUndefinedDeep({
        active: false,
        hiddenFromCustomer: true,
        deprecated: true,
        legacySource: 'catalog_archive',
        updatedAt: serverTimestamp(),
      }), { merge: true });
    }, `Archived ${category.name}.`);
  };

  const archiveItem = async (item: MenuItem | BakeryItem) => {
    await runSave(async () => {
      const collectionName = mode === 'cafe' ? 'menu' : 'bakeryItems';
      const commonPayload = {
        active: false,
        hiddenFromCustomer: true,
        deprecated: true,
        legacySource: 'catalog_archive',
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, collectionName, item.id), stripUndefinedDeep({
        ...commonPayload,
        ...(mode === 'cafe' ? { isAvailable: false, available: false } : {}),
      }), { merge: true });
    }, `Archived ${item.name}.`);
  };

  const deleteCategory = async (category: MenuCategory | BakeryCategory) => {
    const linkedCount = categoryItemCounts[category.id] || 0;
    if (linkedCount > 0) {
      setNotice(null);
      setCategoryActionFocusId(category.id);
      setError(
        'Cannot delete category while linked items still exist. Delete, move, or archive linked items first.'
      );
      return;
    }

    const confirmed = window.confirm(
      `Permanently delete category "${category.name}"? This removes the document from Firestore and cannot be undone.`
    );
    if (!confirmed) return;

    await runSave(async () => {
      setCategoryActionFocusId(null);
      const collectionName = mode === 'cafe' ? 'categories' : 'bakeryCategories';
      await deleteDoc(doc(db, collectionName, category.id));
    }, `Deleted category ${category.name}.`);
  };

  const deleteItem = async (item: MenuItem | BakeryItem) => {
    const confirmed = window.confirm(
      `Permanently delete item "${item.name}"? This removes the document from Firestore and cannot be undone.`
    );
    if (!confirmed) return;

    await runSave(async () => {
      const collectionName = mode === 'cafe' ? 'menu' : 'bakeryItems';
      await deleteDoc(doc(db, collectionName, item.id));
    }, `Deleted item ${item.name}.`);
  };

  const duplicateItem = (item: MenuItem | BakeryItem) => {
    setError(null);
    setNotice(null);
    setCategoryActionFocusId(null);
    setEditor({ open: true, mode, editorType: 'item', editorMode: 'create', id: null });
    setItemSlugTouched(false);
    setSelectedItemId(item.id);

    if (mode === 'cafe') {
      const menuItem = item as MenuItem;
      setItemForm({
        id: '',
        name: `${menuItem.name} Copy`,
        categoryId: menuItem.categoryId,
        price: String(menuItem.basePrice ?? menuItem.price ?? 0),
        shortDescription: menuItem.descriptionShort || '',
        fullDescription: menuItem.descriptionLong || menuItem.description || '',
        imageUrl: menuItem.imageUrl || '',
        active: menuItem.active,
        availableNow: menuItem.isAvailable,
        hiddenFromCustomer: !!menuItem.hiddenFromCustomer,
        featured: !!menuItem.featured,
        prepStation: menuItem.prepStation,
        fulfillmentMode: menuItem.fulfillmentMode,
        serviceArea: menuItem.serviceArea || 'cafe',
        prepInstructionsEnabled: !!(menuItem as MenuItem & { prepInstructionsEnabled?: boolean }).prepInstructionsEnabled,
        prepInstructionsLabel: (menuItem as MenuItem & { prepInstructionsLabel?: string }).prepInstructionsLabel || 'Special instructions',
        slug: slugify(`${menuItem.slug || menuItem.name}-copy`),
        sku: menuItem.sku ? `${menuItem.sku}-COPY` : '',
        sortOrder: String(menuItem.sortOrder || 0),
        itemType: menuItem.itemType,
        station: menuItem.station,
        modifierGroups: mapModifierGroups(menuItem.modifierGroups),
      });
    } else {
      const bakeryItem = item as BakeryItem;
      setItemForm({
        id: '',
        name: `${bakeryItem.name} Copy`,
        categoryId: bakeryItem.bakeryCategoryId,
        price: String(bakeryItem.price ?? 0),
        shortDescription: bakeryItem.description,
        fullDescription: bakeryItem.description,
        imageUrl: bakeryItem.imageUrl || '',
        active: bakeryItem.active,
        availableNow: bakeryItem.active,
        hiddenFromCustomer: !!bakeryItem.hiddenFromCustomer,
        featured: false,
        prepStation: bakeryItem.prepStation,
        fulfillmentMode: bakeryItem.fulfillmentMode,
        serviceArea: bakeryItem.serviceArea,
        prepInstructionsEnabled: !!(bakeryItem as BakeryItem & { prepInstructionsEnabled?: boolean }).prepInstructionsEnabled,
        prepInstructionsLabel: (bakeryItem as BakeryItem & { prepInstructionsLabel?: string }).prepInstructionsLabel || 'Special instructions',
        slug: slugify(`${bakeryItem.slug}-copy`),
        sku: bakeryItem.sku ? `${bakeryItem.sku}-COPY` : '',
        sortOrder: String(bakeryItem.sortOrder || 0),
        itemType: bakeryItem.itemType,
        station: bakeryItem.prepStation === 'barista' ? 'barista' : bakeryItem.prepStation === 'kitchen' ? 'kitchen' : 'bakery',
        modifierGroups: mapModifierGroups(bakeryItem.modifierGroups),
      });
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const addModifierGroup = () => {
    setItemForm((prev) => {
      const newId = buildUniqueId(`group-${prev.modifierGroups.length + 1}`, prev.modifierGroups.map((group) => group.id));
      setCollapsedModifierGroups((existing) => ({ ...existing, [newId]: false }));
      return {
        ...prev,
        modifierGroups: [
          ...prev.modifierGroups,
          {
            id: newId,
            name: '',
            selectionType: 'single',
            required: false,
            minSelections: '0',
            maxSelections: '1',
            options: [],
          },
        ],
      };
    });
    setShowPersonalization(true);
  };

  const updateModifierGroup = (groupId: string, patch: Partial<ModifierGroupForm>) => {
    setItemForm((prev) => ({
      ...prev,
      modifierGroups: prev.modifierGroups.map((group) => {
        if (group.id !== groupId) return group;
        const next = { ...group, ...patch };
        if (patch.selectionType === 'single') {
          next.maxSelections = '1';
          if (Number(next.minSelections) > 1) next.minSelections = '1';
        }
        return next;
      }),
    }));
  };

  const removeModifierGroup = (groupId: string) => {
    setItemForm((prev) => ({ ...prev, modifierGroups: prev.modifierGroups.filter((group) => group.id !== groupId) }));
    setCollapsedModifierGroups((existing) => {
      const next = { ...existing };
      delete next[groupId];
      return next;
    });
  };

  const addModifierOption = (groupId: string) => {
    setItemForm((prev) => ({
      ...prev,
      modifierGroups: prev.modifierGroups.map((group) => {
        if (group.id !== groupId) return group;
        const existingIds = group.options.map((option) => option.id);
        return {
          ...group,
          options: [
            ...group.options,
            {
              id: buildUniqueId(`option-${group.options.length + 1}`, existingIds),
              name: '',
              priceDelta: '0',
              active: true,
            },
          ],
        };
      }),
    }));
  };

  const updateModifierOption = (groupId: string, optionId: string, patch: Partial<ModifierOptionForm>) => {
    setItemForm((prev) => ({
      ...prev,
      modifierGroups: prev.modifierGroups.map((group) => {
        if (group.id !== groupId) return group;
        return {
          ...group,
          options: group.options.map((option) => (option.id === optionId ? { ...option, ...patch } : option)),
        };
      }),
    }));
  };

  const removeModifierOption = (groupId: string, optionId: string) => {
    setItemForm((prev) => ({
      ...prev,
      modifierGroups: prev.modifierGroups.map((group) => {
        if (group.id !== groupId) return group;
        return { ...group, options: group.options.filter((option) => option.id !== optionId) };
      }),
    }));
  };

  const handleSeed = async () => {
    if (!window.confirm('Run seed data update now? This writes demo catalog records to Firestore.')) return;
    setSeeding(true);
    setError(null);
    setNotice(null);
    const result = await seedFirestore();
    setSeeding(false);
    if (result.success) {
      setNotice(`Seed complete: ${result.menuCount} menu docs.`);
      return;
    }
    setError(result.mainError || 'Seed failed.');
  };

  const handleImport = async () => {
    if (!window.confirm('Import canonical menu now? This updates menu and categories from source data.')) return;
    setImporting(true);
    setError(null);
    setNotice(null);
    const result = await importCanonicalMenuFromSource();
    setImporting(false);
    if (result.success) {
      setNotice(`Import complete: ${result.items.written} items and ${result.categories.written} categories.`);
      return;
    }
    setError(result.mainError || 'Import failed.');
  };

  if (!isAdmin) {
    return (
      <div className="px-4 py-12 space-y-4 text-center">
        <h2 className="text-3xl font-serif">Admin Only</h2>
        <p className="text-sm text-[var(--color-text-muted)]">You do not have permission to manage catalog data.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-8 space-y-6 pb-28">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-3xl font-serif">Catalog Management</h2>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-primary)]">Admin</span>
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">Manage customer-facing and operational catalog records without editing Firestore directly.</p>
      </header>

      <div className="flex items-center gap-2">
        <nav className="flex gap-1 rounded-[20px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/40 p-1 flex-1">
          {([
            { key: 'cafe' as CatalogMode, label: 'Cafe Menu', count: menuItems.length },
            { key: 'bakery' as CatalogMode, label: 'Bakery Catalog', count: bakeryItems.length },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setMode(tab.key); setCategoryFilter(null); setCategorySearch(''); setItemSearch(''); }}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-[16px] text-[11px] font-black uppercase tracking-widest transition-all ${
                mode === tab.key
                  ? 'bg-[var(--color-primary)] text-white shadow-sm'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              {tab.label}
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black ${
                mode === tab.key ? 'bg-white/25 text-white' : 'bg-[var(--color-border)] text-[var(--color-text-muted)]'
              }`}>{tab.count}</span>
            </button>
          ))}
        </nav>
        <button
          onClick={() => setShowTools((prev) => !prev)}
          className="inline-flex items-center gap-1 rounded-[16px] border border-[var(--color-border)] bg-white px-3 py-2.5 text-xs font-bold uppercase tracking-wider"
        >
          {showTools ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          Tools
        </button>
      </div>

      {showTools && (
        <section className="rounded-[24px] border border-[var(--color-border)] bg-white p-4 space-y-2">
          <p className="text-xs font-black uppercase tracking-widest text-[var(--color-text-muted)]">Secondary Admin Tools</p>
          <p className="text-xs text-[var(--color-text-muted)]">Use seed/import tools only when needed for controlled admin maintenance.</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleSeed}
              disabled={seeding || importing}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2 text-xs font-black uppercase tracking-wider"
            >
              {seeding ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Seed Data
            </button>
            <button
              onClick={handleImport}
              disabled={seeding || importing}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2 text-xs font-black uppercase tracking-wider"
            >
              {importing ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Import Menu
            </button>
          </div>
        </section>
      )}


      {error && (
        <div className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <span className="flex-1">{error}</span>
          {categoryActionFocusId ? (
            <button
              onClick={() => {
                setSelectedCategoryId(categoryActionFocusId);
                setItemSearch(currentCategoryName(categoryActionFocusId));
                setError(null);
              }}
              className="text-xs font-black uppercase tracking-wider rounded-full border border-red-300 px-2 py-1"
            >
              View Items in this Category
            </button>
          ) : null}
          <button
            onClick={() => setError(null)}
            className="text-xs font-black uppercase tracking-wider rounded-full border border-red-300 px-2 py-1"
          >
            Dismiss
          </button>
        </div>
      )}
      {notice && (
        <div className="rounded-[20px] border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 flex items-center gap-2">
          <span className="flex-1">{notice}</span>
          <button
            onClick={() => setNotice(null)}
            className="text-xs font-black uppercase tracking-wider rounded-full border border-green-300 px-2 py-1"
          >
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-[var(--color-text-muted)] flex flex-col items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)]" />
          Loading catalog data...
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-[24px] border border-[var(--color-border)] bg-white p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-serif">{mode === 'cafe' ? 'Categories' : 'Bakery Categories'}</h3>
              <button
                onClick={openCreateCategoryEditor}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--color-primary)] text-white px-3 py-1.5 text-xs font-bold uppercase tracking-wider"
              >
                <Plus className="w-3 h-3" />
                New
              </button>
            </div>

            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-2 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5">
                <Search className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" />
                <input value={categorySearch} onChange={(event) => setCategorySearch(event.target.value)} placeholder="Search categories…" className="w-full bg-transparent py-2 text-sm outline-none" />
              </div>
              <select value={activeFilter} onChange={(event) => setActiveFilter(event.target.value as typeof activeFilter)} className="rounded-[12px] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-2 text-xs font-semibold">
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
              {filteredCategories.map((category) => {
                const isSelected = selectedCategoryId === category.id;
                const isFiltered = categoryFilter === category.id;
                return (
                  <article key={category.id} className={`rounded-[16px] border px-3 py-3 space-y-2 cursor-pointer transition-all ${isFiltered ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 ring-2 ring-[var(--color-primary)]/15' : isSelected ? 'border-[var(--color-primary)]/50' : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/30'}`}
                    onClick={() => setCategoryFilter(isFiltered ? null : category.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold flex items-center gap-1.5">{category.name} {isFiltered && <span className="text-[9px] font-black uppercase tracking-widest text-[var(--color-primary)]">▶ filtering</span>}</p>
                        {category.description ? <p className="text-xs text-[var(--color-text-muted)]">{category.description}</p> : null}
                      </div>
                      <div className="flex gap-1">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${category.active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'}`}>{category.active ? 'active' : 'inactive'}</span>
                        <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${category.hiddenFromCustomer ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{category.hiddenFromCustomer ? 'hidden' : 'visible'}</span>
                      </div>
                    </div>

                    <p className="text-xs text-[var(--color-text-muted)]">{categoryItemCounts[category.id] || 0} items</p>

                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => openEditCategoryEditor(category)} className="rounded-full border border-[var(--color-border)] px-3 py-1 text-[10px] font-black uppercase tracking-wider">Edit</button>
                      <button
                        onClick={() => {
                          void toggleCategoryHidden(category, !category.hiddenFromCustomer);
                        }}
                        className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] px-3 py-1 text-[10px] font-black uppercase tracking-wider"
                      >
                        {category.hiddenFromCustomer ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                        {category.hiddenFromCustomer ? 'Show' : 'Hide'}
                      </button>
                      <button onClick={() => void archiveCategory(category)} className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] text-[var(--color-text-muted)] px-3 py-1 text-[10px] font-black uppercase tracking-wider"><Archive className="w-3 h-3" />Archive</button>
                      <span className="text-[var(--color-border)]">|</span>
                      <button onClick={() => void deleteCategory(category)} className="inline-flex items-center gap-1 rounded-full border border-red-400 bg-red-50 text-red-800 px-3 py-1 text-[10px] font-black uppercase tracking-wider"><Trash2 className="w-3 h-3" />Delete</button>
                    </div>
                  </article>
                );
              })}

              {filteredCategories.length === 0 && (
                <div className="rounded-[16px] border border-dashed border-[var(--color-border)] px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">No categories found.</div>
              )}
            </div>
          </section>

          <section className="rounded-[24px] border border-[var(--color-border)] bg-white p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-serif">{mode === 'cafe' ? 'Items' : 'Bakery Items'}</h3>
                {categoryFilter && (
                  <button
                    onClick={() => setCategoryFilter(null)}
                    className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[var(--color-primary)] mt-0.5"
                  >
                    <X className="w-3 h-3" />
                    {currentCategoryName(categoryFilter)} · {filteredItems.length} items
                  </button>
                )}
              </div>
              <button
                onClick={openCreateItemEditor}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--color-primary)] text-white px-3 py-1.5 text-xs font-bold uppercase tracking-wider"
              >
                <Plus className="w-3 h-3" />
                New
              </button>
            </div>

            <div className="flex items-center gap-2 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5">
              <Search className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" />
              <input value={itemSearch} onChange={(event) => setItemSearch(event.target.value)} placeholder={categoryFilter ? `Search in ${currentCategoryName(categoryFilter)}…` : 'Search items…'} className="w-full bg-transparent py-2 text-sm outline-none" />
              {itemSearch && <button onClick={() => setItemSearch('')} className="text-[var(--color-text-muted)]"><X className="w-3.5 h-3.5" /></button>}
            </div>

            <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
              {filteredItems.map((item) => {
                const typedItem = mode === 'cafe' ? (item as MenuItem) : (item as BakeryItem);
                const categoryId = mode === 'cafe' ? (typedItem as MenuItem).categoryId : (typedItem as BakeryItem).bakeryCategoryId;
                const price = mode === 'cafe' ? ((typedItem as MenuItem).basePrice ?? (typedItem as MenuItem).price ?? 0) : ((typedItem as BakeryItem).price ?? 0);
                const groupsCount = (typedItem.modifierGroups || []).length;
                const isSelected = selectedItemId === item.id;
                return (
                  <article key={item.id} className={`rounded-[16px] border px-3 py-3 space-y-2 ${isSelected ? 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/15' : 'border-[var(--color-border)]'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold">{item.name}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">{currentCategoryName(categoryId)}</p>
                      </div>
                      <div className="flex gap-1">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${item.active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'}`}>{item.active ? 'active' : 'inactive'}</span>
                        <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${item.hiddenFromCustomer ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{item.hiddenFromCustomer ? 'hidden' : 'visible'}</span>
                        {mode === 'cafe' && (
                          <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${(typedItem as MenuItem).isAvailable ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                            {(typedItem as MenuItem).isAvailable ? 'available now' : 'unavailable now'}
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="text-sm font-semibold">{Number(price).toLocaleString()} RWF</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{typedItem.prepStation} • {typedItem.fulfillmentMode}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{groupsCount} modifier {groupsCount === 1 ? 'group' : 'groups'}</p>

                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => openEditItemEditor(item)} className="rounded-full border border-[var(--color-border)] px-3 py-1 text-[10px] font-black uppercase tracking-wider">Edit</button>
                      <button
                        onClick={() => {
                          void toggleItemHidden(item, !item.hiddenFromCustomer);
                        }}
                        className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] px-3 py-1 text-[10px] font-black uppercase tracking-wider"
                      >
                        {item.hiddenFromCustomer ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                        {item.hiddenFromCustomer ? 'Show' : 'Hide'}
                      </button>
                      <button onClick={() => void archiveItem(item)} className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] text-[var(--color-text-muted)] px-3 py-1 text-[10px] font-black uppercase tracking-wider"><Archive className="w-3 h-3" />Archive</button>
                      <span className="text-[var(--color-border)]">|</span>
                      <button onClick={() => void deleteItem(item)} className="inline-flex items-center gap-1 rounded-full border border-red-400 bg-red-50 text-red-800 px-3 py-1 text-[10px] font-black uppercase tracking-wider"><Trash2 className="w-3 h-3" />Delete</button>
                      <button onClick={() => duplicateItem(item)} className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] px-3 py-1 text-[10px] font-black uppercase tracking-wider"><Copy className="w-3 h-3" />Duplicate</button>
                    </div>
                  </article>
                );
              })}

              {filteredItems.length === 0 && (
                <div className="rounded-[16px] border border-dashed border-[var(--color-border)] px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">No items found.</div>
              )}
            </div>
          </section>
        </div>
      )}

      {editor.open && (
        <div className="fixed inset-0 z-[120] bg-black/40 px-3 py-6 overflow-y-auto">
          <div className="max-w-4xl mx-auto rounded-[24px] border border-[var(--color-border)] bg-white shadow-2xl">
            <header className="sticky top-0 z-10 bg-white border-b border-[var(--color-border)] px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-primary)]">{editor.mode === 'cafe' ? 'Cafe' : 'Bakery'} • {editor.editorType}</p>
                <h3 className="text-xl font-serif">{editor.editorMode === 'create' ? `New ${editor.editorType}` : `Edit ${editor.editorType}`}</h3>
                {editor.editorMode === 'edit' ? (
                  <p className="text-sm text-[var(--color-text-muted)] mt-1">
                    {editor.editorType === 'item' ? itemForm.name || itemForm.id : categoryForm.name || categoryForm.id}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={saving}
                  onClick={() => {
                    if (editor.editorType === 'category') {
                      void runSave(saveCategory, `${editor.mode === 'cafe' ? 'Cafe' : 'Bakery'} category saved.`);
                    } else {
                      void runSave(saveItem, `${editor.mode === 'cafe' ? 'Cafe' : 'Bakery'} item saved.`);
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary)] text-white px-4 py-2 text-xs font-black uppercase tracking-wider"
                >
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  Save
                </button>
                <button onClick={closeEditor} className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] px-3 py-2 text-xs font-black uppercase tracking-wider">
                  <X className="w-3 h-3" />
                  Cancel
                </button>
              </div>
            </header>

            <div className="p-5 space-y-5">
              {editorError && (
                <div className="rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{editorError}</div>
              )}

              {editor.editorType === 'category' ? (
                <>
                  <section className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1 md:col-span-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Category Name</span>
                      <input
                        value={categoryForm.name}
                        onChange={(event) => {
                          const nextName = event.target.value;
                          setCategoryForm((prev) => ({ ...prev, name: nextName, slug: categorySlugTouched ? prev.slug : slugify(nextName) }));
                        }}
                        className="w-full rounded-[12px] border border-[var(--color-border)] px-3 py-2 text-sm"
                        placeholder="Category name"
                      />
                    </label>

                    <label className="space-y-1 md:col-span-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Description</span>
                      <textarea value={categoryForm.description} onChange={(event) => setCategoryForm((prev) => ({ ...prev, description: event.target.value }))} className="w-full rounded-[12px] border border-[var(--color-border)] px-3 py-2 text-sm min-h-[80px]" placeholder="Optional description" />
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Icon Name (optional)</span>
                      <input value={categoryForm.iconName} onChange={(event) => setCategoryForm((prev) => ({ ...prev, iconName: event.target.value }))} className="w-full rounded-[12px] border border-[var(--color-border)] px-3 py-2 text-sm" placeholder="e.g. Bread" />
                    </label>

                    <div className="grid grid-cols-2 gap-2 items-end">
                      <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={categoryForm.active} onChange={(event) => setCategoryForm((prev) => ({ ...prev, active: event.target.checked }))} /> Active in system</label>
                      <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={!categoryForm.hiddenFromCustomer} onChange={(event) => setCategoryForm((prev) => ({ ...prev, hiddenFromCustomer: !event.target.checked }))} /> Visible to customers</label>
                    </div>
                  </section>

                  <section className="rounded-[16px] border border-[var(--color-border)] p-4 space-y-3">
                    <button onClick={() => setShowCategoryAdvanced((prev) => !prev)} className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-wider text-[var(--color-text-muted)]">
                      {showCategoryAdvanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      Advanced
                    </button>

                    {showCategoryAdvanced && (
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="space-y-1">
                          <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Slug</span>
                          <input value={categoryForm.slug} onChange={(event) => { setCategorySlugTouched(true); setCategoryForm((prev) => ({ ...prev, slug: slugify(event.target.value) })); }} className="w-full rounded-[12px] border border-[var(--color-border)] px-3 py-2 text-sm" />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Sort Order</span>
                          <input value={categoryForm.sortOrder} onChange={(event) => setCategoryForm((prev) => ({ ...prev, sortOrder: event.target.value }))} className="w-full rounded-[12px] border border-[var(--color-border)] px-3 py-2 text-sm" />
                        </label>

                        {editor.mode === 'cafe' ? (
                          <label className="space-y-1">
                            <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Category Group</span>
                            <select value={categoryForm.categoryGroup} onChange={(event) => setCategoryForm((prev) => ({ ...prev, categoryGroup: event.target.value as 'main' | 'bakery' }))} className="w-full rounded-[12px] border border-[var(--color-border)] px-3 py-2 text-sm">
                              <option value="main">Main</option>
                              <option value="bakery">Bakery (legacy)</option>
                            </select>
                          </label>
                        ) : (
                          <>
                            <label className="space-y-1">
                              <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Service Area Default</span>
                              <select value={categoryForm.serviceAreaDefault} onChange={(event) => setCategoryForm((prev) => ({ ...prev, serviceAreaDefault: event.target.value as 'cafe' | 'bakery' }))} className="w-full rounded-[12px] border border-[var(--color-border)] px-3 py-2 text-sm">
                                <option value="bakery">Bakery</option>
                                <option value="cafe">Cafe</option>
                              </select>
                            </label>
                            <label className="space-y-1">
                              <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Front Lane Default</span>
                              <select value={categoryForm.frontLaneDefault} onChange={(event) => setCategoryForm((prev) => ({ ...prev, frontLaneDefault: event.target.value as 'cafe_front' | 'bakery_front' }))} className="w-full rounded-[12px] border border-[var(--color-border)] px-3 py-2 text-sm">
                                <option value="bakery_front">Bakery Front</option>
                                <option value="cafe_front">Cafe Front</option>
                              </select>
                            </label>
                            <label className="space-y-1 md:col-span-2">
                              <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Dispatch Mode Default</span>
                              <select value={categoryForm.dispatchModeDefault} onChange={(event) => setCategoryForm((prev) => ({ ...prev, dispatchModeDefault: event.target.value as CategoryFormState['dispatchModeDefault'] }))} className="w-full rounded-[12px] border border-[var(--color-border)] px-3 py-2 text-sm">
                                <option value="bakery_front_only">Bakery Front Only</option>
                                <option value="front_only">Front Only</option>
                                <option value="station_prep">Station Prep</option>
                                <option value="mixed_split">Mixed Split</option>
                              </select>
                            </label>
                          </>
                        )}

                        <label className="space-y-1 md:col-span-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Internal ID</span>
                          <input value={editor.editorMode === 'edit' ? categoryForm.id : 'Auto-generated on save'} readOnly className="w-full rounded-[12px] border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-500" />
                        </label>
                      </div>
                    )}
                  </section>

                  {editor.editorMode === 'edit' && (
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => void archiveCategory((editor.mode === 'cafe' ? categories : bakeryCategories).find((entry) => entry.id === categoryForm.id) as MenuCategory | BakeryCategory)} className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] text-[var(--color-text-muted)] px-4 py-2 text-xs font-black uppercase tracking-wider">
                        <Archive className="w-3 h-3" />
                        Archive Category
                      </button>
                      <button onClick={() => void deleteCategory((editor.mode === 'cafe' ? categories : bakeryCategories).find((entry) => entry.id === categoryForm.id) as MenuCategory | BakeryCategory)} className="inline-flex items-center gap-2 rounded-full border border-red-300 text-red-700 px-4 py-2 text-xs font-black uppercase tracking-wider">
                        <Trash2 className="w-3 h-3" />
                        Delete Category
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <section className="space-y-3">
                    <h4 className="text-sm font-black uppercase tracking-widest text-[var(--color-text-muted)]">Section A: Basic Info</h4>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="space-y-1 md:col-span-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Item Name</span>
                        <input value={itemForm.name} onChange={(event) => { const nextName = event.target.value; setItemForm((prev) => ({ ...prev, name: nextName, slug: itemSlugTouched ? prev.slug : slugify(nextName) })); }} className="w-full rounded-[12px] border border-[var(--color-border)] px-3 py-2 text-sm" placeholder="Item name" />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Price (RWF)</span>
                        <input value={itemForm.price} onChange={(event) => setItemForm((prev) => ({ ...prev, price: event.target.value }))} className="w-full rounded-[12px] border border-[var(--color-border)] px-3 py-2 text-sm" placeholder="0" />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Category</span>
                        <select value={itemForm.categoryId} onChange={(event) => setItemForm((prev) => ({ ...prev, categoryId: event.target.value }))} className="w-full rounded-[12px] border border-[var(--color-border)] px-3 py-2 text-sm">
                          <option value="">Select category</option>
                          {activeCategories.map((category) => (
                            <option key={category.id} value={category.id}>{category.name}</option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1 md:col-span-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Short Description</span>
                        <input value={itemForm.shortDescription} onChange={(event) => setItemForm((prev) => ({ ...prev, shortDescription: event.target.value }))} className="w-full rounded-[12px] border border-[var(--color-border)] px-3 py-2 text-sm" />
                      </label>
                      <label className="space-y-1 md:col-span-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Full Description</span>
                        <textarea value={itemForm.fullDescription} onChange={(event) => setItemForm((prev) => ({ ...prev, fullDescription: event.target.value }))} className="w-full rounded-[12px] border border-[var(--color-border)] px-3 py-2 text-sm min-h-[96px]" />
                      </label>
                      <label className="space-y-1 md:col-span-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Image URL</span>
                        <input value={itemForm.imageUrl} onChange={(event) => setItemForm((prev) => ({ ...prev, imageUrl: event.target.value }))} className="w-full rounded-[12px] border border-[var(--color-border)] px-3 py-2 text-sm" />
                        <p className="text-[11px] text-[var(--color-text-muted)]">
                          Use a direct image link when possible (`jpg`, `png`, `webp`). Page links may not display correctly.
                        </p>
                        {showImageUrlHint && (
                          <p className="text-[11px] text-amber-700">
                            This link looks like a page URL, not a direct image URL. Item will still save, but customer image may fall back to placeholder.
                          </p>
                        )}
                      </label>
                    </div>
                  </section>

                  <section className="space-y-3">
                    <h4 className="text-sm font-black uppercase tracking-widest text-[var(--color-text-muted)]">Item Status</h4>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      Active: Item exists in system. Available: Item can be ordered right now. Visible: Item is shown to customers.
                    </p>
                    <div className="grid gap-2 md:grid-cols-2">
                      <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={itemForm.active} onChange={(event) => setItemForm((prev) => ({ ...prev, active: event.target.checked }))} /> Active in system</label>
                      {mode === 'cafe' && <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={itemForm.availableNow} onChange={(event) => setItemForm((prev) => ({ ...prev, availableNow: event.target.checked }))} /> Available now</label>}
                      <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={!itemForm.hiddenFromCustomer} onChange={(event) => setItemForm((prev) => ({ ...prev, hiddenFromCustomer: !event.target.checked }))} /> Visible to customers</label>
                      {mode === 'cafe' && <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={itemForm.featured} onChange={(event) => setItemForm((prev) => ({ ...prev, featured: event.target.checked }))} /> Featured</label>}
                    </div>
                  </section>

                  <section className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-black uppercase tracking-widest text-[var(--color-text-muted)]">Section C: Personalization</h4>
                      <button onClick={() => setShowPersonalization((prev) => !prev)} className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-wider text-[var(--color-text-muted)]">
                        {showPersonalization ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        {showPersonalization ? 'Collapse' : 'Expand'}
                      </button>
                    </div>
                    {showPersonalization && (
                    <div className="rounded-[16px] border border-[var(--color-border)] p-3 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-[var(--color-text-muted)]">Add modifier groups for choices like accompaniments, toppings, or drink options.</p>
                        <button onClick={addModifierGroup} className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] px-3 py-1 text-[10px] font-black uppercase tracking-wider"><Plus className="w-3 h-3" />Add Group</button>
                      </div>

                      {itemForm.modifierGroups.map((group) => (
                        <div key={group.id} className="rounded-[12px] border border-[var(--color-border)] p-2 space-y-2">
                          <div className="flex items-center justify-between">
                            <button
                              onClick={() => setCollapsedModifierGroups((prev) => ({ ...prev, [group.id]: !prev[group.id] }))}
                              className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-wider text-[var(--color-text-muted)]"
                            >
                              {collapsedModifierGroups[group.id] ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              {group.name || 'Unnamed Group'}
                            </button>
                            <button onClick={() => removeModifierGroup(group.id)} className="inline-flex items-center gap-1 rounded-full border border-red-200 text-red-700 px-2 py-1 text-[10px] font-black uppercase tracking-wider"><Trash2 className="w-3 h-3" />Remove</button>
                          </div>

                          {!collapsedModifierGroups[group.id] && (
                          <div className="grid gap-2 md:grid-cols-2">
                            <label className="space-y-1 md:col-span-2">
                              <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Group Name</span>
                              <input value={group.name} onChange={(event) => updateModifierGroup(group.id, { name: event.target.value })} className="w-full rounded-[10px] border border-[var(--color-border)] px-3 py-2 text-sm" placeholder="Choose any 2 accompaniments" />
                            </label>
                            <label className="space-y-1">
                              <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Selection Type</span>
                              <select value={group.selectionType} onChange={(event) => updateModifierGroup(group.id, { selectionType: event.target.value as 'single' | 'multiple' })} className="w-full rounded-[10px] border border-[var(--color-border)] px-3 py-2 text-sm">
                                <option value="single">single</option>
                                <option value="multiple">multi</option>
                              </select>
                            </label>
                            <label className="space-y-1">
                              <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Required</span>
                              <select value={group.required ? 'yes' : 'no'} onChange={(event) => updateModifierGroup(group.id, { required: event.target.value === 'yes' })} className="w-full rounded-[10px] border border-[var(--color-border)] px-3 py-2 text-sm">
                                <option value="no">No</option>
                                <option value="yes">Yes</option>
                              </select>
                            </label>
                            <label className="space-y-1">
                              <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Min Selections</span>
                              <input value={group.minSelections} onChange={(event) => updateModifierGroup(group.id, { minSelections: event.target.value })} className="w-full rounded-[10px] border border-[var(--color-border)] px-3 py-2 text-sm" />
                            </label>
                            <label className="space-y-1">
                              <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Max Selections</span>
                              <input value={group.maxSelections} onChange={(event) => updateModifierGroup(group.id, { maxSelections: event.target.value })} className="w-full rounded-[10px] border border-[var(--color-border)] px-3 py-2 text-sm" />
                            </label>
                          </div>
                          )}

                          {!collapsedModifierGroups[group.id] && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Options</p>
                              <button onClick={() => addModifierOption(group.id)} className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] px-3 py-1 text-[10px] font-black uppercase tracking-wider"><Plus className="w-3 h-3" />Add Option</button>
                            </div>

                            {group.options.map((option) => (
                              <div key={option.id} className="grid gap-2 grid-cols-12 rounded-[10px] border border-[var(--color-border)] p-2 items-center">
                                <input
                                  value={option.name}
                                  onChange={(event) => updateModifierOption(group.id, option.id, { name: event.target.value })}
                                  className="col-span-6 rounded-[8px] border border-[var(--color-border)] px-2 py-1.5 text-sm"
                                  placeholder="Option Name"
                                />
                                <input
                                  value={option.priceDelta}
                                  onChange={(event) => updateModifierOption(group.id, option.id, { priceDelta: event.target.value })}
                                  className="col-span-3 rounded-[8px] border border-[var(--color-border)] px-2 py-1.5 text-sm"
                                  placeholder="Extra Price"
                                />
                                <label className="col-span-2 inline-flex items-center gap-1 text-xs"><input type="checkbox" checked={option.active} onChange={(event) => updateModifierOption(group.id, option.id, { active: event.target.checked })} /> Active</label>
                                <button onClick={() => removeModifierOption(group.id, option.id)} className="col-span-1 inline-flex items-center justify-center rounded-full border border-red-200 text-red-700 p-1"><Trash2 className="w-3 h-3" /></button>
                              </div>
                            ))}
                          </div>
                          )}
                        </div>
                      ))}

                      {itemForm.modifierGroups.length === 0 && <p className="text-xs text-[var(--color-text-muted)]">No modifier groups added.</p>}

                      <div className="grid gap-2 md:grid-cols-2">
                        <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={itemForm.prepInstructionsEnabled} onChange={(event) => setItemForm((prev) => ({ ...prev, prepInstructionsEnabled: event.target.checked }))} /> Enable free-text preparation instructions</label>
                        <label className="space-y-1">
                          <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Preparation Instructions Label</span>
                          <input value={itemForm.prepInstructionsLabel} onChange={(event) => setItemForm((prev) => ({ ...prev, prepInstructionsLabel: event.target.value }))} className="w-full rounded-[10px] border border-[var(--color-border)] px-3 py-2 text-sm" disabled={!itemForm.prepInstructionsEnabled} />
                        </label>
                      </div>
                    </div>
                    )}
                  </section>

                  <section className="space-y-2">
                    <button onClick={() => setShowItemOperations((prev) => !prev)} className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-wider text-[var(--color-text-muted)]">
                      {showItemOperations ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      Section D: Operations
                    </button>
                    {showItemOperations && (
                    <>
                    <p className="text-xs text-[var(--color-text-muted)]">Prep Station = where item is prepared. Fulfillment Mode = ready to serve or made to order. Service Area = operational domain ownership.</p>
                    <div className="grid gap-3 md:grid-cols-3">
                      <label className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Prep Station</span>
                        <select value={itemForm.prepStation} onChange={(event) => setItemForm((prev) => ({ ...prev, prepStation: event.target.value as ItemFormState['prepStation'] }))} className="w-full rounded-[12px] border border-[var(--color-border)] px-3 py-2 text-sm">
                          <option value="kitchen">Kitchen</option>
                          <option value="barista">Barista</option>
                          <option value="front">Front</option>
                          <option value="none">None</option>
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Fulfillment Mode</span>
                        <select value={itemForm.fulfillmentMode} onChange={(event) => setItemForm((prev) => ({ ...prev, fulfillmentMode: event.target.value as ItemFormState['fulfillmentMode'] }))} className="w-full rounded-[12px] border border-[var(--color-border)] px-3 py-2 text-sm">
                          <option value="made_to_order">made_to_order</option>
                          <option value="ready_to_serve">ready_to_serve</option>
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Service Area</span>
                        <select value={itemForm.serviceArea} onChange={(event) => setItemForm((prev) => ({ ...prev, serviceArea: event.target.value as ItemFormState['serviceArea'] }))} className="w-full rounded-[12px] border border-[var(--color-border)] px-3 py-2 text-sm">
                          <option value="cafe">Cafe</option>
                          <option value="bakery">Bakery</option>
                        </select>
                      </label>
                    </div>
                    </>
                    )}
                  </section>

                  <section className="rounded-[16px] border border-[var(--color-border)] p-4 space-y-3">
                    <button onClick={() => setShowItemAdvanced((prev) => !prev)} className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-wider text-[var(--color-text-muted)]">
                      {showItemAdvanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      Section E: Advanced
                    </button>
                    {showItemAdvanced && (
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="space-y-1">
                          <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Slug</span>
                          <input value={itemForm.slug} onChange={(event) => { setItemSlugTouched(true); setItemForm((prev) => ({ ...prev, slug: slugify(event.target.value) })); }} className="w-full rounded-[12px] border border-[var(--color-border)] px-3 py-2 text-sm" />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">SKU</span>
                          <input value={itemForm.sku} onChange={(event) => setItemForm((prev) => ({ ...prev, sku: event.target.value }))} className="w-full rounded-[12px] border border-[var(--color-border)] px-3 py-2 text-sm" />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Sort Order</span>
                          <input value={itemForm.sortOrder} onChange={(event) => setItemForm((prev) => ({ ...prev, sortOrder: event.target.value }))} className="w-full rounded-[12px] border border-[var(--color-border)] px-3 py-2 text-sm" />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Item Type</span>
                          <select value={itemForm.itemType} onChange={(event) => setItemForm((prev) => ({ ...prev, itemType: event.target.value as ItemFormState['itemType'] }))} className="w-full rounded-[12px] border border-[var(--color-border)] px-3 py-2 text-sm">
                            <option value="simple">simple</option>
                            <option value="variant">variant</option>
                            <option value="configurable">configurable</option>
                            <option value="composite">composite</option>
                            {mode === 'bakery' && <option value="bread">bread</option>}
                            {mode === 'bakery' && <option value="whole_cake">whole_cake</option>}
                            {mode === 'bakery' && <option value="slice">slice</option>}
                            {mode === 'bakery' && <option value="pastry">pastry</option>}
                          </select>
                        </label>
                        {mode === 'cafe' && (
                          <label className="space-y-1">
                            <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Legacy Station (compatibility)</span>
                            <select value={itemForm.station} onChange={(event) => setItemForm((prev) => ({ ...prev, station: event.target.value as ItemFormState['station'] }))} className="w-full rounded-[12px] border border-[var(--color-border)] px-3 py-2 text-sm">
                              <option value="kitchen">kitchen</option>
                              <option value="barista">barista</option>
                              <option value="front_service">front_service</option>
                              <option value="bakery">bakery</option>
                              <option value="bar">bar</option>
                              <option value="coffee">coffee</option>
                            </select>
                          </label>
                        )}
                        <label className="space-y-1 md:col-span-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Internal ID</span>
                          <input value={editor.editorMode === 'edit' ? itemForm.id : 'Auto-generated on save'} readOnly className="w-full rounded-[12px] border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-500" />
                        </label>
                      </div>
                    )}
                  </section>

                  {editor.editorMode === 'edit' && (
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => void archiveItem((mode === 'cafe' ? menuItems : bakeryItems).find((entry) => entry.id === itemForm.id) as MenuItem | BakeryItem)} className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] text-[var(--color-text-muted)] px-4 py-2 text-xs font-black uppercase tracking-wider">
                        <Archive className="w-3 h-3" />
                        Archive Item
                      </button>
                      <button onClick={() => void deleteItem((mode === 'cafe' ? menuItems : bakeryItems).find((entry) => entry.id === itemForm.id) as MenuItem | BakeryItem)} className="inline-flex items-center gap-2 rounded-full border border-red-300 text-red-700 px-4 py-2 text-xs font-black uppercase tracking-wider">
                        <Trash2 className="w-3 h-3" />
                        Delete Item
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
