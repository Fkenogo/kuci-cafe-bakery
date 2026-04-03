import React, { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { ArrowRight, Cake, Coffee, Croissant, MessageCircle, Plus, Sandwich } from 'lucide-react';
import { db } from '../lib/firebase';
import { toBusinessDate } from '../lib/businessDate';
import { CONTACT_INFO } from '../constants';
import { BakeryCategory, BakeryDailyReconciliation, BakeryItem, Category, ItemCustomization, MenuItem } from '../types';
import { adaptBakeryItemToMenuItem, getMenuItemPriceLabel, getMenuItemPrimaryImage } from '../lib/catalog';
import { CustomizerModal } from '../components/CustomizerModal';
import { SafeImage } from '../components/SafeImage';

const LOW_STOCK_THRESHOLD = 3;

type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock' | 'unknown';

function getStockStatus(qty: number | undefined): StockStatus {
  if (qty === undefined) return 'unknown';
  if (qty <= 0) return 'out_of_stock';
  if (qty <= LOW_STOCK_THRESHOLD) return 'low_stock';
  return 'in_stock';
}

function StockBadge({ status, qty }: { status: StockStatus; qty?: number }) {
  if (status === 'in_stock') {
    return <span className="text-[10px] font-black uppercase tracking-widest rounded-full px-2 py-0.5 bg-emerald-100 text-emerald-700">In stock</span>;
  }
  if (status === 'low_stock') {
    return <span className="text-[10px] font-black uppercase tracking-widest rounded-full px-2 py-0.5 bg-amber-100 text-amber-700">Low stock{qty !== undefined ? ` · ${qty}` : ''}</span>;
  }
  if (status === 'out_of_stock') {
    return <span className="text-[10px] font-black uppercase tracking-widest rounded-full px-2 py-0.5 bg-red-100 text-red-700">Out of stock</span>;
  }
  return null;
}

interface StaffOrderSession {
  customerName: string;
  staffCartCount: number;
  onReturn: () => void;
}

interface BakeryViewProps {
  bakeryCategories: BakeryCategory[];
  bakeryItems: BakeryItem[];
  addToCart: (item: MenuItem, customization?: ItemCustomization) => void;
  menuCategories: Category[];
  staffSession?: StaffOrderSession;
}

export const BakeryView: React.FC<BakeryViewProps> = ({
  bakeryCategories,
  bakeryItems,
  addToCart,
  menuCategories,
  staffSession,
}) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedBakeryItem, setSelectedBakeryItem] = useState<BakeryItem | null>(null);
  const [availabilityByItemId, setAvailabilityByItemId] = useState<Record<string, number>>({});
  const [stockDataLoaded, setStockDataLoaded] = useState(false);

  useEffect(() => {
    const today = toBusinessDate();
    const unsubscribe = onSnapshot(
      doc(db, 'bakeryDailyReconciliation', today),
      (snapshot) => {
        if (!snapshot.exists()) {
          setAvailabilityByItemId({});
          setStockDataLoaded(true);
          return;
        }
        const data = snapshot.data() as BakeryDailyReconciliation;
        const byItemId: Record<string, number> = {};
        (data.lines || []).forEach((line) => {
          if (line.itemId) {
            byItemId[line.itemId] = line.closingExpected;
          }
        });
        setAvailabilityByItemId(byItemId);
        setStockDataLoaded(true);
      }
    );
    return () => unsubscribe();
  }, []);

  const activeCategory = useMemo(() => {
    if (bakeryCategories.length === 0) return null;
    if (!selectedCategoryId) return bakeryCategories[0];
    return bakeryCategories.find((category) => category.id === selectedCategoryId) || bakeryCategories[0];
  }, [bakeryCategories, selectedCategoryId]);

  const categoryMap = useMemo(() => {
    return bakeryCategories.reduce((acc: Record<string, BakeryCategory>, category) => {
      acc[category.id] = category;
      return acc;
    }, {} as Record<string, BakeryCategory>);
  }, [bakeryCategories]);

  const activeItems = useMemo(() => {
    if (!activeCategory) return [];
    return bakeryItems.filter((item) => item.bakeryCategoryId === activeCategory.id);
  }, [bakeryItems, activeCategory]);

  const menuItemForModal = useMemo(() => {
    if (!selectedBakeryItem) return null;
    const category = categoryMap[selectedBakeryItem.bakeryCategoryId];
    return adaptBakeryItemToMenuItem(selectedBakeryItem, category);
  }, [selectedBakeryItem, categoryMap]);

  const handleCustomizationConfirm = (item: MenuItem, customization: ItemCustomization) => {
    addToCart(item, customization);
    setSelectedBakeryItem(null);
  };

  const getCategoryIcon = (categoryId: string) => {
    if (categoryId === 'breads') return <Sandwich className="w-6 h-6" />;
    if (categoryId === 'cakes') return <Cake className="w-6 h-6" />;
    if (categoryId === 'pastries-snacks') return <Croissant className="w-6 h-6" />;
    if (categoryId === 'breakfast-light-bites') return <Coffee className="w-6 h-6" />;
    return <Sandwich className="w-6 h-6" />;
  };

  const whatsappMessage = encodeURIComponent("Hello Kuci! What are today’s fresh bakery and pastry selections?");

  return (
    <div className="animate-in slide-in-from-right-4 duration-500">
      <CustomizerModal
        item={menuItemForModal}
        onClose={() => setSelectedBakeryItem(null)}
        onConfirm={handleCustomizationConfirm}
      />

      {staffSession && (
        <div className="sticky top-[72px] z-40 bg-[var(--color-primary)] text-white px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-widest opacity-75">Building staff order</p>
            <p className="text-xs font-semibold truncate">{staffSession.customerName || 'Customer'}</p>
          </div>
          <button
            onClick={staffSession.onReturn}
            className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-full bg-white/20 hover:bg-white/30 border border-white/30 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-colors"
          >
            {staffSession.staffCartCount > 0
              ? `Back to Order · ${staffSession.staffCartCount} item${staffSession.staffCartCount !== 1 ? 's' : ''}`
              : 'Back to Staff Order'}
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}

      <div className="px-4 py-8 space-y-8">

      <header className="text-center space-y-2">
        <h2 className="text-3xl font-serif">Bakery & Pastries</h2>
        <p className="text-[var(--color-primary)] font-bold uppercase tracking-widest text-xs">Freshly baked daily</p>
      </header>

      <section className="space-y-4">
        <h3 className="text-lg font-serif px-1">Bakery Categories</h3>
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
          {bakeryCategories.map((category) => {
            const isActive = activeCategory?.id === category.id;
            return (
              <button
                key={category.id}
                onClick={() => setSelectedCategoryId(category.id)}
                className={`flex-shrink-0 px-4 py-3 rounded-2xl border transition-all text-left min-w-[180px] ${
                  isActive
                    ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)] shadow-lg shadow-[var(--color-primary)]/20'
                    : 'bg-[var(--color-bg)] text-[var(--color-text)] border-[var(--color-border)]'
                }`}
              >
                <div className="flex items-center gap-3">
                  {getCategoryIcon(category.id)}
                  <div>
                    <p className="text-sm font-bold">{category.name}</p>
                    {category.description && (
                      <p className={`text-[10px] ${isActive ? 'text-white/80' : 'text-[var(--color-text-muted)]'}`}>
                        {category.description}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-lg font-serif">
            {activeCategory ? activeCategory.name : 'Bakery Items'}
          </h3>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">
            {activeItems.length} items
          </p>
        </div>

        {activeItems.length > 0 ? (
          <div className="space-y-4">
            {activeItems.map((item) => {
              const menuItem = adaptBakeryItemToMenuItem(item, categoryMap[item.bakeryCategoryId]);
              const isMadeToOrder = item.fulfillmentMode === 'made_to_order';
              const rawQty = item.id in availabilityByItemId ? availabilityByItemId[item.id] : undefined;
              const stockStatus = stockDataLoaded ? getStockStatus(rawQty) : 'unknown';
              const isOutOfStock = stockStatus === 'out_of_stock';

              return (
                <div key={item.id} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-3xl p-4 shadow-sm space-y-3">
                  <div className="flex gap-4">
                    <SafeImage
                      src={getMenuItemPrimaryImage(menuItem, menuCategories)}
                      alt={item.name}
                      className="w-20 h-20 rounded-2xl object-cover"
                      fallbackLabel="KUCI"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <h4 className="text-lg font-serif uppercase leading-tight">{item.name}</h4>
                        <span className="text-[var(--color-primary)] font-bold text-sm whitespace-nowrap">
                          {getMenuItemPriceLabel(menuItem)}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--color-text-muted)] italic line-clamp-2">"{item.description}"</p>
                      <div className="flex items-center gap-2 mt-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">
                          {isMadeToOrder ? 'Made to order' : 'Ready to serve'}
                        </p>
                        {stockDataLoaded && (
                          <StockBadge
                            status={stockStatus}
                            qty={stockStatus === 'low_stock' ? rawQty : undefined}
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  {isOutOfStock ? (
                    <div className="w-full flex flex-col items-center justify-center gap-1 bg-red-50 border border-red-200 text-red-600 py-3.5 rounded-2xl">
                      <p className="font-black uppercase tracking-widest text-[10px]">Out of stock</p>
                      <p className="text-[9px] text-red-400 uppercase tracking-wider">Check again later</p>
                    </div>
                  ) : (
                    <button
                      onClick={() => setSelectedBakeryItem(item)}
                      className="w-full flex items-center justify-center gap-2 bg-[var(--color-text)] text-white py-3.5 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all active:scale-95"
                    >
                      <Plus className="w-4 h-4" />
                      Add to Order
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 bg-[var(--color-primary)]/5 rounded-[40px] border-2 border-dashed border-[var(--color-border)]">
            <p className="text-[var(--color-text-muted)] italic">No bakery items found in this category yet.</p>
          </div>
        )}
      </section>

      <section className="bg-[var(--color-border)] rounded-[32px] p-8 text-center space-y-6">
        <p className="text-[var(--color-text)] text-sm font-medium leading-relaxed">
          “Pastry selection varies daily. Ask on WhatsApp for today’s fresh bakes.”
        </p>
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
      </div>
    </div>
  );
};
