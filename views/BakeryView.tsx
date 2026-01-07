
import React from 'react';
import { Cookie, Cake, Croissant, Sparkles, MessageCircle } from 'lucide-react';
import { CONTACT_INFO } from '../constants';

export const BakeryView: React.FC = () => {
  const bakeryCategories = [
    { title: 'Breads', icon: <Sparkles className="w-6 h-6" />, text: 'Freshly Baked Daily' },
    { title: 'Cakes', icon: <Cake className="w-6 h-6" />, text: 'Freshly Baked Daily' },
    { title: 'Pastries', icon: <Croissant className="w-6 h-6" />, text: 'Freshly Baked Daily' }
  ];

  const whatsappMessage = encodeURIComponent("Hello Kuci! What are today’s fresh bakery and pastry selections?");

  return (
    <div className="px-4 py-8 space-y-8 animate-in slide-in-from-right-4 duration-500">
      <header className="text-center space-y-2">
        <h2 className="text-3xl font-serif">Bakery & Pastries</h2>
        <p className="text-[#f97316] font-bold uppercase tracking-widest text-xs">Freshly baked daily</p>
      </header>

      {/* Featured Banner */}
      <div className="bg-[#f97316] rounded-[32px] p-6 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10">
          <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-yellow-300" /> 
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

      {/* Bakery Cards */}
      <div className="grid grid-cols-1 gap-4">
        {bakeryCategories.map((item) => (
          <div key={item.title} className="bg-white border border-[#f5f5dc] rounded-3xl p-6 flex items-center gap-6 shadow-sm">
            <div className="w-16 h-16 bg-[#f5f5dc] rounded-2xl flex items-center justify-center text-[#3e2723]">
              {item.icon}
            </div>
            <div>
              <h4 className="text-xl font-serif">{item.title}</h4>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-tighter">{item.text}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Call to Action */}
      <section className="bg-[#f5f5dc] rounded-[32px] p-8 text-center space-y-6">
        <div className="space-y-2">
          <p className="text-[#3e2723] text-sm font-medium leading-relaxed">
            “Pastry selection varies daily. Ask on WhatsApp for today’s fresh bakes.”
          </p>
        </div>
        
        <a 
          href={`https://wa.me/${CONTACT_INFO.whatsapp}?text=${whatsappMessage}`}
          className="inline-flex items-center justify-center gap-3 bg-[#25D366] text-white px-8 py-4 rounded-full font-bold shadow-lg shadow-green-100 hover:scale-105 active:scale-95 transition-all w-full"
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageCircle className="w-5 h-5" />
          Ask Today’s Specials
        </a>
      </section>

      <div className="flex items-center justify-center gap-2 text-gray-400 text-[10px] font-bold uppercase tracking-widest pb-8">
        <Sparkles className="w-3 h-3" />
        Baked with Love in Bugesera
        <Sparkles className="w-3 h-3" />
      </div>
    </div>
  );
};
