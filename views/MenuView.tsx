
import React, { useState, useMemo } from 'react';
import { Plus, Info, Heart } from 'lucide-react';
import { MENU_ITEMS, CATEGORY_ICONS } from '../constants';
import { Category, MenuItem, ItemCustomization } from '../types';
import { CustomizerModal } from '../components/CustomizerModal';

interface MenuViewProps {
  addToCart: (item: MenuItem, customization?: ItemCustomization) => void;
  wishlist: MenuItem[];
  toggleWishlist: (item: MenuItem) => void;
}

const CATEGORIES: Category[] = [
  "Signature Meals", "Kuci Omelettes", "Kuci Salads", "Kuci Desserts", 
  "Kuci Burgers", "Kuci Soups", "Kuci Sandwiches", "Bites", 
  "Kuci Pasta", "Kuci Sizzling", "Kuci Toast", "Kuci Pizza", 
  "Fresh Juice", "Café Signature Cocktails", "Kuci Wines & Spirits", 
  "Beverages", "Smoothies", "Frappe", "Milk Shake", "Kuci Teas", 
  "Iced Espresso & Coffee", "Kuci Breakfast", "Coffee & Espresso"
];

export const MenuView: React.FC<MenuViewProps> = ({ addToCart, wishlist, toggleWishlist }) => {
  const [selectedCategory, setSelectedCategory] = useState<Category>(CATEGORIES[0]);
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);

  const filteredItems = useMemo(() => {
    return MENU_ITEMS.filter(item => item.category === selectedCategory);
  }, [selectedCategory]);

  const handleCustomizationConfirm = (item: MenuItem, customization: ItemCustomization) => {
    addToCart(item, customization);
    setCustomizingItem(null);
  };

  const isInWishlist = (id: string) => wishlist.some(i => i.id === id);

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500">
      <CustomizerModal 
        item={customizingItem}
        onClose={() => setCustomizingItem(null)}
        onConfirm={handleCustomizationConfirm}
      />

      {/* Sticky Category Filter */}
      <div className="sticky top-16 z-30 bg-[#fffdfa]/95 backdrop-blur-md border-b border-[#f5f5dc] py-4">
        <div className="flex gap-3 overflow-x-auto no-scrollbar px-4">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`flex-shrink-0 px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${
                selectedCategory === cat 
                  ? 'bg-[#f97316] text-white shadow-lg shadow-orange-200' 
                  : 'bg-white text-[#3e2723] border border-[#f5f5dc]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Menu List */}
      <div className="px-4 py-6 space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-orange-100 text-[#f97316] rounded-xl">
            {CATEGORY_ICONS[selectedCategory]}
          </div>
          <h2 className="text-2xl font-serif">{selectedCategory}</h2>
        </div>

        <div className="space-y-4">
          {filteredItems.map((item) => (
            <div 
              key={item.id} 
              className="bg-white rounded-3xl p-4 shadow-sm border border-[#f5f5dc] flex flex-col gap-3 group active:scale-[0.98] transition-transform relative"
            >
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1">
                  <h4 className="font-bold text-[#3e2723] text-lg leading-tight uppercase font-serif tracking-tight">{item.name}</h4>
                  {item.tagline && (
                    <p className="text-[#f97316] text-[10px] font-bold uppercase tracking-widest mt-1">
                      {item.tagline}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="font-bold text-[#f97316] whitespace-nowrap">
                    {item.price.toLocaleString()} RWF
                  </span>
                  <button 
                    onClick={() => toggleWishlist(item)}
                    className={`p-2 rounded-full transition-all active:scale-75 ${isInWishlist(item.id) ? 'text-red-500 bg-red-50' : 'text-gray-300 bg-gray-50'}`}
                  >
                    <Heart className={`w-4 h-4 ${isInWishlist(item.id) ? 'fill-current' : ''}`} />
                  </button>
                </div>
              </div>

              <p className="text-gray-500 text-sm leading-relaxed italic">
                "{item.description}"
              </p>

              {item.note && (
                <div className="bg-[#f5f5dc]/50 p-2.5 rounded-xl text-[10px] text-[#3e2723]/70 font-bold uppercase tracking-tighter flex gap-2">
                  <Info className="w-3 h-3 shrink-0" />
                  <span>{item.note}</span>
                </div>
              )}

              <button 
                onClick={() => setCustomizingItem(item)}
                className="mt-2 w-full flex items-center justify-center gap-2 bg-[#3e2723] text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all hover:bg-[#3e2723]/90 active:bg-[#f97316] active:scale-95 hover:scale-[1.01] shadow-sm animate-in slide-in-from-bottom-2 duration-300"
              >
                <Plus className="w-4 h-4" />
                Add to Order
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
