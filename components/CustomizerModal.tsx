
import React, { useState, useEffect } from 'react';
import { X, Check, Utensils, Pizza as PizzaIcon, Edit3, MessageSquare, Info, CheckCircle2, Cherry, Star, Send, User } from 'lucide-react';
import { CUSTOMIZATION_OPTIONS, EXTRA_COSTS, ACCOMPANIMENTS_NOTE } from '../constants';
import { MenuItem, ItemCustomization, Review } from '../types';

interface CustomizerModalProps {
  item: MenuItem | null;
  initialCustomization?: ItemCustomization;
  onClose: () => void;
  onConfirm: (item: MenuItem, customization: ItemCustomization) => void;
}

export const CustomizerModal: React.FC<CustomizerModalProps> = ({ item, initialCustomization, onClose, onConfirm }) => {
  const [selectedSides, setSelectedSides] = useState<string[]>([]);
  const [selectedToppings, setSelectedToppings] = useState<string[]>([]);
  const [extra1, setExtra1] = useState("");
  const [extra2, setExtra2] = useState("");
  const [instructions, setInstructions] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  
  // Review form state
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [newReviewRating, setNewReviewRating] = useState(5);
  const [newReviewComment, setNewReviewComment] = useState("");
  const [newReviewName, setNewReviewName] = useState("");

  // Pre-fill state if initialCustomization is provided
  useEffect(() => {
    if (item && initialCustomization) {
      setSelectedSides(initialCustomization.sides || []);
      setSelectedToppings(initialCustomization.toppings || []);
      setExtra1(initialCustomization.extras?.[0] || "");
      setExtra2(initialCustomization.extras?.[1] || "");
      setInstructions(initialCustomization.instructions || "");
    } else {
      setSelectedSides([]);
      setSelectedToppings([]);
      setExtra1("");
      setExtra2("");
      setInstructions("");
    }
    setShowReviewForm(false);
  }, [item, initialCustomization]);

  if (!item) return null;

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

  const handleConfirm = () => {
    setIsSuccess(true);
    setTimeout(() => {
      const extras = [extra1, extra2].filter(e => e.trim().length > 0);
      const customization: ItemCustomization = {
        sides: selectedSides.length > 0 ? selectedSides : undefined,
        toppings: selectedToppings.length > 0 ? selectedToppings : undefined,
        extras: extras.length > 0 ? extras : undefined,
        instructions: instructions.trim().length > 0 ? instructions : undefined,
        extraCost: currentExtraCost
      };
      onConfirm(item, customization);
      setIsSuccess(false);
    }, 450);
  };

  const getItemImage = () => {
    if (item.category === 'Café Signature Cocktails') return "https://images.unsplash.com/photo-1545438102-799c3991ffb2?auto=format&fit=crop&q=80&w=800";
    if (item.category === 'Coffee & Espresso' || item.category === 'Iced Espresso & Coffee') return "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&q=80&w=800";
    if (item.category === 'Kuci Pizza') return "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&q=80&w=800";
    if (item.category === 'Kuci Burgers') return "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&q=80&w=800";
    if (item.name === 'PANCAKES & WAFFLES') return "https://images.unsplash.com/photo-1528207776546-365bb710ee93?auto=format&fit=crop&q=80&w=800";
    if (item.name === 'BREAKFAST BURRITO') return "https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&q=80&w=800";
    return "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=800";
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="w-full max-w-md bg-[#fffdfa] rounded-t-[48px] shadow-2xl flex flex-col h-[94vh] overflow-hidden animate-in slide-in-from-bottom duration-500 ease-out">
        
        <div className="relative h-64 shrink-0 overflow-hidden">
          <img 
            src={getItemImage()} 
            alt={item.name} 
            className="w-full h-full object-cover animate-in zoom-in-110 duration-1000"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#fffdfa] via-transparent to-transparent" />
          
          <button 
            onClick={onClose} 
            className="absolute top-6 right-6 p-3 bg-white/20 backdrop-blur-md border border-white/30 rounded-full text-white active:scale-90 transition-transform shadow-lg"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="absolute bottom-6 right-8 bg-[#f97316] text-white px-5 py-2 rounded-2xl font-black text-sm shadow-xl animate-in fade-in slide-in-from-right duration-700">
            {item.price.toLocaleString()} RWF
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-10 no-scrollbar pb-12">
          <section className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500 delay-100">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                {item.tagline && (
                  <p className="text-[#f97316] text-[10px] font-black uppercase tracking-[0.2em]">
                    {item.tagline}
                  </p>
                )}
                {item.averageRating && (
                  <div className="flex items-center gap-1 bg-yellow-400/10 px-2 py-1 rounded-lg">
                    <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                    <span className="text-[10px] font-black text-yellow-700">{item.averageRating.toFixed(1)}</span>
                  </div>
                )}
              </div>
              <h3 className="text-3xl font-serif text-[#3e2723] uppercase leading-tight">{item.name}</h3>
            </div>
            
            <div className="bg-orange-50/50 rounded-3xl p-5 border border-orange-100/50">
              <p className="text-[#3e2723]/70 text-sm leading-relaxed italic">
                "{item.description}"
              </p>
            </div>

            {item.note && (
              <div className="bg-[#f5f5dc] p-4 rounded-2xl text-[10px] text-[#3e2723]/60 font-bold uppercase tracking-tight flex gap-3 items-center">
                <Info className="w-4 h-4 text-[#f97316] shrink-0" />
                <span>{item.note}</span>
              </div>
            )}
          </section>

          <div className="h-px bg-[#f5f5dc] w-full" />

          <section className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
            <h4 className="text-xs font-black text-[#3e2723]/30 uppercase tracking-[0.3em]">Personalize Your Order</h4>
            {item.note === ACCOMPANIMENTS_NOTE && (
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

            {item.name === "PANCAKES & WAFFLES" && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-serif flex items-center gap-3">
                     <div className="w-8 h-8 rounded-xl bg-orange-100 flex items-center justify-center text-[#f97316]">
                      <Cherry className="w-4 h-4" />
                    </div>
                    Toppings
                  </h4>
                  <span className="text-[10px] font-black text-[#f97316] uppercase tracking-widest">Select Toppings</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {CUSTOMIZATION_OPTIONS.BREAKFAST_TOPPINGS.map(topping => (
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

            {item.name === "BREAKFAST BURRITO" && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-serif flex items-center gap-3">
                     <div className="w-8 h-8 rounded-xl bg-orange-100 flex items-center justify-center text-[#f97316]">
                      <Utensils className="w-4 h-4" />
                    </div>
                    Fillings
                  </h4>
                  <span className="text-[10px] font-black text-[#f97316] uppercase tracking-widest">Add Fillings</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {CUSTOMIZATION_OPTIONS.BURRITO_FILLINGS.map(filling => (
                    <button
                      key={filling}
                      onClick={() => toggleTopping(filling)}
                      className={`px-4 py-4 rounded-2xl text-[10px] font-black uppercase tracking-tighter border-2 transition-all flex items-center justify-between shadow-sm ${
                        selectedToppings.includes(filling)
                          ? 'bg-[#3e2723] text-white border-[#3e2723] scale-[1.02]'
                          : 'bg-white text-[#3e2723]/40 border-[#f5f5dc]'
                      }`}
                    >
                      {filling}
                      {selectedToppings.includes(filling) && <Check className="w-3 h-3" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {item.category === "Kuci Pizza" && (
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
                <input 
                  type="text"
                  value={extra1}
                  onChange={(e) => setExtra1(e.target.value)}
                  placeholder="specify the extra"
                  className="w-full bg-[#f5f5dc]/30 border-2 border-transparent focus:border-[#f97316] focus:bg-white rounded-2xl px-6 py-5 text-sm outline-none transition-all placeholder:text-[#3e2723]/30"
                />
                <input 
                  type="text"
                  value={extra2}
                  onChange={(e) => setExtra2(e.target.value)}
                  placeholder="specify the extra"
                  className="w-full bg-[#f5f5dc]/30 border-2 border-transparent focus:border-[#f97316] focus:bg-white rounded-2xl px-6 py-5 text-sm outline-none transition-all placeholder:text-[#3e2723]/30"
                />
              </div>
            </div>

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
                  placeholder="Tell us how you'd like your meal prepared..."
                  className="w-full bg-[#fffdfa]/50 rounded-[22px] p-5 text-sm outline-none resize-none transition-all min-h-[120px] placeholder:italic placeholder:text-[#3e2723]/30"
                  rows={4}
                />
              </div>
            </div>
          </section>

          <div className="h-px bg-[#f5f5dc] w-full" />

          {/* REVIEWS SECTION */}
          <section className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300">
            <div className="flex items-center justify-between">
              <h4 className="text-xl font-serif flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-orange-100 flex items-center justify-center text-[#f97316]">
                  <Star className="w-4 h-4" />
                </div>
                Guest Reviews
              </h4>
              <button 
                onClick={() => setShowReviewForm(!showReviewForm)}
                className="text-[10px] font-black text-[#f97316] uppercase tracking-widest border-b border-[#f97316]/30 pb-0.5"
              >
                {showReviewForm ? 'Cancel' : 'Write a Review'}
              </button>
            </div>

            {showReviewForm && (
              <div className="bg-white border border-[#f5f5dc] rounded-[32px] p-6 space-y-4 shadow-sm animate-in zoom-in-95 duration-300">
                <div className="space-y-1">
                   <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-1">Your Rating</p>
                   <div className="flex items-center gap-2">
                     {[1, 2, 3, 4, 5].map((star) => (
                       <button 
                         key={star} 
                         onClick={() => setNewReviewRating(star)}
                         className="p-1 transition-transform active:scale-75"
                       >
                         <Star className={`w-6 h-6 ${star <= newReviewRating ? 'text-yellow-500 fill-yellow-500' : 'text-gray-200'}`} />
                       </button>
                     ))}
                   </div>
                </div>
                <input 
                  type="text" 
                  value={newReviewName}
                  onChange={(e) => setNewReviewName(e.target.value)}
                  placeholder="Your Name" 
                  className="w-full px-5 py-4 rounded-2xl bg-[#f5f5dc]/30 border-2 border-transparent focus:border-[#f97316] focus:bg-white outline-none text-sm transition-all"
                />
                <textarea 
                  value={newReviewComment}
                  onChange={(e) => setNewReviewComment(e.target.value)}
                  placeholder="What did you think of the flavor?" 
                  rows={3}
                  className="w-full px-5 py-4 rounded-2xl bg-[#f5f5dc]/30 border-2 border-transparent focus:border-[#f97316] focus:bg-white outline-none text-sm resize-none transition-all"
                />
                <button 
                  disabled={!newReviewComment || !newReviewName}
                  className="w-full bg-[#3e2723] text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 disabled:opacity-30 disabled:grayscale transition-all"
                >
                  Post Review <Send className="w-3 h-3" />
                </button>
              </div>
            )}

            {item.reviews && item.reviews.length > 0 ? (
              <div className="space-y-6">
                {item.reviews.map((review, idx) => (
                  <div key={idx} className="space-y-3 pb-6 border-b border-[#f5f5dc] last:border-none">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#f5f5dc] flex items-center justify-center text-[#3e2723]">
                          <User className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-black text-[#3e2723]">{review.user}</p>
                          <div className="flex items-center gap-0.5">
                            {[...Array(5)].map((_, i) => (
                              <Star key={i} className={`w-2 h-2 ${i < review.rating ? 'text-yellow-500 fill-yellow-500' : 'text-gray-200'}`} />
                            ))}
                          </div>
                        </div>
                      </div>
                      <span className="text-[8px] font-black text-gray-300 uppercase tracking-widest">{review.date}</span>
                    </div>
                    <p className="text-xs text-[#3e2723]/60 italic leading-relaxed">"{review.comment}"</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 bg-[#f5f5dc]/20 rounded-[32px] border-2 border-dashed border-[#f5f5dc]">
                <MessageSquare className="w-8 h-8 text-gray-200 mx-auto mb-3" />
                <p className="text-[10px] text-gray-400 italic">No reviews yet. Be the first to share your thoughts!</p>
              </div>
            )}
          </section>
        </div>

        <footer className="p-8 bg-white border-t border-[#f5f5dc] sticky bottom-0 z-10 safe-bottom">
          <button 
            onClick={handleConfirm}
            className={`w-full py-6 rounded-[32px] font-black uppercase tracking-[0.2em] shadow-2xl flex items-center justify-between px-10 text-xs active:scale-95 transition-all ${isSuccess ? 'bg-[#25D366] text-white' : 'bg-[#f97316] text-white shadow-orange-200'}`}
          >
            {isSuccess ? (
              <span className="flex items-center gap-3 mx-auto animate-in zoom-in duration-300">
                <CheckCircle2 className="w-6 h-6" /> Item Updated!
              </span>
            ) : (
              <>
                <span className="flex items-center gap-2">{initialCustomization ? 'Save Changes' : 'Add to Order'}</span>
                <span className="font-serif text-2xl border-l border-white/20 pl-8">
                  {(item.price + currentExtraCost).toLocaleString()} RWF
                </span>
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
  );
};
