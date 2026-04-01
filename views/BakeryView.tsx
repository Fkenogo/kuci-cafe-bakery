import React, { useMemo, useState } from 'react';
import { Cake, Coffee, Croissant, MessageCircle, Plus, Sandwich } from 'lucide-react';
import { CONTACT_INFO } from '../constants';
import { BakeryCategory, BakeryItem, Category, ItemCustomization, MenuItem } from '../types';
import { adaptBakeryItemToMenuItem, getMenuItemPriceLabel, getMenuItemPrimaryImage } from '../lib/catalog';
import { CustomizerModal } from '../components/CustomizerModal';
import { SafeImage } from '../components/SafeImage';

interface BakeryViewProps {
  bakeryCategories: BakeryCategory[];
  bakeryItems: BakeryItem[];
  addToCart: (item: MenuItem, customization?: ItemCustomization) => void;
  menuCategories: Category[];
}

export const BakeryView: React.FC<BakeryViewProps> = ({
  bakeryCategories,
  bakeryItems,
  addToCart,
  menuCategories,
}) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedBakeryItem, setSelectedBakeryItem] = useState<BakeryItem | null>(null);

  const activeCategory = useMemo(() => {
    if (bakeryCategories.length === 0) return null;
    if (!selectedCategoryId) return bakeryCategories[0];
    return bakeryCategories.find((category) => category.id === selectedCategoryId) || bakeryCategories[0];
  }, [bakeryCategories, selectedCategoryId]);

  const categoryMap = useMemo(() => {
    return bakeryCategories.reduce((acc: Record<string, BakeryCategory>, category) => {
      acc[category.id] = category;
      return acc;
    }, {} as Record<string, BakeryCategory>);
  }, [bakeryCategories]);

  const activeItems = useMemo(() => {
    if (!activeCategory) return [];
    return bakeryItems.filter((item) => item.bakeryCategoryId === activeCategory.id);
  }, [bakeryItems, activeCategory]);

  const menuItemForModal = useMemo(() => {
    if (!selectedBakeryItem) return null;
    const category = categoryMap[selectedBakeryItem.bakeryCategoryId];
    return adaptBakeryItemToMenuItem(selectedBakeryItem, category);
  }, [selectedBakeryItem, categoryMap]);

  const handleCustomizationConfirm = (item: MenuItem, customization: ItemCustomization) => {
    addToCart(item, customization);
    setSelectedBakeryItem(null);
  };

  const getCategoryIcon = (categoryId: string) => {
    if (categoryId === 'breads') return <Sandwich className="w-6 h-6" />;
    if (categoryId === 'cakes') return <Cake className="w-6 h-6" />;
    if (categoryId === 'pastries-snacks') return <Croissant className="w-6 h-6" />;
    if (categoryId === 'breakfast-light-bites') return <Coffee className="w-6 h-6" />;
    return <Sandwich className="w-6 h-6" />;
  };

  const whatsappMessage = encodeURIComponent("Hello Kuci! What are today’s fresh bakery and pastry selections?");

  return (
    <div className="px-4 py-8 space-y-8 animate-in slide-in-from-right-4 duration-500">
      <CustomizerModal
        item={menuItemForModal}
        onClose={() => setSelectedBakeryItem(null)}
        onConfirm={handleCustomizationConfirm}
      />

      <header className="text-center space-y-2">
        <h2 className="text-3xl font-serif">Bakery & Pastries</h2>
        <p className="text-[var(--color-primary)] font-bold uppercase tracking-widest text-xs">Freshly baked daily</p>
      </header>

      <section className="space-y-4">
        <h3 className="text-lg font-serif px-1">Bakery Categories</h3>
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
          {bakeryCategories.map((category) => {
            const isActive = activeCategory?.id === category.id;
            return (
              <button
                key={category.id}
                onClick={() => setSelectedCategoryId(category.id)}
                className={`flex-shrink-0 px-4 py-3 rounded-2xl border transition-all text-left min-w-[180px] ${
                  isActive
                    ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)] shadow-lg shadow-[var(--color-primary)]/20'
                    : 'bg-[var(--color-bg)] text-[var(--color-text)] border-[var(--color-border)]'
                }`}
              >
                <div className="flex items-center gap-3">
                  {getCategoryIcon(category.id)}
                  <div>
                    <p className="text-sm font-bold">{category.name}</p>
                    {category.description && (
                      <p className={`text-[10px] ${isActive ? 'text-white/80' : 'text-[var(--color-text-muted)]'}`}>
                        {category.description}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-lg font-serif">
            {activeCategory ? activeCategory.name : 'Bakery Items'}
          </h3>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">
            {activeItems.length} items
          </p>
        </div>

        {activeItems.length > 0 ? (
          <div className="space-y-4">
            {activeItems.map((item) => {
              const menuItem = adaptBakeryItemToMenuItem(item, categoryMap[item.bakeryCategoryId]);
              const isMadeToOrder = item.fulfillmentMode === 'made_to_order';

              return (
                <div key={item.id} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-3xl p-4 shadow-sm space-y-3">
                  <div className="flex gap-4">
                    <SafeImage
                      src={getMenuItemPrimaryImage(menuItem, menuCategories)}
                      alt={item.name}
                      className="w-20 h-20 rounded-2xl object-cover"
                      fallbackLabel="KUCI"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <h4 className="text-lg font-serif uppercase leading-tight">{item.name}</h4>
                        <span className="text-[var(--color-primary)] font-bold text-sm whitespace-nowrap">
                          {getMenuItemPriceLabel(menuItem)}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--color-text-muted)] italic line-clamp-2">"{item.description}"</p>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)] mt-2">
                        {isMadeToOrder ? 'Made to order' : 'Ready to serve'}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedBakeryItem(item)}
                    className="w-full flex items-center justify-center gap-2 bg-[var(--color-text)] text-white py-3.5 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                    View & Add
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 bg-[var(--color-primary)]/5 rounded-[40px] border-2 border-dashed border-[var(--color-border)]">
            <p className="text-[var(--color-text-muted)] italic">No bakery items found in this category yet.</p>
          </div>
        )}
      </section>

      <section className="bg-[var(--color-border)] rounded-[32px] p-8 text-center space-y-6">
        <p className="text-[var(--color-text)] text-sm font-medium leading-relaxed">
          “Pastry selection varies daily. Ask on WhatsApp for today’s fresh bakes.”
        </p>
        <a
          href={`https://wa.me/${CONTACT_INFO.whatsapp}?text=${whatsappMessage}`}
          className="inline-flex items-center justify-center gap-3 bg-[var(--color-whatsapp)] text-white px-8 py-4 rounded-full font-bold shadow-lg shadow-[var(--color-whatsapp)]/20 hover:scale-105 active:scale-95 transition-all w-full"
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageCircle className="w-5 h-5" />
          Ask Today’s Specials
        </a>
      </section>
    </div>
  );
};
