import React, { useState } from 'react';
import { MapPin, Clock, Phone, MessageCircle, Wallet, ShieldCheck, Heart, Navigation, Truck, Info as InfoIcon, ExternalLink } from 'lucide-react';
import { DELIVERY_OPTIONS } from '../constants';
import { DeliveryArea, DeliveryInfo, RestaurantSettings } from '../types';
import { getDeliveryOptions, getPhoneHref, getRestaurantContactInfo, getWhatsAppHref } from '../lib/catalog';

interface InfoViewProps {
  settings: RestaurantSettings | null;
}

export const InfoView: React.FC<InfoViewProps> = ({ settings }) => {
  const [activeZone, setActiveZone] = useState<DeliveryArea>(DeliveryArea.NYAMATA_CENTRAL);

  if (!settings) return null;

  const contactInfo = getRestaurantContactInfo(settings);
  const deliveryOptions = getDeliveryOptions(settings, DELIVERY_OPTIONS);
  const zoneEntries = (Object.values(deliveryOptions) as DeliveryInfo[]).filter((zone) => zone.area !== DeliveryArea.OUTSIDE);
  const activeZoneInfo = deliveryOptions[activeZone];
  const outsideZone = deliveryOptions[DeliveryArea.OUTSIDE];
  const mapLink = contactInfo.mapLink;
  const phoneHref = getPhoneHref(contactInfo.phone);
  const whatsappHref = getWhatsAppHref(contactInfo.whatsapp);
  const hasMomoInfo = !!contactInfo.momoPayCode;

  return (
    <div className="px-4 py-8 space-y-10 animate-in fade-in duration-500 pb-20">
      <header className="text-center space-y-3">
        <div className="w-20 h-20 bg-[var(--color-primary)] rounded-full mx-auto flex items-center justify-center text-white text-3xl font-serif shadow-xl">
          {settings.name.charAt(0)}
        </div>
        <div className="space-y-1">
          <h2 className="text-2xl font-serif">{settings.name}</h2>
          <p className="text-xs text-[var(--color-primary)] font-bold uppercase tracking-[0.2em]">{settings.tagline || "Nyamata's Choice"}</p>
        </div>
      </header>

      <section className="space-y-6">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-xl font-serif">Delivery Map</h3>
          <span className="text-[10px] text-[var(--color-primary)] font-black uppercase tracking-widest flex items-center gap-1">
            <Truck className="w-3 h-3" /> Delivery Zones
          </span>
        </div>

        <div className="bg-white rounded-[40px] border border-[var(--color-border)] overflow-hidden shadow-sm flex flex-col">
          <div className="relative h-72 w-full group overflow-hidden">
            {mapLink ? (
              <a
                href={mapLink}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full h-full cursor-pointer"
              >
                <div className="absolute inset-0 bg-[var(--color-border)] flex items-center justify-center">
                  <img
                    src="https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&q=80&w=1200"
                    alt={`${settings.name} Environment`}
                    className="w-full h-full object-cover opacity-90 transition-transform duration-700 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-black/10" />
                  <div className="relative flex flex-col items-center animate-bounce-slow z-10">
                    <div className="bg-[var(--color-text)] p-4 rounded-3xl shadow-2xl text-white border-4 border-white relative">
                      <MapPin className="w-8 h-8" />
                    </div>
                    <div className="bg-[var(--color-text)] text-white text-[9px] font-black px-4 py-2 rounded-full shadow-xl mt-2 uppercase tracking-widest whitespace-nowrap border border-white/20">
                      {settings.name}
                    </div>
                    <div className="w-6 h-2 bg-black/40 rounded-full blur-[2px] mt-1" />
                  </div>
                </div>

                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20">
                  <div className="bg-[var(--color-bg)] px-6 py-4 rounded-full shadow-2xl flex items-center gap-3 border border-[var(--color-border)]/50 min-w-[240px] justify-center active:scale-95 transition-transform">
                    <Navigation className="w-5 h-5 text-[var(--color-primary)]" />
                    <span className="text-[11px] font-black text-[var(--color-text)] uppercase tracking-widest">Open in Google Maps</span>
                    <ExternalLink className="w-3 h-3 text-[var(--color-text-muted)]/30 ml-1" />
                  </div>
                </div>
              </a>
            ) : (
              <div className="absolute inset-0 bg-[var(--color-border)] flex items-center justify-center">
                <img
                  src="https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&q=80&w=1200"
                  alt={`${settings.name} Environment`}
                  className="w-full h-full object-cover opacity-90"
                />
                <div className="absolute inset-0 bg-black/10" />
                <div className="relative flex flex-col items-center z-10">
                  <div className="bg-[var(--color-text)] p-4 rounded-3xl shadow-2xl text-white border-4 border-white relative">
                    <MapPin className="w-8 h-8" />
                  </div>
                  <div className="bg-[var(--color-text)] text-white text-[9px] font-black px-4 py-2 rounded-full shadow-xl mt-2 uppercase tracking-widest whitespace-nowrap border border-white/20">
                    {settings.name}
                  </div>
                  <div className="w-6 h-2 bg-black/40 rounded-full blur-[2px] mt-1" />
                </div>

                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20">
                  <div className="bg-[var(--color-bg)] px-6 py-4 rounded-full shadow-2xl flex items-center gap-3 border border-[var(--color-border)]/50 min-w-[240px] justify-center">
                    <InfoIcon className="w-5 h-5 text-[var(--color-primary)]" />
                    <span className="text-[11px] font-black text-[var(--color-text)] uppercase tracking-widest">Map Link Coming Soon</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-6 bg-[var(--color-bg)] space-y-4">
            <div className="flex items-center justify-between mb-2 px-2">
              <h4 className="text-[10px] font-black text-[var(--color-text-muted)]/40 uppercase tracking-[0.2em]">Select Your Area</h4>
              <p className="text-[10px] font-bold text-[var(--color-primary)]">Delivery Pricing</p>
            </div>
            <div className="grid grid-cols-2 gap-3 w-full">
              {zoneEntries.map((zone) => (
                <button
                  key={zone.area}
                  onClick={() => setActiveZone(zone.area)}
                  className={`p-5 rounded-[32px] border-2 transition-all text-left space-y-1 relative overflow-hidden ${
                    activeZone === zone.area
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 shadow-sm scale-[1.02]'
                      : 'border-[var(--color-border)] bg-[var(--color-bg)] opacity-60'
                  }`}
                >
                  <p className="text-[10px] font-black text-[var(--color-text)] uppercase tracking-tighter line-clamp-1">{zone.area}</p>
                  <p className="text-xl font-serif text-[var(--color-primary)]">{zone.fee} RWF</p>
                  <div className="flex items-center gap-1 text-[8px] font-bold text-[var(--color-text-muted)]/40 uppercase">
                    <Clock className="w-2.5 h-2.5" /> {zone.estimatedTime}
                  </div>
                </button>
              ))}
            </div>
            {activeZoneInfo && (
              <p className="text-[10px] text-[var(--color-primary)] font-bold px-2">
                Current estimate for {activeZoneInfo.area}: {activeZoneInfo.estimatedTime}
              </p>
            )}
            {outsideZone && (
              <p className="text-[10px] text-[var(--color-text-muted)]/60 px-2">
                {DeliveryArea.OUTSIDE}: {outsideZone.estimatedTime}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="bg-[var(--color-bg)] rounded-[32px] p-6 shadow-sm border border-[var(--color-border)] space-y-6">
          <div className="flex gap-4">
            <div className="w-12 h-12 bg-[var(--color-bg-secondary)] rounded-2xl flex items-center justify-center text-[var(--color-primary)] flex-shrink-0">
              <Navigation className="w-6 h-6" />
            </div>
            <div className="space-y-1 flex-1">
              <h4 className="font-bold text-[var(--color-text)] font-serif">Visit Us</h4>
              <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">{contactInfo.location || 'Location details will be shared when available.'}</p>
              {mapLink ? (
                <a
                  href={mapLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-[var(--color-primary)] text-[10px] font-bold uppercase tracking-widest mt-2 border-b-2 border-[var(--color-primary)]/20 pb-1 active:scale-95 transition-transform"
                >
                  Click Here for Directions
                </a>
              ) : (
                <p className="text-[10px] font-bold uppercase tracking-widest mt-2 text-[var(--color-text-muted)]/50">
                  Map link not available yet
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-[var(--color-border)] pt-6">
            <div className="flex flex-col gap-2">
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)]/30">Phone</span>
              {phoneHref && contactInfo.phone ? (
                <a href={phoneHref} className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
                  <Phone className="w-4 h-4 text-[var(--color-primary)]" /> {contactInfo.phone}
                </a>
              ) : (
                <div className="flex items-center gap-2 text-sm font-bold text-[var(--color-text-muted)]/50">
                  <Phone className="w-4 h-4 text-[var(--color-primary)]" /> Phone unavailable
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)]/30">WhatsApp</span>
              {whatsappHref ? (
                <a href={whatsappHref} className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
                  <MessageCircle className="w-4 h-4 text-[var(--color-whatsapp)]" /> Chat With Us
                </a>
              ) : (
                <div className="flex items-center gap-2 text-sm font-bold text-[var(--color-text-muted)]/50">
                  <MessageCircle className="w-4 h-4 text-[var(--color-whatsapp)]" /> WhatsApp unavailable
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-[var(--color-text)] rounded-[32px] p-6 text-white flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">Service Hours</p>
            <h4 className="text-xl font-serif">{contactInfo.hours || 'Hours available on request'}</h4>
            <p className="text-[9px] italic text-[var(--color-primary)]">Open Daily, including Weekends</p>
          </div>
          <div className="p-4 bg-white/10 rounded-2xl">
            <Clock className="w-8 h-8 text-[var(--color-primary)]" />
          </div>
        </div>
      </section>

      <section className="bg-[var(--color-border)] rounded-[32px] p-6 space-y-4">
        <div className="flex gap-4 items-center mb-2">
          <Wallet className="w-6 h-6 text-[var(--color-text)]" />
          <h4 className="text-xl font-serif">Payment Guide</h4>
        </div>
        <div className="space-y-3">
          <div className="bg-[var(--color-bg)]/80 backdrop-blur-sm rounded-3xl p-5 space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-[var(--color-border)]">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]/40">MoMo Pay Code</span>
              <span className="text-lg font-black text-[var(--color-primary)]">{contactInfo.momoPayCode || 'Not available'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]/40">Recipient</span>
              <span className="text-xs font-bold text-[var(--color-text)]">{contactInfo.momoMerchantName || 'Ask staff for payment details'}</span>
            </div>
          </div>
          {hasMomoInfo ? (
            <div className="flex items-center gap-3 px-4 py-3 bg-[var(--color-text)] rounded-2xl text-white">
              <InfoIcon className="w-4 h-4 text-[var(--color-primary)]" />
              <p className="text-[9px] font-bold uppercase tracking-widest">Dial *182*8*1*{contactInfo.momoPayCode}#</p>
            </div>
          ) : (
            <div className="flex items-center gap-3 px-4 py-3 bg-[var(--color-text)] rounded-2xl text-white/80">
              <InfoIcon className="w-4 h-4 text-[var(--color-primary)]" />
              <p className="text-[9px] font-bold uppercase tracking-widest">Mobile Money details are not configured yet</p>
            </div>
          )}
        </div>
      </section>

      <section className="bg-[var(--color-bg)] rounded-[40px] p-8 shadow-xl border border-[var(--color-border)] space-y-8">
        <div className="text-center space-y-2">
          <h4 className="text-2xl font-serif">Share Your Story</h4>
          <p className="text-xs text-[var(--color-text-muted)] px-4">We value every guest's experience. Tell us how we're doing.</p>
        </div>
        <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Full Name"
              className="w-full px-6 py-4 bg-[var(--color-bg-secondary)] rounded-2xl border-2 border-transparent focus:border-[var(--color-primary)] focus:bg-[var(--color-bg)] outline-none text-sm transition-all"
            />
            <textarea
              placeholder="Your Message..."
              rows={4}
              className="w-full px-6 py-4 bg-[var(--color-bg-secondary)] rounded-2xl border-2 border-transparent focus:border-[var(--color-primary)] focus:bg-[var(--color-bg)] outline-none text-sm resize-none transition-all"
            ></textarea>
          </div>
          <button className="w-full bg-[var(--color-text)] text-white py-5 rounded-[24px] font-black uppercase tracking-widest shadow-lg shadow-gray-200 active:scale-95 transition-all">
            Submit Feedback
          </button>
        </form>
      </section>

      <footer className="text-center space-y-8 pt-4 pb-10">
        <div className="flex flex-col items-center gap-3">
          <ShieldCheck className="w-8 h-8 text-[var(--color-primary)] opacity-30" />
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-[0.25em] font-black text-[var(--color-text-muted)]/40">Secure Mobile Payments</p>
            <p className="text-[10px] uppercase tracking-[0.25em] font-black text-[var(--color-text-muted)]/40">Fresh Local Ingredients</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-center gap-2 text-[var(--color-text-muted)]/40">
            <div className="h-px w-8 bg-[var(--color-border)]" />
            <p className="text-xs italic flex items-center gap-1.5">
              Crafted with <Heart className="w-3 h-3 text-[var(--color-wishlist)] fill-[var(--color-wishlist)] animate-pulse" /> in Nyamata
            </p>
            <div className="h-px w-8 bg-[var(--color-border)]" />
          </div>
          <p className="text-[10px] text-[var(--color-text-muted)]/30 uppercase tracking-[0.3em] font-black">{settings.name} © 2024</p>
        </div>
      </footer>
    </div>
  );
};
