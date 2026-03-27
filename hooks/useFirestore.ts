import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, where, doc, getDoc } from 'firebase/firestore';
import { Category, MenuItem, RestaurantSettings } from '../types';

export function useRestaurantData() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    
    // Fetch Settings
    const unsubSettings = onSnapshot(doc(db, 'settings', 'restaurant'), (doc) => {
      if (doc.exists()) {
        setSettings(doc.data() as RestaurantSettings);
      }
    }, (err) => setError(err.message));

    // Fetch Categories
    const unsubCategories = onSnapshot(query(collection(db, 'categories'), where('active', '==', true)), (snapshot) => {
      const cats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));
      setCategories(cats.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)));
    }, (err) => setError(err.message));

    // Fetch Menu Items
    const unsubMenuItems = onSnapshot(query(collection(db, 'menuItems'), where('available', '==', true)), (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuItem));
      setMenuItems(items.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)));
      setLoading(false);
    }, (err) => {
      setError(err.message);
      setLoading(false);
    });

    return () => {
      unsubSettings();
      unsubCategories();
      unsubMenuItems();
    };
  }, []);

  return { categories, menuItems, settings, loading, error };
}
