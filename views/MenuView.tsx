
import React, { useState, useMemo } from 'react';
import { Plus, Info, Heart, Star, Utensils, Coffee, Pizza, Wine, GlassWater, Sandwich, Flame, Milk, Cherry, IceCream, Salad, Beer } from 'lucide-react';
import { Category, MenuItem, ItemCustomization } from '../types';
import { CustomizerModal } from '../components/CustomizerModal';
import { getMenuItemCategoryId, getMenuItemPriceLabel } from '../lib/catalog';

interface MenuViewProps {
  addToCart: (item: MenuItem, customization?: ItemCustomization) => void;
  wishlist: MenuItem[];
  toggleWishlist: (item: MenuItem) => void;
  menuItems: MenuItem[];
  categories: Category[];
  selectedCategory: Category | null;
  setSelectedCategory: (cat: Category) => void;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  Utensils: <Utensils className="w-5 h-5" />,
  Coffee: <Coffee className="w-5 h-5" />,
  Soup: <Utensils className="w-5 h-5" />, // Fallback
  Pizza: <Pizza className="w-5 h-5" />,
  Cookie: <Utensils className="w-5 h-5" />, // Fallback
  Wine: <Wine className="w-5 h-5" />,
  GlassWater: <GlassWater className="w-5 h-5" />,
  Sandwich: <Sandwich className="w-5 h-5" />,
  Flame: <Flame className="w-5 h-5" />,
  Milk: <Milk className="w-5 h-5" />,
  Cherry: <Cherry className="w-5 h-5" />,
  IceCream: <IceCream className="w-5 h-5" />,
  Salad: <Salad className="w-5 h-5" />,
  Beer: <Beer className="w-5 h-5" />,
};

export const MenuView: React.FC<MenuViewProps> = ({ 
  addToCart, 
  wishlist, 
  toggleWishlist, 
  menuItems, 
  categories,
  selectedCategory,
  setSelectedCategory
}) => {
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);

  const activeCategory = selectedCategory || categories[0];

  const filteredItems = useMemo(() => {
    if (!activeCategory) return [];
    return menuItems.filter(item => getMenuItemCategoryId(item) === activeCategory.id);
  }, [activeCategory, menuItems]);

  const handleCustomizationConfirm = (item: MenuItem, customization: ItemCustomization) => {
    addToCart(item, customization);
    setCustomizingItem(null);
  };

  const isInWishlist = (id: string) => wishlist.some(i => i.id === id);

  const getCategoryIcon = (id: string) => {
    const iconName = categories.find(c => c.id === id)?.iconName;
    return (iconName && ICON_MAP[iconName]) || <Utensils className="w-5 h-5" />;
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500">
      <CustomizerModal 
        item={customizingItem}
        onClose={() => setCustomizingItem(null)}
        onConfirm={handleCustomizationConfirm}
      />

      <div className="sticky top-16 z-30 bg-[var(--color-bg)]/95 backdrop-blur-md border-b border-[var(--color-border)] py-4">
        <div className="flex gap-3 overflow-x-auto no-scrollbar px-4">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat)}
              className={`flex-shrink-0 px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${
                activeCategory?.id === cat.id 
                  ? 'bg-[var(--color-primary)] text-white shadow-lg shadow-[var(--color-primary)]/20' 
                  : 'bg-[var(--color-bg)] text-[var(--color-text)] border border-[var(--color-border)]'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-6 space-y-6">
        {activeCategory && (
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-[var(--color-primary)]/10 text-[var(--color-primary)] rounded-xl">
              {getCategoryIcon(activeCategory.id)}
            </div>
            <h2 className="text-2xl font-serif">{activeCategory.name}</h2>
          </div>
        )}

        <div className="space-y-4">
          {filteredItems.length > 0 ? (
            filteredItems.map((item) => (
              <div 
                key={item.id} 
                className="bg-[var(--color-bg)] rounded-3xl p-4 shadow-sm border border-[var(--color-border)] flex flex-col gap-3 group active:scale-[0.98] transition-transform relative"
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-[var(--color-text)] text-lg leading-tight uppercase font-serif tracking-tight">{item.name}</h4>
                      {item.averageRating && (
                        <div className="flex items-center gap-0.5 bg-[var(--color-rating)]/10 px-2 py-0.5 rounded-lg border border-[var(--color-rating)]/20">
                          <Star className="w-2.5 h-2.5 text-[var(--color-rating)] fill-[var(--color-rating)]" />
                          <span className="text-[10px] font-black text-[var(--color-rating)]">{item.averageRating.toFixed(1)}</span>
                        </div>
                      )}
                    </div>
                    {item.tagline && (
                      <p className="text-[var(--color-primary)] text-[10px] font-bold uppercase tracking-widest mt-1">
                        {item.tagline}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="font-bold text-[var(--color-primary)] whitespace-nowrap">
                      {getMenuItemPriceLabel(item)}
                    </span>
                    <button 
                      onClick={() => toggleWishlist(item)}
                      className={`p-2 rounded-full transition-all active:scale-75 ${isInWishlist(item.id) ? 'text-[var(--color-wishlist)] bg-[var(--color-wishlist)]/10' : 'text-[var(--color-text-muted)]/40 bg-[var(--color-bg-secondary)]/30'}`}
                    >
                      <Heart className={`w-4 h-4 ${isInWishlist(item.id) ? 'fill-current' : ''}`} />
                    </button>
                  </div>
                </div>

                <p className="text-[var(--color-text-muted)] text-sm leading-relaxed italic">
                  "{item.description}"
                </p>

                {item.note && (
                  <div className="bg-[var(--color-border)]/50 p-2.5 rounded-xl text-[10px] text-[var(--color-text)]/70 font-bold uppercase tracking-tighter flex gap-2">
                    <Info className="w-3 h-3 shrink-0" />
                    <span>{item.note}</span>
                  </div>
                )}

                <button 
                  onClick={() => setCustomizingItem(item)}
                  className="mt-2 w-full flex items-center justify-center gap-2 bg-[var(--color-text)] text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all hover:bg-[var(--color-text)]/90 active:bg-[var(--color-primary)] active:scale-95 hover:scale-[1.01] shadow-sm animate-in slide-in-from-bottom-2 duration-300"
                >
                  <Plus className="w-4 h-4" />
                  Add to Order
                </button>
              </div>
            ))
          ) : (
            <div className="text-center py-20 bg-[var(--color-primary)]/5 rounded-[40px] border-2 border-dashed border-[var(--color-border)]">
              <p className="text-[var(--color-text-muted)] italic">No items found in this category.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
