
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Search, ChevronRight, MessageCircle, Sparkles, Clock, Plus, History, X, Utensils, Heart, ShoppingBag, Coffee } from 'lucide-react';
import { MENU_ITEMS, CONTACT_INFO, CATEGORY_ICONS } from '../constants';
import { Category, MenuItem, ItemCustomization, HistoricalOrder } from '../types';
import { CustomizerModal } from '../components/CustomizerModal';

interface HomeViewProps {
  onCategorySelect: (cat: Category) => void;
  addToCart: (item: MenuItem, customization?: ItemCustomization) => void;
  wishlist: MenuItem[];
  toggleWishlist: (item: MenuItem);
  orderHistory: HistoricalOrder[];
}

export const HomeView: React.FC<HomeViewProps> = ({ onCategorySelect, addToCart, wishlist, toggleWishlist, orderHistory }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const featured = MENU_ITEMS.slice(0, 5);
  const categories: Category[] = [
    "Signature Meals", "Kuci Burgers", "Kuci Pizza", "Kuci Pasta", "Kuci Salads", "Kuci Desserts"
  ];

  const isInWishlist = (id: string) => wishlist.some(i => i.id === id);

  // Extract last 4 unique items from order history
  const recentItems = useMemo(() => {
    const items: MenuItem[] = [];
    const seenIds = new Set<string>();
    
    for (const order of orderHistory) {
      for (const item of order.items) {
        if (!seenIds.has(item.id)) {
          items.push(item);
          seenIds.add(item.id);
          if (items.length >= 4) break;
        }
      }
      if (items.length >= 4) break;
    }
    return items;
  }, [orderHistory]);

  // Dynamic Search Results: Filters by name, description, and category
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return MENU_ITEMS.filter(item => 
      item.name.toLowerCase().includes(query) || 
      item.description.toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query)
    ).slice(0, 8); 
  }, [searchQuery]);

  // Close results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const baristaChoices = useMemo(() => {
    const coffees = MENU_ITEMS.filter(i => i.category === "Coffee & Espresso").slice(0, 2);
    const cocktails = MENU_ITEMS.filter(i => i.category === "Café Signature Cocktails").slice(0, 2);
    return [...coffees, ...cocktails];
  }, []);

  const handleCustomizationConfirm = (item: MenuItem, customization: ItemCustomization) => {
    addToCart(item, customization);
    setCustomizingItem(null);
  };

  const handleSearchResultClick = (item: MenuItem) => {
    setCustomizingItem(item);
    setSearchQuery('');
    setShowResults(false);
  };

  const navigateToFullMenu = () => {
    onCategorySelect("Signature Meals");
    setShowResults(false);
    setSearchQuery('');
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10 overflow-x-hidden">
      <CustomizerModal 
        item={customizingItem}
        onClose={() => setCustomizingItem(null)}
        onConfirm={handleCustomizationConfirm}
      />

      {/* Hero Banner */}
      <section className="relative h-72 sm:h-80 overflow-hidden rounded-b-[40px] shadow-2xl">
        <img 
          src="https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&q=80&w=800" 
          className="w-full h-full object-cover scale-105"
          alt="KUCI Cafe Interior"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#3e2723]/90 via-[#3e2723]/20 to-transparent flex flex-col justify-end p-8 text-white">
          <p className="text-orange-400 font-bold uppercase tracking-widest text-[10px] mb-2 flex items-center gap-2">
            <Clock className="w-3 h-3" /> OPEN DAILY: 7AM - 10PM
          </p>
          <h2 className="text-4xl font-serif leading-tight">Where Every Dish <br/>Tells a Story</h2>
          <p className="text-white/70 text-sm mt-2 italic font-medium">Opposite AFOS, Bugesera</p>
        </div>
      </section>

      {/* Responsive & Dynamic Search Bar */}
      <section className="px-4 -mt-10 relative z-40" ref={searchRef}>
        <div className="relative group max-w-lg mx-auto">
          <div className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center">
            <Search className={`w-full h-full transition-colors ${searchQuery ? 'text-[#f97316]' : 'text-[#f97316]/40'}`} />
          </div>
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowResults(true);
            }}
            onFocus={() => setShowResults(true)}
            placeholder="Search our delicious menu..." 
            className="w-full pl-14 pr-14 py-5 rounded-full border-[3px] border-[#f97316] bg-white shadow-2xl focus:ring-4 focus:ring-[#f97316]/20 outline-none text-[#3e2723] text-base font-medium transition-all placeholder:text-gray-300"
          />
          {searchQuery && (
            <button 
              onClick={() => { setSearchQuery(''); setShowResults(false); }}
              className="absolute right-5 top-1/2 -translate-y-1/2 p-1.5 bg-gray-100 rounded-full hover:bg-orange-100 transition-colors"
              aria-label="Clear search"
            >
              <X className="w-4 h-4 text-[#f97316]" />
            </button>
          )}
        </div>

        {/* Live Search Results Dropdown */}
        {showResults && searchQuery.trim() && (
          <div className="absolute top-[110%] left-4 right-4 max-w-lg mx-auto bg-white rounded-[32px] shadow-2xl border border-[#f5f5dc] overflow-hidden animate-in slide-in-from-top-2 duration-300">
            {searchResults.length > 0 ? (
              <div className="max-h-[60vh] overflow-y-auto no-scrollbar py-2">
                <div className="px-6 py-3 border-b border-[#f5f5dc] flex items-center justify-between bg-orange-50/30">
                   <span className="text-[10px] font-black text-[#f97316] uppercase tracking-widest">Matching Items</span>
                   <span className="text-[10px] text-[#3e2723]/40 font-bold uppercase tracking-widest">{searchResults.length} results</span>
                </div>
                {searchResults.map((item) => (
                  <div
                    key={item.id}
                    className="w-full flex items-center gap-4 px-6 py-4 hover:bg-orange-50 transition-colors border-b border-[#f5f5dc]/50 last:border-none text-left group relative"
                  >
                    <button 
                      onClick={() => handleSearchResultClick(item)}
                      className="flex-1 flex items-center gap-4 text-left min-w-0"
                    >
                      <div className="w-12 h-12 bg-[#f5f5dc] rounded-2xl flex items-center justify-center text-[#3e2723] shrink-0 group-hover:bg-[#f97316] group-hover:text-white transition-colors">
                        {CATEGORY_ICONS[item.category] || <Utensils className="w-5 h-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-[#3e2723] truncate group-hover:text-[#f97316] transition-colors uppercase font-serif">{item.name}</h4>
                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">{item.category}</p>
                      </div>
                      <div className="text-right mr-8">
                        <p className="text-xs font-black text-[#f97316] whitespace-nowrap">{item.price.toLocaleString()} RWF</p>
                      </div>
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); toggleWishlist(item); }}
                      className={`absolute right-6 top-1/2 -translate-y-1/2 p-2 rounded-full transition-all active:scale-75 ${isInWishlist(item.id) ? 'text-red-500' : 'text-gray-300'}`}
                    >
                      <Heart className={`w-4 h-4 ${isInWishlist(item.id) ? 'fill-current' : ''}`} />
                    </button>
                  </div>
                ))}
                <div className="p-6 bg-orange-50/20 border-t border-[#f5f5dc] text-center">
                  <button 
                     onClick={navigateToFullMenu}
                     className="text-[#f97316] text-xs font-black uppercase tracking-widest border-b-2 border-[#f97316]/20 pb-1 active:scale-95 transition-transform inline-flex items-center gap-2"
                  >
                     Click here to view full menu <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-10 text-center space-y-5">
                <div className="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center mx-auto border-2 border-dashed border-gray-100">
                   <Search className="w-6 h-6 text-gray-200" />
                </div>
                <div className="space-y-2">
                   <p className="text-sm text-gray-400 italic">"No bites found for that search. Try something else?"</p>
                   <button 
                     onClick={navigateToFullMenu}
                     className="text-[#f97316] text-xs font-black uppercase tracking-widest border-b-2 border-[#f97316]/20 pb-1 mt-2 active:scale-95 transition-transform inline-block"
                   >
                     Click here to view full menu
                   </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Category Shortcuts */}
      <section className="px-4">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xl font-serif">Browse Menu</h3>
          <button onClick={() => onCategorySelect("Signature Meals")} className="text-[#f97316] text-[10px] font-bold uppercase tracking-widest flex items-center gap-1">
            Full Menu <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
          {categories.map((cat) => (
            <button 
              key={cat}
              onClick={() => onCategorySelect(cat)}
              className="flex-shrink-0 flex flex-col items-center gap-2 group"
            >
              <div className="w-16 h-16 bg-[#f5f5dc] rounded-[24px] flex items-center justify-center text-[#3e2723] group-hover:bg-[#f97316] group-hover:text-white transition-all shadow-md active:scale-90">
                {CATEGORY_ICONS[cat]}
              </div>
              <span className="text-[9px] font-bold uppercase tracking-tighter text-center w-16 text-[#3e2723]/60">{cat.replace('Kuci ', '')}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Barista's Choice */}
      <section className="px-4 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-serif flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-yellow-400 animate-pulse" />
            Barista's Choice
            <Sparkles className="w-3 h-3 text-yellow-400/40 animate-pulse" />
          </h3>
          <span className="text-[9px] text-[#f97316] font-black uppercase tracking-widest">Masterfully Crafted</span>
        </div>
        
        <div className="flex gap-5 overflow-x-auto no-scrollbar pb-4 -mx-4 px-4">
          {baristaChoices.map((item) => (
            <div 
              key={item.id} 
              className="min-w-[280px] bg-white rounded-[40px] shadow-lg border border-[#f97316]/10 overflow-hidden flex flex-col group active:scale-[0.98] transition-all relative hover:shadow-2xl hover:-translate-y-1"
            >
              <div className="h-44 relative overflow-hidden" onClick={() => setCustomizingItem(item)}>
                <img 
                  src={item.category === 'Café Signature Cocktails' 
                    ? "https://images.unsplash.com/photo-1545438102-799c3991ffb2?auto=format&fit=crop&q=80&w=400" 
                    : "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&q=80&w=400"
                  } 
                  alt={item.name} 
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#3e2723]/60 via-transparent to-transparent opacity-60" />
                <div className="absolute top-4 left-4 bg-[#f97316] text-white px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest">
                  {item.category.replace('Café ', '')}
                </div>
                <div className="absolute bottom-4 right-4 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-full text-[#3e2723] font-black text-xs shadow-md">
                  {item.price.toLocaleString()} RWF
                </div>
              </div>

              <button 
                onClick={(e) => { e.stopPropagation(); toggleWishlist(item); }}
                className={`absolute top-4 right-4 p-2.5 rounded-full backdrop-blur-md transition-all active:scale-75 z-10 ${isInWishlist(item.id) ? 'bg-red-500 text-white shadow-lg' : 'bg-white/40 text-white hover:bg-white/60'}`}
              >
                <Heart className={`w-4 h-4 ${isInWishlist(item.id) ? 'fill-current' : ''}`} />
              </button>
              
              <div className="p-6 space-y-3 flex-1 flex flex-col" onClick={() => setCustomizingItem(item)}>
                <div className="flex-1">
                  <h4 className="text-lg font-serif text-[#3e2723] line-clamp-1 uppercase">{item.name}</h4>
                  <p className="text-sm text-[#3e2723]/60 italic line-clamp-2 mt-2 leading-relaxed">
                    "{item.description}"
                  </p>
                </div>
                
                <div className="w-full bg-[#f97316]/10 text-[#f97316] py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all active:bg-[#f97316] active:text-white flex items-center justify-center gap-2">
                  <Plus className="w-3 h-3" /> Add Choice
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Featured Items Carousel */}
      <section className="px-4">
        <h3 className="text-xl font-serif mb-5">Today's Specials</h3>
        <div className="flex gap-6 overflow-x-auto no-scrollbar pb-6 -mx-1 px-1">
          {featured.map((item) => (
            <div 
              key={item.id} 
              className="min-w-[280px] bg-white rounded-[40px] shadow-xl border border-[#f5f5dc]/50 overflow-hidden flex flex-col relative active:scale-[0.98] transition-all hover:-translate-y-1"
            >
              <div className="h-44 relative" onClick={() => setCustomizingItem(item)}>
                <img src={`https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=400`} className="w-full h-full object-cover" alt={item.name} />
                <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-md px-4 py-1.5 rounded-full text-[#f97316] font-black text-xs shadow-lg">
                  {item.price.toLocaleString()} RWF
                </div>
                {item.tagline && (
                  <div className="absolute bottom-4 left-4 bg-[#f97316]/90 backdrop-blur-sm px-3 py-1 rounded-lg text-white font-bold text-[8px] uppercase tracking-[0.2em]">
                    {item.tagline}
                  </div>
                )}
              </div>

              <button 
                onClick={(e) => { e.stopPropagation(); toggleWishlist(item); }}
                className={`absolute top-4 left-4 p-2.5 rounded-full backdrop-blur-md transition-all active:scale-75 z-10 ${isInWishlist(item.id) ? 'bg-red-500 text-white shadow-lg' : 'bg-white/40 text-white hover:bg-white/60'}`}
              >
                <Heart className={`w-4 h-4 ${isInWishlist(item.id) ? 'fill-current' : ''}`} />
              </button>

              <div className="p-6 flex-1 flex flex-col" onClick={() => setCustomizingItem(item)}>
                <h4 className="text-xl font-serif text-[#3e2723] mb-2 uppercase">{item.name}</h4>
                <p className="text-[#3e2723]/60 text-[11px] line-clamp-3 leading-relaxed flex-1 italic">
                  "{item.description}"
                </p>
                <div className="mt-6 w-full bg-[#3e2723] text-white py-4 rounded-2xl font-bold transition-all shadow-lg flex items-center justify-center gap-2">
                  Add to Cart
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recently Ordered Section */}
      <section className="px-4">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xl font-serif flex items-center gap-2">
            <History className="w-5 h-5 text-[#f97316]" />
            Back for Seconds?
          </h3>
          <span className="text-[9px] text-gray-400 font-black uppercase tracking-widest">Recent Cravings</span>
        </div>

        {recentItems.length > 0 ? (
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-6 -mx-1 px-1">
            {recentItems.map((item) => (
              <div 
                key={`recent-${item.id}`} 
                className="min-w-[200px] bg-white rounded-[32px] shadow-md border border-[#f5f5dc] overflow-hidden flex flex-col relative active:scale-[0.98] transition-all"
                onClick={() => setCustomizingItem(item)}
              >
                <div className="h-28 relative bg-[#f5f5dc] flex items-center justify-center text-[#f97316]">
                  {CATEGORY_ICONS[item.category] || <Utensils className="w-8 h-8" />}
                  <div className="absolute top-2 right-2 bg-white/90 px-2 py-0.5 rounded-full text-[8px] font-black text-[#f97316] shadow-sm">
                    {item.price.toLocaleString()} RWF
                  </div>
                </div>
                <div className="p-4 flex flex-col flex-1">
                  <h4 className="text-xs font-bold text-[#3e2723] font-serif uppercase line-clamp-1">{item.name}</h4>
                  <p className="text-[9px] text-[#3e2723]/40 mt-1 line-clamp-1 italic">"{item.category}"</p>
                  <button 
                    className="mt-3 w-full bg-[#f97316]/10 text-[#f97316] py-2 rounded-xl text-[8px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-2.5 h-2.5" /> Reorder
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-[#f5f5dc]/30 rounded-[40px] p-10 text-center border-2 border-dashed border-[#f5f5dc] space-y-4 animate-in zoom-in-95 duration-500">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-[#f97316] mx-auto shadow-sm">
              <ShoppingBag className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h4 className="text-lg font-serif">Empty Cravings?</h4>
              <p className="text-[#3e2723]/50 text-[11px] leading-relaxed italic px-4">
                "Your future favorites are waiting to be discovered! Start your flavor journey today."
              </p>
            </div>
            <button 
              onClick={() => onCategorySelect("Signature Meals")}
              className="text-[#f97316] text-[10px] font-black uppercase tracking-[0.2em] border-b-2 border-[#f97316]/20 pb-1"
            >
              Discover the Menu
            </button>
          </div>
        )}
      </section>

      {/* Floating WhatsApp Button */}
      <a 
        href={`https://wa.me/${CONTACT_INFO.whatsapp}?text=Hello Kuci! I'd like to place an order.`}
        className="fixed bottom-24 right-6 z-30 bg-[#25D366] text-white p-5 rounded-full shadow-2xl flex items-center justify-center animate-bounce hover:scale-110 active:scale-90 transition-all border-4 border-white"
        target="_blank"
        rel="noopener noreferrer"
      >
        <MessageCircle className="w-8 h-8" />
      </a>
    </div>
  );
};
