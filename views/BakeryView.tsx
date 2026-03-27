
import React, { useMemo } from 'react';
import { Cookie, Cake, Croissant, Sparkles, MessageCircle, Utensils } from 'lucide-react';
import { CONTACT_INFO } from '../constants';
import { Category, MenuItem } from '../types';

interface BakeryViewProps {
  menuItems: MenuItem[];
  categories: Category[];
}

export const BakeryView: React.FC<BakeryViewProps> = ({ menuItems, categories }) => {
  const bakeryItems = useMemo(() => {
    // Look for categories that might be bakery related
    const bakeryKeywords = ['bakery', 'pastry', 'bread', 'cake', 'dessert'];
    const bakeryCatIds = categories
      .filter(c => bakeryKeywords.some(k => c.name.toLowerCase().includes(k)))
      .map(c => c.id);
    
    return menuItems.filter(item => bakeryCatIds.includes(item.category));
  }, [menuItems, categories]);

  const bakeryCategories = [
    { title: 'Breads', icon: <Utensils className="w-6 h-6" />, text: 'Freshly Baked Daily' },
    { title: 'Cakes', icon: <Cake className="w-6 h-6" />, text: 'Freshly Baked Daily' },
    { title: 'Pastries', icon: <Croissant className="w-6 h-6" />, text: 'Freshly Baked Daily' }
  ];

  const whatsappMessage = encodeURIComponent("Hello Kuci! What are today’s fresh bakery and pastry selections?");

  return (
    <div className="px-4 py-8 space-y-8 animate-in slide-in-from-right-4 duration-500">
      <header className="text-center space-y-2">
        <h2 className="text-3xl font-serif">Bakery & Pastries</h2>
        <p className="text-[var(--color-primary)] font-bold uppercase tracking-widest text-xs">Freshly baked daily</p>
      </header>

      {/* Featured Banner */}
      <div className="bg-[var(--color-primary)] rounded-[32px] p-6 text-white shadow-xl shadow-[var(--color-primary)]/20 relative overflow-hidden">
        <div className="relative z-10">
          <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[var(--color-rating)]" /> 
            Daily Specials Highlight
          </h3>
          <p className="text-sm opacity-90 leading-relaxed italic">
            "Our ovens start early to bring you the crunchiest crusts and softest centers in Nyamata."
          </p>
        </div>
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <Cookie className="w-24 h-24" />
        </div>
      </div>

      {/* Bakery Items from Firestore if available */}
      {bakeryItems.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-serif px-2">Today's Fresh Bakes</h3>
          <div className="grid grid-cols-1 gap-4">
            {bakeryItems.map((item) => (
              <div key={item.id} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-3xl p-4 flex items-center gap-4 shadow-sm">
                <div className="w-16 h-16 bg-[var(--color-bg-secondary)] rounded-2xl flex items-center justify-center text-[var(--color-text)] shrink-0">
                  <Utensils className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <h4 className="text-lg font-serif uppercase">{item.name}</h4>
                    <span className="text-[var(--color-primary)] font-bold text-sm">{item.price.toLocaleString()} RWF</span>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)] italic line-clamp-1">"{item.description}"</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bakery Cards (Static Categories) */}
      <div className="grid grid-cols-1 gap-4">
        {bakeryCategories.map((item) => (
          <div key={item.title} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-3xl p-6 flex items-center gap-6 shadow-sm">
            <div className="w-16 h-16 bg-[var(--color-bg-secondary)] rounded-2xl flex items-center justify-center text-[var(--color-text)]">
              {item.icon}
            </div>
            <div>
              <h4 className="text-xl font-serif">{item.title}</h4>
              <p className="text-xs text-[var(--color-text-muted)] font-medium uppercase tracking-tighter">{item.text}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Call to Action */}
      <section className="bg-[var(--color-border)] rounded-[32px] p-8 text-center space-y-6">
        <div className="space-y-2">
          <p className="text-[var(--color-text)] text-sm font-medium leading-relaxed">
            “Pastry selection varies daily. Ask on WhatsApp for today’s fresh bakes.”
          </p>
        </div>
        
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

      <div className="flex items-center justify-center gap-2 text-[var(--color-text-muted)]/40 text-[10px] font-bold uppercase tracking-widest pb-8">
        <Sparkles className="w-3 h-3" />
        Baked with Love in Bugesera
        <Sparkles className="w-3 h-3" />
      </div>
    </div>
  );
};
