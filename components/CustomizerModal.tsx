import React, { useEffect, useMemo, useState } from 'react';
import { X, Check, Edit3, MessageSquare, Info, CheckCircle2, Star, User, Tag } from 'lucide-react';
import { EXTRA_COSTS } from '../constants';
import { ItemCustomization, MenuItem, ModifierGroup, Review } from '../types';
import { getDefaultVariant, getMenuItemBasePrice, getMenuItemPrimaryImage } from '../lib/catalog';
import { getItemRatingSummaryForItem } from '../lib/itemRatings';
import { SafeImage } from './SafeImage';

interface CustomizerModalProps {
  item: MenuItem | null;
  initialCustomization?: ItemCustomization;
  onClose: () => void;
  onConfirm: (item: MenuItem, customization: ItemCustomization) => void;
}

function getSelectionText(group: ModifierGroup): string {
  if (group.selectionType === 'single') return 'Choose 1';
  if (group.minSelections || group.maxSelections) {
    const min = group.minSelections ?? 0;
    const max = group.maxSelections ?? 'any';
    return `${min}-${max} selections`;
  }
  return 'Optional';
}

export const CustomizerModal: React.FC<CustomizerModalProps> = ({ item, initialCustomization, onClose, onConfirm }) => {
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});
  const [extra1, setExtra1] = useState('');
  const [extra2, setExtra2] = useState('');
  const [instructions, setInstructions] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (!item) return;

    const defaultVariant = getDefaultVariant(item);
    const modifierState: Record<string, string[]> = {};

    if (initialCustomization?.selectedModifiers) {
      for (const selected of initialCustomization.selectedModifiers) {
        modifierState[selected.groupId] = selected.optionIds;
      }
    }

    setSelectedVariantId(initialCustomization?.selectedVariantId || defaultVariant?.id || '');
    setSelectedOptions(modifierState);
    setExtra1(initialCustomization?.extras?.[0] || '');
    setExtra2(initialCustomization?.extras?.[1] || '');
    setInstructions(initialCustomization?.instructions || '');
  }, [item, initialCustomization]);

  const selectedVariant = useMemo(() => {
    if (!item?.variants?.length) return undefined;
    return item.variants.find((variant) => variant.id === selectedVariantId) || getDefaultVariant(item);
  }, [item, selectedVariantId]);

  const selectedModifiers = useMemo(() => {
    if (!item?.modifierGroups?.length) return [];

    return item.modifierGroups.flatMap((group) => {
      const optionIds = selectedOptions[group.id] || [];
      if (optionIds.length === 0) return [];

      const optionNames = group.options.filter((option) => optionIds.includes(option.id)).map((option) => option.name);
      const priceDelta = group.options
        .filter((option) => optionIds.includes(option.id))
        .reduce((total, option) => total + option.priceDelta, 0);

      return [{
        groupId: group.id,
        groupName: group.name,
        optionIds,
        optionNames,
        priceDelta,
      }];
    });
  }, [item, selectedOptions]);

  const modifierExtraCost = selectedModifiers.reduce((total, modifier) => total + modifier.priceDelta, 0);
  const variantExtraCost = selectedVariant ? selectedVariant.price - getMenuItemBasePrice(item || undefined) : 0;
  const extraCount = [extra1, extra2].filter((extra) => extra.trim().length > 0).length;
  const otherExtrasCost = extraCount * EXTRA_COSTS.OTHER_EXTRA;
  const currentExtraCost = variantExtraCost + modifierExtraCost + otherExtrasCost;
  const currentTotal = (selectedVariant?.price || getMenuItemBasePrice(item || undefined)) + modifierExtraCost + otherExtrasCost;

  const isReadyToConfirm = useMemo(() => {
    if (!item) return false;

    return (item.modifierGroups || []).every((group) => {
      const count = (selectedOptions[group.id] || []).length;
      const minSelections = group.required ? (group.minSelections ?? 1) : (group.minSelections ?? 0);
      return count >= minSelections;
    });
  }, [item, selectedOptions]);
  if (!item) return null;

  const ratingSummary = getItemRatingSummaryForItem(item);

  const toggleOption = (group: ModifierGroup, optionId: string) => {
    setSelectedOptions((prev) => {
      const existing = prev[group.id] || [];

      if (group.selectionType === 'single') {
        return { ...prev, [group.id]: [optionId] };
      }

      if (existing.includes(optionId)) {
        return { ...prev, [group.id]: existing.filter((id) => id !== optionId) };
      }

      const maxSelections = group.maxSelections ?? Number.MAX_SAFE_INTEGER;
      if (existing.length >= maxSelections) {
        return prev;
      }

      return { ...prev, [group.id]: [...existing, optionId] };
    });
  };

  const handleConfirm = () => {
    if (!isReadyToConfirm) return;

    setIsSuccess(true);
    setTimeout(() => {
      const extras = [extra1, extra2].filter((extra) => extra.trim().length > 0);
      const accompanimentModifier = selectedModifiers.find((modifier) => modifier.groupId === 'accompaniments');
      const toppingModifier = selectedModifiers
        .filter((modifier) => modifier.groupId !== 'accompaniments')
        .flatMap((modifier) => modifier.optionNames);

      const customization: ItemCustomization = {
        selectedVariantId: selectedVariant?.id,
        selectedVariantName: selectedVariant?.name,
        selectedVariantPrice: selectedVariant?.price,
        selectedModifiers,
        sides: accompanimentModifier?.optionNames,
        toppings: toppingModifier.length > 0 ? toppingModifier : undefined,
        extras: extras.length > 0 ? extras : undefined,
        instructions: instructions.trim().length > 0 ? instructions : undefined,
        extraCost: currentExtraCost,
      };

      onConfirm(item, customization);
      setIsSuccess(false);
    }, 450);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="w-full max-w-md bg-[var(--color-bg)] rounded-t-[48px] shadow-2xl flex flex-col h-[94vh] overflow-hidden animate-in slide-in-from-bottom duration-500 ease-out">
        <div className="relative h-64 shrink-0 overflow-hidden">
          <SafeImage
            src={getMenuItemPrimaryImage(item)}
            alt={item.name}
            className="w-full h-full object-cover animate-in zoom-in-110 duration-1000"
            fallbackLabel="KUCI"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-bg)] via-transparent to-transparent" />

          <button
            onClick={onClose}
            className="absolute top-6 right-6 p-3 bg-white/20 backdrop-blur-md border border-white/30 rounded-full text-white active:scale-90 transition-transform shadow-lg"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="absolute bottom-6 right-8 bg-[var(--color-primary)] text-white px-5 py-2 rounded-2xl font-black text-sm shadow-xl animate-in fade-in slide-in-from-right duration-700">
            {currentTotal.toLocaleString()} RWF
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-10 no-scrollbar pb-12">
          <section className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500 delay-100">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                {item.tagline && (
                  <p className="text-[var(--color-primary)] text-[10px] font-black uppercase tracking-[0.2em]">
                    {item.tagline}
                  </p>
                )}
                {ratingSummary.hasRatings ? (
                  <div className="flex items-center gap-1 bg-[var(--color-rating)]/10 px-2 py-1 rounded-lg">
                    <Star className="w-3 h-3 text-[var(--color-rating)] fill-[var(--color-rating)]" />
                    <span className="text-[10px] font-black text-[var(--color-primary)]">{ratingSummary.summaryLabel}</span>
                  </div>
                ) : (
                  <div className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">
                    {ratingSummary.summaryLabel}
                  </div>
                )}
              </div>
              <h3 className="text-3xl font-serif text-[var(--color-text)] uppercase leading-tight">{item.name}</h3>
            </div>

            <div className="bg-[var(--color-primary)]/5 rounded-3xl p-5 border border-[var(--color-border)]">
              <p className="text-[var(--color-text)]/70 text-sm leading-relaxed italic">
                "{item.description}"
              </p>
            </div>

            {item.note && (
              <div className="bg-[var(--color-bg-secondary)] p-4 rounded-2xl text-[10px] text-[var(--color-text)]/60 font-bold uppercase tracking-tight flex gap-3 items-center">
                <Info className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
                <span>{item.note}</span>
              </div>
            )}
          </section>

          <div className="h-px bg-[var(--color-border)] w-full" />

          <section className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
            <h4 className="text-xs font-black text-[var(--color-text)]/30 uppercase tracking-[0.3em]">Personalize Your Order</h4>

            {item.variants && item.variants.length > 0 && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-serif flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-[var(--color-primary)]/10 flex items-center justify-center text-[var(--color-primary)]">
                      <Tag className="w-4 h-4" />
                    </div>
                    Choose a Variant
                  </h4>
                  <span className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest">{item.variants.length} options</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {item.variants.filter((variant) => variant.active !== false).map((variant) => (
                    <button
                      key={variant.id}
                      onClick={() => setSelectedVariantId(variant.id)}
                      className={`px-4 py-4 rounded-2xl text-[10px] font-black uppercase tracking-tighter border-2 transition-all text-left ${
                        selectedVariantId === variant.id
                          ? 'bg-[var(--color-text)] text-white border-[var(--color-text)] scale-[1.02]'
                          : 'bg-white text-[var(--color-text)] border-[var(--color-border)]'
                      }`}
                    >
                      <span className="block">{variant.name}</span>
                      <span className={`block mt-1 text-[9px] ${selectedVariantId === variant.id ? 'text-white/70' : 'text-[var(--color-primary)]'}`}>
                        {variant.price.toLocaleString()} RWF
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(item.modifierGroups || []).map((group) => {
              const currentSelections = selectedOptions[group.id] || [];
              return (
                <div key={group.id} className="space-y-5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-lg font-serif flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-[var(--color-primary)]/10 flex items-center justify-center text-[var(--color-primary)]">
                        <Check className="w-4 h-4" />
                      </div>
                      {group.name}
                    </h4>
                    <span className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest">
                      {currentSelections.length} selected · {getSelectionText(group)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {group.options.filter((option) => option.active !== false).map((option) => {
                      const isSelected = currentSelections.includes(option.id);
                      const disabled =
                        group.selectionType === 'multiple' &&
                        !isSelected &&
                        typeof group.maxSelections === 'number' &&
                        currentSelections.length >= group.maxSelections;

                      return (
                        <button
                          key={option.id}
                          onClick={() => toggleOption(group, option.id)}
                          disabled={disabled}
                          className={`px-4 py-4 rounded-2xl text-[10px] font-black uppercase tracking-tighter border-2 transition-all flex items-center justify-between shadow-sm ${
                            isSelected
                              ? 'bg-[var(--color-text)] text-white border-[var(--color-text)] scale-[1.02]'
                              : 'bg-white text-[var(--color-text)] border-[var(--color-border)] disabled:opacity-30'
                          }`}
                        >
                          <div className="text-left">
                            <span className="block">{option.name}</span>
                            {option.priceDelta > 0 && (
                              <span className={`block mt-1 text-[9px] ${isSelected ? 'text-white/70' : 'text-[var(--color-primary)]'}`}>
                                +{option.priceDelta.toLocaleString()} RWF
                              </span>
                            )}
                          </div>
                          {isSelected && <Check className="w-3 h-3 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-serif flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-[var(--color-primary)]/10 flex items-center justify-center text-[var(--color-primary)]">
                    <Edit3 className="w-4 h-4" />
                  </div>
                  Add Other Extras
                </h4>
                <span className="text-[10px] font-black text-[var(--color-primary)] uppercase tracking-widest">+{EXTRA_COSTS.OTHER_EXTRA.toLocaleString()} RWF / ea</span>
              </div>
              <div className="space-y-3">
                <input
                  type="text"
                  value={extra1}
                  onChange={(event) => setExtra1(event.target.value)}
                  placeholder="specify the extra"
                  className="w-full bg-[var(--color-bg-secondary)]/30 border-2 border-transparent focus:border-[var(--color-primary)] focus:bg-white rounded-2xl px-6 py-5 text-sm outline-none transition-all placeholder:text-[var(--color-text)]/30"
                />
                <input
                  type="text"
                  value={extra2}
                  onChange={(event) => setExtra2(event.target.value)}
                  placeholder="specify the extra"
                  className="w-full bg-[var(--color-bg-secondary)]/30 border-2 border-transparent focus:border-[var(--color-primary)] focus:bg-white rounded-2xl px-6 py-5 text-sm outline-none transition-all placeholder:text-[var(--color-text)]/30"
                />
              </div>
            </div>

            <div className="space-y-5">
              <h4 className="text-lg font-serif flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[var(--color-primary)]/10 flex items-center justify-center text-[var(--color-primary)]">
                  <MessageSquare className="w-4 h-4" />
                </div>
                Preparation Instructions
              </h4>
              <div className="bg-[var(--color-bg-secondary)]/20 rounded-3xl p-1 shadow-inner border-2 border-transparent focus-within:border-[var(--color-primary)] transition-all">
                <textarea
                  value={instructions}
                  onChange={(event) => setInstructions(event.target.value)}
                  placeholder="Tell us how you'd like your meal prepared..."
                  className="w-full bg-[var(--color-bg)]/50 rounded-[22px] p-5 text-sm outline-none resize-none transition-all min-h-[120px] placeholder:italic placeholder:text-[var(--color-text)]/30"
                  rows={4}
                />
              </div>
            </div>
          </section>

          <div className="h-px bg-[var(--color-border)] w-full" />

          <section className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300">
            <div className="flex items-center justify-between">
              <h4 className="text-xl font-serif flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[var(--color-primary)]/10 flex items-center justify-center text-[var(--color-primary)]">
                  <Star className="w-4 h-4" />
                </div>
                Guest Reviews
              </h4>
              <p className="text-[10px] font-black text-[var(--color-primary)] uppercase tracking-widest">
                Rate from completed orders
              </p>
            </div>

            {item.reviews && item.reviews.length > 0 ? (
              <div className="space-y-6">
                {item.reviews.map((review: Review, index) => (
                  <div key={index} className="space-y-3 pb-6 border-b border-[var(--color-border)] last:border-none">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[var(--color-bg-secondary)] flex items-center justify-center text-[var(--color-text)]">
                          <User className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-black text-[var(--color-text)]">{review.user}</p>
                          <div className="flex items-center gap-0.5">
                            {[...Array(5)].map((_, starIndex) => (
                              <Star key={starIndex} className={`w-2 h-2 ${starIndex < review.rating ? 'text-[var(--color-rating)] fill-[var(--color-rating)]' : 'text-[var(--color-border)]'}`} />
                            ))}
                          </div>
                        </div>
                      </div>
                      <span className="text-[8px] font-black text-[var(--color-text-muted)] uppercase tracking-widest">{review.date}</span>
                    </div>
                    <p className="text-xs text-[var(--color-text)]/60 italic leading-relaxed">"{review.comment}"</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 bg-[var(--color-bg-secondary)]/20 rounded-[32px] border-2 border-dashed border-[var(--color-border)]">
                <MessageSquare className="w-8 h-8 text-[var(--color-border)] mx-auto mb-3" />
                <p className="text-[10px] text-[var(--color-text-muted)] italic">No ratings yet. Completed self-orders can leave the first review from Order History.</p>
              </div>
            )}
          </section>
        </div>

        <footer className="p-8 bg-white border-t border-[var(--color-border)] sticky bottom-0 z-10 safe-bottom">
          <button
            onClick={handleConfirm}
            disabled={!isReadyToConfirm}
            className={`w-full py-6 rounded-[32px] font-black uppercase tracking-[0.2em] shadow-2xl flex items-center justify-between px-10 text-xs transition-all ${
              isSuccess
                ? 'bg-[#25D366] text-white'
                : isReadyToConfirm
                  ? 'bg-[var(--color-primary)] text-white shadow-[var(--color-primary)]/20 active:scale-95'
                  : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)] cursor-not-allowed'
            }`}
          >
            {isSuccess ? (
              <span className="flex items-center gap-3 mx-auto animate-in zoom-in duration-300">
                <CheckCircle2 className="w-6 h-6" /> Item Updated!
              </span>
            ) : (
              <>
                <span className="flex items-center gap-2">{initialCustomization ? 'Save Changes' : 'Add to Order'}</span>
                <span className="font-serif text-2xl border-l border-white/20 pl-8">
                  {currentTotal.toLocaleString()} RWF
                </span>
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
  );
};
