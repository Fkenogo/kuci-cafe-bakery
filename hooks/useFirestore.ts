import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, where, doc } from 'firebase/firestore';
import { BakeryCategory, BakeryItem, Category, MenuItem, RestaurantSettings } from '../types';
import { normalizeBakeryCategory, normalizeBakeryItem, normalizeMenuItem, normalizeRestaurantSettings } from '../lib/catalog';

export function useRestaurantData() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [bakeryCategories, setBakeryCategories] = useState<BakeryCategory[]>([]);
  const [bakeryItems, setBakeryItems] = useState<BakeryItem[]>([]);
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    
    // Fetch Settings
    const unsubSettings = onSnapshot(doc(db, 'settings', 'restaurant'), (doc) => {
      if (doc.exists()) {
        setSettings(normalizeRestaurantSettings(doc.data() as RestaurantSettings));
      }
    }, (err) => setError(err.message));

    // Fetch Categories
    const unsubCategories = onSnapshot(query(collection(db, 'categories'), where('active', '==', true)), (snapshot) => {
      const cats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));
      setCategories(cats.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)));
    }, (err) => setError(err.message));

    // Fetch Menu Items from Firestore menu collection
    const unsubMenuItems = onSnapshot(query(collection(db, 'menu'), where('isAvailable', '==', true)), (snapshot) => {
      const items = snapshot.docs.flatMap((menuDoc) => {
        const normalizedItem = normalizeMenuItem({ id: menuDoc.id, ...menuDoc.data() }, `firestore menu/${menuDoc.id}`);
        return normalizedItem ? [normalizedItem as MenuItem] : [];
      });
      setMenuItems(items.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)));
      console.log('[menu] Loaded menu documents from Firestore:', snapshot.size);
    }, (err) => {
      setError(err.message);
    });

    const unsubBakeryCategories = onSnapshot(query(collection(db, 'bakeryCategories'), where('active', '==', true)), (snapshot) => {
      const items = snapshot.docs.flatMap((categoryDoc) => {
        const normalized = normalizeBakeryCategory({ id: categoryDoc.id, ...categoryDoc.data() }, `firestore bakeryCategories/${categoryDoc.id}`);
        return normalized ? [normalized] : [];
      });
      setBakeryCategories(items.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)));
    }, (err) => setError(err.message));

    const unsubBakeryItems = onSnapshot(query(collection(db, 'bakeryItems'), where('active', '==', true)), (snapshot) => {
      const items = snapshot.docs.flatMap((itemDoc) => {
        const normalized = normalizeBakeryItem({ id: itemDoc.id, ...itemDoc.data() }, `firestore bakeryItems/${itemDoc.id}`);
        return normalized ? [normalized] : [];
      });
      setBakeryItems(items.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)));
      setLoading(false);
    }, (err) => {
      setError(err.message);
      setLoading(false);
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
