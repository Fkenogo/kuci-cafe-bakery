
import React, { useMemo } from 'react';
import { Search, ChevronRight, MessageCircle, Sparkles, Clock, Plus, History, Coffee as CoffeeIcon } from 'lucide-react';
import { MENU_ITEMS, CONTACT_INFO, CATEGORY_ICONS } from '../constants';
import { Category, MenuItem } from '../types';

interface HomeViewProps {
  onCategorySelect: (cat: Category) => void;
  addToCart: (item: MenuItem) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ onCategorySelect, addToCart }) => {
  const featured = MENU_ITEMS.slice(0, 5);
  const categories: Category[] = [
    "Signature Meals", "Kuci Burgers", "Kuci Pizza", "Kuci Pasta", "Kuci Salads", "Kuci Desserts"
  ];

  // Barista's Choice: Balanced selection of 2 Coffees and 2 Cocktails
  const baristaChoices = useMemo(() => {
    const coffees = MENU_ITEMS.filter(i => i.category === "Coffee & Espresso").slice(0, 2);
    const cocktails = MENU_ITEMS.filter(i => i.category === "Café Signature Cocktails").slice(0, 2);
    return [...coffees, ...cocktails];
  }, []);

  // Personalized section: Recent Orders Quick Reorder
  const recentOrdersData = useMemo(() => {
    // Using sample data for testing as requested: Classic Burger and Cappuccino
    const sampleIds = ['bg-1', 'cf-1']; 
    const items = MENU_ITEMS.filter(i => sampleIds.includes(i.id));
    
    return {
      title: "Your Recent Orders",
      message: "Ready for your favorites? Tap to quickly add your usual picks back to your cart.",
      items: items
    };
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
      {/* Hero Banner */}
      <section className="relative h-72 overflow-hidden rounded-b-[40px] shadow-2xl">
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

      {/* Search Bar */}
      <section className="px-4 -mt-10 relative z-10">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-[#f97316] transition-colors" />
          <input 
            type="text" 
            placeholder="Search our delicious menu..." 
            className="w-full pl-12 pr-4 py-5 rounded-3xl border-none bg-white shadow-xl focus:ring-2 focus:ring-[#f97316] outline-none text-[#3e2723] text-sm"
          />
        </div>
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

      {/* Barista's Choice HORIZONTAL CAROUSEL Section */}
      <section className="px-4 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-serif flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#f97316]" />
            Barista's Choice
          </h3>
          <span className="text-[9px] text-[#f97316] font-black uppercase tracking-widest">Masterfully Crafted</span>
        </div>
        
        <div className="flex gap-5 overflow-x-auto no-scrollbar pb-4 -mx-4 px-4">
          {baristaChoices.map((item) => (
            <div 
              key={item.id} 
              className="min-w-[280px] bg-white rounded-[40px] shadow-lg border border-[#f97316]/10 overflow-hidden flex flex-col group active:scale-[0.98] transition-transform"
            >
              <div className="h-44 relative overflow-hidden">
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
              
              <div className="p-6 space-y-3 flex-1 flex flex-col">
                <div className="flex-1">
                  <h4 className="text-lg font-serif text-[#3e2723] line-clamp-1">{item.name}</h4>
                  <p className="text-sm text-[#3e2723]/60 italic line-clamp-2 mt-2 leading-relaxed">
                    "{item.description}"
                  </p>
                </div>
                
                <button 
                  onClick={() => addToCart(item)}
                  className="w-full bg-[#f97316]/10 text-[#f97316] py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all active:bg-[#f97316] active:text-white flex items-center justify-center gap-2"
                >
                  <Plus className="w-3 h-3" /> Add Choice
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Personalized Quick Reorder Section */}
      <section className="px-4">
        <div className="bg-[#f5f5dc]/40 rounded-[32px] p-6 space-y-4 border border-[#f5f5dc]">
          <div className="flex items-center justify-between">
            <h4 className="text-[#3e2723] font-serif text-lg flex items-center gap-2">
              <History className="w-5 h-5 text-[#f97316]" /> {recentOrdersData.title}
            </h4>
            <span className="text-[9px] text-[#3e2723]/40 font-bold uppercase tracking-widest italic">Personalized for you</span>
          </div>
          <p className="text-xs text-[#3e2723]/70 font-medium italic leading-relaxed">
            "{recentOrdersData.message}"
          </p>
          <div className="grid grid-cols-2 gap-3">
            {recentOrdersData.items.map(item => (
              <button 
                key={item.id}
                onClick={() => addToCart(item)}
                className="bg-white p-4 rounded-2xl shadow-sm border border-[#f5f5dc] flex flex-col items-start gap-2 active:scale-95 transition-all text-left group"
              >
                <div className="flex items-center justify-between w-full">
                   <div className="p-1.5 bg-[#f5f5dc] rounded-lg group-hover:bg-[#f97316] group-hover:text-white transition-colors">
                      {CATEGORY_ICONS[item.category] || <Plus className="w-3 h-3" />}
                   </div>
                   <Plus className="w-4 h-4 text-[#f97316]" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-[#3e2723] line-clamp-1">{item.name}</span>
                  <span className="text-[10px] text-[#f97316] font-bold">{item.price.toLocaleString()} RWF</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Items Carousel */}
      <section className="px-4">
        <h3 className="text-xl font-serif mb-5">Today's Specials</h3>
        <div className="flex gap-6 overflow-x-auto no-scrollbar pb-6 -mx-1 px-1">
          {featured.map((item) => (
            <div key={item.id} className="min-w-[280px] bg-white rounded-[40px] shadow-xl border border-[#f5f5dc]/50 overflow-hidden flex flex-col">
              <div className="h-44 relative">
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
              <div className="p-6 flex-1 flex flex-col">
                <h4 className="text-xl font-serif text-[#3e2723] mb-2">{item.name}</h4>
                <p className="text-[#3e2723]/60 text-[11px] line-clamp-3 leading-relaxed flex-1 italic">
                  "{item.description}"
                </p>
                <button 
                  onClick={() => addToCart(item)}
                  className="mt-6 w-full bg-[#3e2723] text-white py-4 rounded-2xl font-bold transition-all active:scale-95 shadow-lg flex items-center justify-center gap-2"
                >
                  Add to Cart
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Floating Action Button for WhatsApp */}
      <a 
        href={`https://wa.me/${CONTACT_INFO.whatsapp}?text=Hello Kuci! I'd like to place an order.`}
        className="fixed bottom-24 right-6 z-50 bg-[#25D366] text-white p-5 rounded-full shadow-2xl flex items-center justify-center animate-bounce hover:scale-110 active:scale-90 transition-all border-4 border-white"
        target="_blank"
        rel="noopener noreferrer"
      >
        <MessageCircle className="w-8 h-8" />
      </a>
    </div>
  );
};
