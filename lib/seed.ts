import { db } from './firebase';
import { collection, doc, setDoc, addDoc, getDocs, query, limit } from 'firebase/firestore';
import { SEED_CATEGORIES, SEED_SETTINGS, SEED_MENU_ITEMS } from './seedData';

export const seedFirestore = async () => {
  try {
    // Check if already seeded
    const categoriesSnap = await getDocs(query(collection(db, 'categories'), limit(1)));
    if (!categoriesSnap.empty) {
      console.log('Firestore already seeded.');
      return;
    }

    console.log('Starting Firestore seed...');

    // 1. Seed Settings
    await setDoc(doc(db, 'settings', 'restaurant'), SEED_SETTINGS);
    console.log('Settings seeded.');

    // 2. Seed Categories and map names to IDs
    const categoryMap: Record<string, string> = {};
    for (const cat of SEED_CATEGORIES) {
      const docRef = await addDoc(collection(db, 'categories'), cat);
      categoryMap[cat.name!] = docRef.id;
    }
    console.log('Categories seeded.');

    // 3. Seed Menu Items with mapped category IDs
    for (const item of SEED_MENU_ITEMS) {
      const categoryId = categoryMap[item.category!];
      if (categoryId) {
        await addDoc(collection(db, 'menuItems'), {
          ...item,
          category: categoryId
        });
      }
    }
    console.log('Menu items seeded.');
    console.log('Firestore seed complete!');
  } catch (error) {
    console.error('Error seeding Firestore:', error);
  }
};
