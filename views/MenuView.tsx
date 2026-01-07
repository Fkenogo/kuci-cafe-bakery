
import React, { useState, useMemo } from 'react';
import { Plus, ShoppingCart } from 'lucide-react';
import { MENU_ITEMS, CATEGORY_ICONS } from '../constants';
import { Category, MenuItem } from '../types';

interface MenuViewProps {
  addToCart: (item: MenuItem) => void;
}

const CATEGORIES: Category[] = [
  "Signature Meals", "Kuci Omelettes", "Kuci Salads", "Kuci Desserts", 
  "Kuci Burgers", "Kuci Soups", "Kuci Sandwiches", "Bites", 
  "Kuci Pasta", "Kuci Sizzling", "Kuci Toast", "Kuci Pizza", 
  "Fresh Juice", "Café Signature Cocktails", "Kuci Wines & Spirits", 
  "Beverages", "Smoothies", "Frappe", "Milk Shake", "Kuci Teas", 
  "Iced Espresso & Coffee", "Kuci Breakfast", "Coffee & Espresso"
];

export const MenuView: React.FC<MenuViewProps> = ({ addToCart }) => {
  const [selectedCategory, setSelectedCategory] = useState<Category>(CATEGORIES[0]);

  const filteredItems = useMemo(() => {
    return MENU_ITEMS.filter(item => item.category === selectedCategory);
  }, [selectedCategory]);

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500">
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

        {filteredItems.length > 0 ? (
          <div className="space-y-4">
            {filteredItems.map((item) => (
              <div 
                key={item.id} 
                className="bg-white rounded-3xl p-4 shadow-sm border border-[#f5f5dc] flex flex-col gap-3 group active:scale-[0.98] transition-transform"
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <h4 className="font-bold text-[#3e2723] text-lg leading-tight">{item.name}</h4>
                    {item.tagline && (
                      <p className="text-[#f97316] text-[10px] font-bold uppercase tracking-widest mt-1">
                        {item.tagline}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-[#f97316] whitespace-nowrap">
                      {item.price.toLocaleString()} RWF
                    </span>
                  </div>
                </div>

                <p className="text-gray-500 text-sm leading-relaxed italic">
                  "{item.description}"
                </p>

                {item.note && (
                  <div className="bg-[#f5f5dc]/50 p-2 rounded-lg text-[10px] text-[#3e2723]/70 font-medium">
                    {item.note}
                  </div>
                )}

                <button 
                  onClick={() => addToCart(item)}
                  className="mt-2 w-full flex items-center justify-center gap-2 bg-[#3e2723] text-white py-3 rounded-2xl font-bold transition-all hover:bg-[#3e2723]/90 active:bg-[#f97316]"
                >
                  <Plus className="w-4 h-4" />
                  Add to Order
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-20 text-center space-y-4">
            <div className="w-16 h-16 bg-[#f5f5dc] rounded-full flex items-center justify-center mx-auto">
              <ShoppingCart className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-400 font-medium italic">Oops! No items in this section today.</p>
          </div>
        )}
      </div>
    </div>
  );
};
