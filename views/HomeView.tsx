
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Search, ChevronRight, MessageCircle, Sparkles, Clock, Plus, History, X, Utensils, Heart, ShoppingBag, Coffee, Star, Pizza, Salad, IceCream, Sandwich, Wine, GlassWater, Milk, Cherry, Beer, Flame } from 'lucide-react';
import { CONTACT_INFO } from '../constants';
import { Category, MenuItem, ItemCustomization, HistoricalOrder } from '../types';
import { CustomizerModal } from '../components/CustomizerModal';
import { SafeImage } from '../components/SafeImage';
import {
  getMenuItemCategoryId,
  getMenuItemCategoryName,
  getMenuItemPriceLabel,
  getMenuItemPrimaryImage,
} from '../lib/catalog';

interface HomeViewProps {
  onCategorySelect: (cat: Category) => void;
  addToCart: (item: MenuItem, customization?: ItemCustomization) => void;
  wishlist: MenuItem[];
  toggleWishlist: (item: MenuItem) => void;
  orderHistory: HistoricalOrder[];
  menuItems: MenuItem[];
  categories: Category[];
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

export const HomeView: React.FC<HomeViewProps> = ({ onCategorySelect, addToCart, wishlist, toggleWishlist, orderHistory, menuItems, categories }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const featured = menuItems.filter(i => i.featured).slice(0, 5);
  if (featured.length === 0) featured.push(...menuItems.slice(0, 5));

  const homeCategories = categories.slice(0, 6);

  const isInWishlist = (id: string) => wishlist.some(i => i.id === id);

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

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return menuItems.filter(item => 
      item.name.toLowerCase().includes(query) || 
      item.description.toLowerCase().includes(query)
    ).slice(0, 8); 
  }, [searchQuery, menuItems]);

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
    const coffeeCategory = categories.find((category) => category.id === 'coffee-espresso');
    const cocktailCategory = categories.find((category) => category.id === 'cocktails-wines');

    const coffees = coffeeCategory ? menuItems.filter((item) => getMenuItemCategoryId(item) === coffeeCategory.id).slice(0, 2) : [];
    const cocktails = cocktailCategory ? menuItems.filter((item) => getMenuItemCategoryId(item) === cocktailCategory.id).slice(0, 2) : [];
    return [...coffees, ...cocktails];
  }, [menuItems, categories]);

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
    const sigMeals = categories.find(c => c.name === "Signature Meals");
    if (sigMeals) onCategorySelect(sigMeals);
    setShowResults(false);
    setSearchQuery('');
  };

  const getCategoryName = (id: string) => categories.find(c => c.id === id)?.name || 'Menu';
  const getCategoryIcon = (id: string) => {
    const iconName = categories.find(c => c.id === id)?.iconName;
    return (iconName && ICON_MAP[iconName]) || <Utensils className="w-5 h-5" />;
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10 overflow-x-hidden">
      <CustomizerModal 
        item={customizingItem}
        onClose={() => setCustomizingItem(null)}
        onConfirm={handleCustomizationConfirm}
      />

      <section className="relative h-72 sm:h-80 overflow-hidden rounded-b-[40px] shadow-2xl">
        <img 
          src="https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&q=80&w=800" 
          className="w-full h-full object-cover scale-105"
          alt="KUCI Cafe Interior"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-text)]/90 via-[var(--color-text)]/20 to-transparent flex flex-col justify-end p-8 text-white">
          <p className="text-[var(--color-primary)] font-bold uppercase tracking-widest text-[10px] mb-2 flex items-center gap-2">
            <Clock className="w-3 h-3" /> OPEN DAILY: 7AM - 10PM
          </p>
          <h2 className="text-4xl font-serif leading-tight">Where Every Dish <br/>Tells a Story</h2>
          <p className="text-white/70 text-sm mt-2 italic font-medium">Opposite AFOS, Bugesera</p>
        </div>
      </section>

      <section className="px-4 -mt-10 relative z-40" ref={searchRef}>
        <div className="relative group max-w-lg mx-auto">
          <div className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center">
            <Search className={`w-full h-full transition-colors ${searchQuery ? 'text-[var(--color-primary)]' : 'text-[var(--color-primary)]/40'}`} />
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
            className="w-full pl-14 pr-14 py-5 rounded-full border-[3px] border-[var(--color-primary)] bg-[var(--color-bg)] shadow-2xl focus:ring-4 focus:ring-[var(--color-primary)]/20 outline-none text-[var(--color-text)] text-base font-medium transition-all placeholder:text-[var(--color-text-muted)]/50"
          />
          {searchQuery && (
            <button 
              onClick={() => { setSearchQuery(''); setShowResults(false); }}
              className="absolute right-5 top-1/2 -translate-y-1/2 p-1.5 bg-[var(--color-bg-secondary)] rounded-full hover:bg-[var(--color-primary)]/10 transition-colors"
              aria-label="Clear search"
            >
              <X className="w-4 h-4 text-[var(--color-primary)]" />
            </button>
          )}
        </div>

        {showResults && searchQuery.trim() && (
          <div className="absolute top-[110%] left-4 right-4 max-w-lg mx-auto bg-[var(--color-bg)] rounded-[32px] shadow-2xl border border-[var(--color-border)] overflow-hidden animate-in slide-in-from-top-2 duration-300">
            {searchResults.length > 0 ? (
              <div className="max-h-[60vh] overflow-y-auto no-scrollbar py-2">
                <div className="px-6 py-3 border-b border-[var(--color-bg-secondary)] flex items-center justify-between bg-[var(--color-primary)]/5">
                   <span className="text-[10px] font-black text-[var(--color-primary)] uppercase tracking-widest">Matching Items</span>
                   <span className="text-[10px] text-[var(--color-text)]/40 font-bold uppercase tracking-widest">{searchResults.length} results</span>
                </div>
                {searchResults.map((item) => (
                  <div
                    key={item.id}
                    className="w-full flex items-center gap-4 px-6 py-4 hover:bg-[var(--color-primary)]/5 transition-colors border-b border-[var(--color-bg-secondary)]/50 last:border-none text-left group relative"
                  >
                    <button 
                      onClick={() => handleSearchResultClick(item)}
                      className="flex-1 flex items-center gap-4 text-left min-w-0"
                    >
                      <div className="w-12 h-12 bg-[var(--color-bg-secondary)] rounded-2xl flex items-center justify-center text-[var(--color-text)] shrink-0 group-hover:bg-[var(--color-primary)] group-hover:text-white transition-colors">
                        {getCategoryIcon(getMenuItemCategoryId(item))}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                           <h4 className="text-sm font-bold text-[var(--color-text)] truncate group-hover:text-[var(--color-primary)] transition-colors uppercase font-serif">{item.name}</h4>
                           {item.averageRating && (                             <div className="flex items-center gap-0.5">
                               <Star className="w-2.5 h-2.5 text-[var(--color-rating)] fill-[var(--color-rating)]" />
                               <span className="text-[9px] font-black text-[var(--color-text-muted)]">{item.averageRating.toFixed(1)}</span>
                             </div>
                          )}
                        </div>
                        <p className="text-[9px] text-[var(--color-text-muted)] font-bold uppercase tracking-widest">{getMenuItemCategoryName(item, categories)}</p>
                      </div>
                      <div className="text-right mr-8">
                        <p className="text-xs font-black text-[var(--color-primary)] whitespace-nowrap">{getMenuItemPriceLabel(item)}</p>
                      </div>
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); toggleWishlist(item); }}
                      className={`absolute right-6 top-1/2 -translate-y-1/2 p-2 rounded-full transition-all active:scale-75 ${isInWishlist(item.id) ? 'text-[var(--color-wishlist)]' : 'text-[var(--color-text-muted)]/40'}`}
                    >

                      <Heart className={`w-4 h-4 ${isInWishlist(item.id) ? 'fill-current' : ''}`} />
                    </button>
                  </div>
                ))}
                <div className="p-6 bg-[var(--color-primary)]/5 border-t border-[var(--color-bg-secondary)] text-center">
                  <button 
                     onClick={navigateToFullMenu}
                     className="text-[var(--color-primary)] text-xs font-black uppercase tracking-widest border-b-2 border-[var(--color-primary)]/20 pb-1 active:scale-95 transition-transform inline-flex items-center gap-2"
                  >
                     Click here to view full menu <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-10 text-center space-y-5">
                <div className="w-14 h-14 bg-[var(--color-bg-secondary)]/10 rounded-full flex items-center justify-center mx-auto border-2 border-dashed border-[var(--color-border-muted)]">
                   <Search className="w-6 h-6 text-[var(--color-text-muted)]/30" />
                </div>
                <div className="space-y-2">
                   <p className="text-sm text-[var(--color-text-muted)] italic">"No bites found for that search. Try something else?"</p>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="px-4">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xl font-serif">Browse Menu</h3>
          <button 
            onClick={() => {
              const sigMeals = categories.find(c => c.name === "Signature Meals");
              if (sigMeals) onCategorySelect(sigMeals);
            }} 
            className="text-[var(--color-primary)] text-[10px] font-bold uppercase tracking-widest flex items-center gap-1"
          >
            Full Menu <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
          {homeCategories.map((cat) => (
            <button 
              key={cat.id}
              onClick={() => onCategorySelect(cat)}
              className="flex-shrink-0 flex flex-col items-center gap-2 group"
            >
              <div className="w-16 h-16 bg-[var(--color-bg-secondary)] rounded-[24px] flex items-center justify-center text-[var(--color-text)] group-hover:bg-[var(--color-primary)] group-hover:text-white transition-all shadow-md active:scale-90">
                {getCategoryIcon(cat.id)}
              </div>
              <span className="text-[9px] font-bold uppercase tracking-tighter text-center w-16 text-[var(--color-text)]/60">{cat.name.replace('Kuci ', '')}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="px-4 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-serif flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[var(--color-primary)] animate-pulse" />
            Barista's Choice
          </h3>
          <span className="text-[9px] text-[var(--color-primary)] font-black uppercase tracking-widest">Masterfully Crafted</span>
        </div>
        
        <div className="flex gap-5 overflow-x-auto no-scrollbar pb-4 -mx-4 px-4">
          {baristaChoices.map((item) => (
            <div 
              key={item.id} 
              className="min-w-[280px] bg-[var(--color-bg)] rounded-[40px] shadow-lg border border-[var(--color-primary)]/10 overflow-hidden flex flex-col group active:scale-[0.98] transition-all relative hover:shadow-2xl hover:-translate-y-1"
            >
              <div className="h-44 relative overflow-hidden" onClick={() => setCustomizingItem(item)}>
                <SafeImage
                  src={getMenuItemPrimaryImage(item, categories)}
                  alt={item.name}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                  fallbackLabel="KUCI"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-text)]/60 via-transparent to-transparent opacity-60" />
                <div className="absolute top-4 left-4 bg-[var(--color-primary)] text-white px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest">
                  {getMenuItemCategoryName(item, categories).replace('Café ', '')}
                </div>
                {item.averageRating && (
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-[var(--color-bg)]/90 backdrop-blur-sm px-3 py-1 rounded-full flex items-center gap-1 shadow-lg">
                    <Star className="w-3 h-3 text-[var(--color-primary)] fill-[var(--color-primary)]" />
                    <span className="text-[10px] font-black text-[var(--color-text)]">{item.averageRating.toFixed(1)}</span>
                  </div>
                )}
                <div className="absolute bottom-4 right-4 bg-[var(--color-bg)]/95 backdrop-blur-md px-3 py-1.5 rounded-full text-[var(--color-text)] font-black text-xs shadow-md">
                  {getMenuItemPriceLabel(item)}
                </div>
              </div>

              <button 
                onClick={(e) => { e.stopPropagation(); toggleWishlist(item); }}
                className={`absolute top-4 right-4 p-2.5 rounded-full backdrop-blur-md transition-all active:scale-75 z-10 ${isInWishlist(item.id) ? 'bg-[var(--color-wishlist)] text-white shadow-lg' : 'bg-white/40 text-white hover:bg-white/60'}`}
              >
                <Heart className={`w-4 h-4 ${isInWishlist(item.id) ? 'fill-current' : ''}`} />
              </button>
              
              <div className="p-6 space-y-3 flex-1 flex flex-col" onClick={() => setCustomizingItem(item)}>
                <div className="flex-1">
                  <h4 className="text-lg font-serif text-[var(--color-text)] line-clamp-1 uppercase">{item.name}</h4>
                  <p className="text-[var(--color-text)]/60 italic line-clamp-2 mt-2 leading-relaxed">
                    "{item.description}"
                  </p>
                </div>
                
                <div className="w-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all active:bg-[var(--color-primary)] active:text-white flex items-center justify-center gap-2">
                  <Plus className="w-3 h-3" /> Add Choice
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="px-4">
        <h3 className="text-xl font-serif mb-5">Today's Specials</h3>
        <div className="flex gap-6 overflow-x-auto no-scrollbar pb-6 -mx-1 px-1">
          {featured.map((item) => (
            <div 
              key={item.id} 
              className="min-w-[280px] bg-[var(--color-bg)] rounded-[40px] shadow-xl border border-[var(--color-border)]/50 overflow-hidden flex flex-col relative active:scale-[0.98] transition-all hover:-translate-y-1"
            >
              <div className="h-44 relative" onClick={() => setCustomizingItem(item)}>
                <SafeImage
                  src={getMenuItemPrimaryImage(item, categories)}
                  className="w-full h-full object-cover"
                  alt={item.name}
                  fallbackLabel="KUCI"
                />
                <div className="absolute top-4 right-4 bg-[var(--color-bg)]/95 backdrop-blur-md px-4 py-1.5 rounded-full text-[var(--color-primary)] font-black text-xs shadow-lg">
                  {getMenuItemPriceLabel(item)}
                </div>
                {item.averageRating && (
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-[var(--color-primary)] px-3 py-1 rounded-full flex items-center gap-1 shadow-xl">
                    <Star className="w-3 h-3 text-white fill-white" />
                    <span className="text-[10px] font-black text-white">{item.averageRating.toFixed(1)}</span>
                  </div>
                )}
                {item.tagline && (
                  <div className="absolute bottom-4 left-4 bg-[var(--color-primary)]/90 backdrop-blur-sm px-3 py-1 rounded-lg text-white font-bold text-[8px] uppercase tracking-[0.2em]">
                    {item.tagline}
                  </div>
                )}
              </div>

              <button 
                onClick={(e) => { e.stopPropagation(); toggleWishlist(item); }}
                className={`absolute top-4 left-4 p-2.5 rounded-full backdrop-blur-md transition-all active:scale-75 z-10 ${isInWishlist(item.id) ? 'bg-[var(--color-wishlist)] text-white shadow-lg' : 'bg-white/40 text-white hover:bg-white/60'}`}
              >
                <Heart className={`w-4 h-4 ${isInWishlist(item.id) ? 'fill-current' : ''}`} />
              </button>

              <div className="p-6 flex-1 flex flex-col" onClick={() => setCustomizingItem(item)}>
                <h4 className="text-xl font-serif text-[var(--color-text)] mb-2 uppercase">{item.name}</h4>
                <p className="text-[var(--color-text)]/60 text-[11px] line-clamp-3 leading-relaxed flex-1 italic">
                  "{item.description}"
                </p>
                <div className="mt-6 w-full bg-[var(--color-text)] text-white py-4 rounded-2xl font-bold transition-all shadow-lg flex items-center justify-center gap-2">
                  Add to Cart
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="px-4">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xl font-serif flex items-center gap-2">
            <History className="w-5 h-5 text-[var(--color-primary)]" />
            Back for Seconds?
          </h3>
          <span className="text-[9px] text-[var(--color-text-muted)] font-black uppercase tracking-widest">Recent Cravings</span>
        </div>

        {recentItems.length > 0 ? (
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-6 -mx-1 px-1">
            {recentItems.map((item) => (
              <div 
                key={`recent-${item.id}`} 
                className="min-w-[200px] bg-[var(--color-bg)] rounded-[32px] shadow-md border border-[var(--color-border)] overflow-hidden flex flex-col relative active:scale-[0.98] transition-all"
                onClick={() => setCustomizingItem(item)}
              >
                <div className="h-28 relative bg-[var(--color-bg-secondary)] flex items-center justify-center text-[var(--color-primary)]">
                  {getCategoryIcon(getMenuItemCategoryId(item))}
                  <div className="absolute top-2 right-2 bg-[var(--color-bg)]/90 px-2 py-0.5 rounded-full text-[8px] font-black text-[var(--color-primary)] shadow-sm">
                    {getMenuItemPriceLabel(item)}
                  </div>
                </div>
                <div className="p-4 flex flex-col flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-[var(--color-text)] font-serif uppercase line-clamp-1">{item.name}</h4>
                    {item.averageRating && (
                  <div className="flex items-center gap-0.5 ml-1">
                    <Star className="w-2.5 h-2.5 text-[var(--color-primary)] fill-[var(--color-primary)]" />
                    <span className="text-[8px] font-black text-[var(--color-text-muted)]">{item.averageRating.toFixed(1)}</span>
                  </div>
                    )}
                  </div>
                  <p className="text-[9px] text-[var(--color-text)]/40 mt-1 line-clamp-1 italic">"{getMenuItemCategoryName(item, categories)}"</p>
                  <button 
                    className="mt-3 w-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] py-2 rounded-xl text-[8px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-2.5 h-2.5" /> Order Again
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-[var(--color-bg-secondary)]/30 rounded-[40px] p-10 text-center border-2 border-dashed border-[var(--color-bg-secondary)] space-y-4 animate-in zoom-in-95 duration-500">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-[var(--color-primary)] mx-auto shadow-sm">
              <ShoppingBag className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h4 className="text-lg font-serif">Empty Cravings?</h4>
              <p className="text-[var(--color-text)]/50 text-[11px] leading-relaxed italic px-4">
                "Your future favorites are waiting to be discovered!"
              </p>
            </div>
          </div>
        )}
      </section>

      <a 
        href={`https://wa.me/${CONTACT_INFO.whatsapp}?text=Hello Kuci! I'd like to place an order.`}
        className="fixed bottom-24 right-6 z-30 bg-[var(--color-whatsapp)] text-white p-5 rounded-full shadow-2xl flex items-center justify-center animate-bounce hover:scale-110 active:scale-90 transition-all border-4 border-white"
        target="_blank"
        rel="noopener noreferrer"
      >
        <MessageCircle className="w-8 h-8" />
      </a>

    </div>
  );
};
