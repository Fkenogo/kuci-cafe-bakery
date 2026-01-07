
import React from 'react';
import { MapPin, Clock, Phone, MessageCircle, Mail, Wallet, ShieldCheck, Heart } from 'lucide-react';
import { CONTACT_INFO } from '../constants';

export const InfoView: React.FC = () => {
  return (
    <div className="px-4 py-8 space-y-10 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="text-center space-y-3">
        <div className="w-20 h-20 bg-[#f97316] rounded-full mx-auto flex items-center justify-center text-white text-3xl font-serif shadow-xl">K</div>
        <div className="space-y-1">
          <h2 className="text-2xl font-serif">KUCI Café & Bakery</h2>
          <p className="text-xs text-[#f97316] font-bold uppercase tracking-[0.2em]">Nyamata's Choice</p>
        </div>
      </header>

      {/* Quick Contact Cards */}
      <section className="grid grid-cols-2 gap-3">
        <a href={`tel:${CONTACT_INFO.phone}`} className="bg-white p-4 rounded-3xl border border-[#f5f5dc] shadow-sm flex flex-col items-center gap-2 active:scale-95 transition-all">
          <div className="p-2 bg-blue-50 text-blue-500 rounded-full"><Phone className="w-5 h-5" /></div>
          <span className="text-[10px] font-bold uppercase tracking-wider">Call Us</span>
        </a>
        <a href={`https://wa.me/${CONTACT_INFO.whatsapp}`} className="bg-white p-4 rounded-3xl border border-[#f5f5dc] shadow-sm flex flex-col items-center gap-2 active:scale-95 transition-all">
          <div className="p-2 bg-green-50 text-green-500 rounded-full"><MessageCircle className="w-5 h-5" /></div>
          <span className="text-[10px] font-bold uppercase tracking-wider">WhatsApp</span>
        </a>
      </section>

      {/* Information Sections */}
      <div className="space-y-6">
        {/* Location & Hours */}
        <div className="bg-white rounded-[32px] p-6 shadow-sm border border-[#f5f5dc] space-y-4">
          <div className="flex gap-4">
            <MapPin className="w-6 h-6 text-[#f97316]" />
            <div className="space-y-1">
              <h4 className="font-bold text-[#3e2723]">Our Location</h4>
              <p className="text-sm text-gray-500 leading-relaxed">{CONTACT_INFO.location}</p>
            </div>
          </div>
          <div className="flex gap-4">
            <Clock className="w-6 h-6 text-[#f97316]" />
            <div className="space-y-1">
              <h4 className="font-bold text-[#3e2723]">Working Hours</h4>
              <p className="text-sm text-gray-500">Daily: 7:00 AM – 10:00 PM</p>
            </div>
          </div>
        </div>

        {/* Payment Instructions */}
        <div className="bg-[#f5f5dc] rounded-[32px] p-6 space-y-4">
          <div className="flex gap-4 items-center mb-2">
            <Wallet className="w-6 h-6 text-[#3e2723]" />
            <h4 className="font-bold text-[#3e2723]">Payment Instructions</h4>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm p-3 bg-white/50 rounded-2xl">
              <span className="text-gray-500">MoMo Paybill</span>
              <span className="font-bold text-[#f97316]">{CONTACT_INFO.paybill}</span>
            </div>
            <div className="flex justify-between items-center text-sm p-3 bg-white/50 rounded-2xl">
              <span className="text-gray-500">Vendor</span>
              <span className="font-bold text-[#3e2723]">{CONTACT_INFO.vendor}</span>
            </div>
            <p className="text-[10px] text-center text-gray-500 px-4">Dial *182*8*1*{CONTACT_INFO.paybill}# to pay quickly.</p>
          </div>
        </div>

        {/* Feedback Form */}
        <div className="bg-white rounded-[32px] p-8 shadow-md border border-[#f5f5dc] space-y-6">
          <div className="text-center space-y-1">
            <h4 className="text-xl font-serif">Tell us how we're doing</h4>
            <p className="text-xs text-gray-400">We value every story and review.</p>
          </div>
          <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
            <input 
              type="text" 
              placeholder="Your Name" 
              className="w-full px-5 py-4 bg-[#fffdfa] rounded-2xl border-none ring-1 ring-[#f5f5dc] focus:ring-2 focus:ring-[#f97316] outline-none text-sm"
            />
            <textarea 
              placeholder="Your Message" 
              rows={4}
              className="w-full px-5 py-4 bg-[#fffdfa] rounded-2xl border-none ring-1 ring-[#f5f5dc] focus:ring-2 focus:ring-[#f97316] outline-none text-sm resize-none"
            ></textarea>
            <button className="w-full bg-[#3e2723] text-white py-4 rounded-full font-bold shadow-lg shadow-gray-200 transition-all active:scale-95">
              Send Feedback
            </button>
          </form>
        </div>
      </div>

      {/* Trust & Policy */}
      <footer className="text-center space-y-6">
        <div className="flex flex-col items-center gap-2 text-gray-400">
          <ShieldCheck className="w-6 h-6 opacity-40" />
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold">Secure Mobile Payments • Local Ingredients</p>
        </div>
        
        <div className="pt-4 space-y-2">
          <p className="text-xs text-gray-500 flex items-center justify-center gap-1">
            Crafted with <Heart className="w-3 h-3 text-red-400 fill-red-400" /> for Bugesera
          </p>
          <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium">KUCI Café & Bakery © 2024</p>
        </div>
      </footer>
    </div>
  );
};
