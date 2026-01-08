
import React, { useState, useMemo } from 'react';
import { Plus, ShoppingCart, X, Check, Utensils, Pizza as PizzaIcon, Edit3, MessageSquare, Info } from 'lucide-react';
import { MENU_ITEMS, CATEGORY_ICONS, CUSTOMIZATION_OPTIONS, EXTRA_COSTS, ACCOMPANIMENTS_NOTE } from '../constants';
import { Category, MenuItem, ItemCustomization } from '../types';

interface MenuViewProps {
  addToCart: (item: MenuItem, customization?: ItemCustomization) => void;
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
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);

  // Customization state
  const [selectedSides, setSelectedSides] = useState<string[]>([]);
  const [selectedToppings, setSelectedToppings] = useState<string[]>([]);
  const [extra1, setExtra1] = useState("");
  const [extra2, setExtra2] = useState("");
  const [instructions, setInstructions] = useState("");

  const filteredItems = useMemo(() => {
    return MENU_ITEMS.filter(item => item.category === selectedCategory);
  }, [selectedCategory]);

  const handleOpenCustomizer = (item: MenuItem) => {
    setCustomizingItem(item);
    setSelectedSides([]);
    setSelectedToppings([]);
    setExtra1("");
    setExtra2("");
    setInstructions("");
  };

  const handleCloseCustomizer = () => {
    setCustomizingItem(null);
  };

  const toggleSide = (side: string) => {
    setSelectedSides(prev => {
      if (prev.includes(side)) return prev.filter(s => s !== side);
      if (prev.length < 2) return [...prev, side];
      return prev;
    });
  };

  const toggleTopping = (topping: string) => {
    setSelectedToppings(prev => 
      prev.includes(topping) ? prev.filter(t => t !== topping) : [...prev, topping]
    );
  };

  const extraCount = [extra1, extra2].filter(e => e.trim().length > 0).length;
  const currentExtraCost = 
    (selectedToppings.length * EXTRA_COSTS.TOPPING) + 
    (extraCount * EXTRA_COSTS.OTHER_EXTRA);

  const handleAddWithCustomization = () => {
    if (!customizingItem) return;

    const extras = [extra1, extra2].filter(e => e.trim().length > 0);

    const customization: ItemCustomization = {
      sides: selectedSides.length > 0 ? selectedSides : undefined,
      toppings: selectedToppings.length > 0 ? selectedToppings : undefined,
      extras: extras.length > 0 ? extras : undefined,
      instructions: instructions.trim().length > 0 ? instructions : undefined,
      extraCost: currentExtraCost
    };

    addToCart(customizingItem, customization);
    handleCloseCustomizer();
  };

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

        <div className="space-y-4">
          {filteredItems.map((item) => (
            <div 
              key={item.id} 
              className="bg-white rounded-3xl p-4 shadow-sm border border-[#f5f5dc] flex flex-col gap-3 group active:scale-[0.98] transition-transform"
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
                <div className="bg-[#f5f5dc]/50 p-2.5 rounded-xl text-[10px] text-[#3e2723]/70 font-bold uppercase tracking-tighter flex gap-2">
                  <Info className="w-3 h-3 shrink-0" />
                  <span>{item.note}</span>
                </div>
              )}

              <button 
                onClick={() => handleOpenCustomizer(item)}
                className="mt-2 w-full flex items-center justify-center gap-2 bg-[#3e2723] text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all hover:bg-[#3e2723]/90 active:bg-[#f97316] shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Add to Order
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Customization Modal */}
      {customizingItem && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center px-4 pb-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-md bg-white rounded-[40px] shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in slide-in-from-bottom duration-500">
            {/* Modal Header */}
            <header className="p-7 border-b border-[#f5f5dc] flex items-center justify-between bg-[#fffdfa] sticky top-0 z-10">
              <div className="pr-8">
                <h3 className="text-2xl font-serif text-[#3e2723] uppercase leading-tight">{customizingItem.name}</h3>
                <p className="text-[10px] font-black text-[#f97316] uppercase tracking-[0.2em] mt-1">Personalize your dish</p>
              </div>
              <button onClick={handleCloseCustomizer} className="absolute top-6 right-6 p-2.5 bg-[#f5f5dc] rounded-full text-gray-400 active:scale-90 transition-transform shadow-inner">
                <X className="w-5 h-5" />
              </button>
            </header>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-7 space-y-9 no-scrollbar pb-10">
              
              {/* Conditional Selection Sections */}
              {customizingItem.note === ACCOMPANIMENTS_NOTE && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-lg font-serif flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-orange-100 flex items-center justify-center text-[#f97316]">
                        <Utensils className="w-4 h-4" />
                      </div>
                      Choose 2 Sides
                    </h4>
                    <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">{selectedSides.length}/2 Selected</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {CUSTOMIZATION_OPTIONS.SIDES.map(side => (
                      <button
                        key={side}
                        onClick={() => toggleSide(side)}
                        disabled={selectedSides.length >= 2 && !selectedSides.includes(side)}
                        className={`px-4 py-4 rounded-2xl text-[10px] font-black uppercase tracking-tighter border-2 transition-all flex items-center justify-between shadow-sm ${
                          selectedSides.includes(side)
                            ? 'bg-[#3e2723] text-white border-[#3e2723] scale-[1.02]'
                            : 'bg-white text-[#3e2723]/40 border-[#f5f5dc] disabled:opacity-20'
                        }`}
                      >
                        {side}
                        {selectedSides.includes(side) && <Check className="w-3 h-3" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {customizingItem.category === "Kuci Pizza" && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-lg font-serif flex items-center gap-3">
                       <div className="w-8 h-8 rounded-xl bg-orange-100 flex items-center justify-center text-[#f97316]">
                        <PizzaIcon className="w-4 h-4" />
                      </div>
                      Extra Toppings
                    </h4>
                    <span className="text-[10px] font-black text-[#f97316] uppercase tracking-widest">+{EXTRA_COSTS.TOPPING.toLocaleString()} RWF / ea</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {CUSTOMIZATION_OPTIONS.PIZZA_TOPPINGS.map(topping => (
                      <button
                        key={topping}
                        onClick={() => toggleTopping(topping)}
                        className={`px-4 py-4 rounded-2xl text-[10px] font-black uppercase tracking-tighter border-2 transition-all flex items-center justify-between shadow-sm ${
                          selectedToppings.includes(topping)
                            ? 'bg-[#3e2723] text-white border-[#3e2723] scale-[1.02]'
                            : 'bg-white text-[#3e2723]/40 border-[#f5f5dc]'
                        }`}
                      >
                        {topping}
                        {selectedToppings.includes(topping) && <Check className="w-3 h-3" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Other Extras (Multiple) - Unified for all items */}
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-serif flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-orange-100 flex items-center justify-center text-[#f97316]">
                      <Edit3 className="w-4 h-4" />
                    </div>
                    Add Other Extras
                  </h4>
                  <span className="text-[10px] font-black text-[#f97316] uppercase tracking-widest">+{EXTRA_COSTS.OTHER_EXTRA.toLocaleString()} RWF / ea</span>
                </div>
                <div className="space-y-3">
                  <div className="relative">
                    <input 
                      type="text"
                      value={extra1}
                      onChange={(e) => setExtra1(e.target.value)}
                      placeholder="specify the extra"
                      className="w-full bg-[#f5f5dc]/30 border-2 border-transparent focus:border-[#f97316] focus:bg-white rounded-2xl px-6 py-5 text-sm outline-none transition-all placeholder:text-[#3e2723]/30"
                    />
                    {extra1 && <div className="absolute right-6 top-1/2 -translate-y-1/2 text-[#f97316] text-[8px] font-black uppercase">Added</div>}
                  </div>
                  <div className="relative">
                    <input 
                      type="text"
                      value={extra2}
                      onChange={(e) => setExtra2(e.target.value)}
                      placeholder="specify the extra"
                      className="w-full bg-[#f5f5dc]/30 border-2 border-transparent focus:border-[#f97316] focus:bg-white rounded-2xl px-6 py-5 text-sm outline-none transition-all placeholder:text-[#3e2723]/30"
                    />
                    {extra2 && <div className="absolute right-6 top-1/2 -translate-y-1/2 text-[#f97316] text-[8px] font-black uppercase">Added</div>}
                  </div>
                </div>
              </div>

              {/* Universal Preparation Instructions */}
              <div className="space-y-5">
                <h4 className="text-lg font-serif flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-orange-100 flex items-center justify-center text-[#f97316]">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  Preparation Instructions
                </h4>
                <div className="bg-[#f5f5dc]/20 rounded-3xl p-1 shadow-inner border-2 border-transparent focus-within:border-[#f97316] transition-all">
                  <textarea 
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="Tell us how you'd like your meal prepared (e.g. 'No onions', 'Well done', 'Room temp', etc.)"
                    className="w-full bg-[#fffdfa]/50 rounded-[22px] p-5 text-sm outline-none resize-none transition-all min-h-[120px] placeholder:italic placeholder:text-[#3e2723]/30"
                    rows={4}
                  />
                </div>
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest text-center px-4 leading-relaxed">
                  "WE PREPARE EVERYTHING FRESH TO YOUR PREFERENCE"
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <footer className="p-7 bg-[#fffdfa] border-t border-[#f5f5dc] sticky bottom-0 z-10 safe-bottom">
              <button 
                onClick={handleAddWithCustomization}
                className="w-full bg-[#f97316] text-white py-5 rounded-[28px] font-black uppercase tracking-[0.15em] shadow-2xl shadow-orange-100 flex items-center justify-between px-10 text-xs active:scale-95 transition-all"
              >
                <span>Add to Order</span>
                <span className="font-serif text-xl border-l border-white/20 pl-6">
                  {(customizingItem.price + currentExtraCost).toLocaleString()} RWF
                </span>
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};
