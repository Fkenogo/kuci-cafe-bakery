
import React, { useState, useEffect } from 'react';
import { Trash2, Plus, Minus, Send, Phone, Wallet, Truck, ShoppingBag, MapPin, Sparkles, Clock, UserCheck, AlertCircle, Utensils, Pizza, MessageSquare, Info, CheckCircle2, User, Package, History, ChevronRight, RefreshCw, Tag, Edit } from 'lucide-react';
import { CartItem, OrderType, DeliveryArea, UserProfile, HistoricalOrder, ItemCustomization } from '../types';
import { CONTACT_INFO, DELIVERY_OPTIONS, CATEGORY_ICONS } from '../constants';
import { CustomizerModal } from '../components/CustomizerModal';

interface OrdersViewProps {
  cart: CartItem[];
  updateQuantity: (id: string, delta: number) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
  loyaltyPoints: number;
  userProfile: UserProfile;
  setUserProfile: (profile: UserProfile) => void;
  onOrderComplete: (order: HistoricalOrder) => void;
  orderHistory: HistoricalOrder[];
  onReorder: (items: CartItem[]) => void;
  onUpdateCustomization: (instanceId: string, customization: ItemCustomization) => void;
}

export const OrdersView: React.FC<OrdersViewProps> = ({ 
  cart, updateQuantity, removeFromCart, clearCart, loyaltyPoints, userProfile, setUserProfile, onOrderComplete, orderHistory, onReorder, onUpdateCustomization
}) => {
  const [orderType, setOrderType] = useState<OrderType>(OrderType.PICK_UP);
  const [deliveryArea, setDeliveryArea] = useState<DeliveryArea>(DeliveryArea.NYAMATA_CENTRAL);
  const [editingItem, setEditingItem] = useState<CartItem | null>(null);
  
  // Local state for the identity form
  const [tempProfile, setTempProfile] = useState<UserProfile>(userProfile);
  const isIdentified = !!(userProfile.name && userProfile.phone);
  const [showProfileForm, setShowProfileForm] = useState(!isIdentified);

  // Sync temp state if external profile changes
  useEffect(() => {
    if (!tempProfile.name && userProfile.name) {
      setTempProfile(userProfile);
    }
    if (isIdentified) {
      setShowProfileForm(false);
    }
  }, [userProfile, isIdentified]);

  const productSubtotal = cart.reduce((acc, item) => acc + ((item.price + (item.customization?.extraCost || 0)) * item.quantity), 0);
  const deliveryInfo = DELIVERY_OPTIONS[deliveryArea];
  const deliveryFee = orderType === OrderType.DELIVERY ? deliveryInfo.fee : 0;
  
  const earnedPoints = Math.floor(productSubtotal / 100);
  const discount = Math.min(productSubtotal, loyaltyPoints * 1);
  const total = (productSubtotal - discount) + deliveryFee;

  const isInputValid = tempProfile.name.trim().length > 2 && tempProfile.phone.trim().length >= 10;

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (isInputValid) {
      setUserProfile({
        ...userProfile,
        name: tempProfile.name.trim(),
        phone: tempProfile.phone.trim()
      });
      setShowProfileForm(false);
    }
  };

  const handleMomoPayment = () => {
    if (!isIdentified) {
      setShowProfileForm(true);
      return;
    }
    const ussdString = `*182*8*1*${CONTACT_INFO.paybill}%23`;
    window.location.href = `tel:${ussdString}`;
  };

  const handleWhatsAppOrder = () => {
    if (!isIdentified) {
      setShowProfileForm(true);
      return;
    }

    const itemsList = cart.map(i => {
      let cust = "";
      if (i.customization?.sides) cust += ` (Sides: ${i.customization.sides.join(', ')})`;
      if (i.customization?.toppings) cust += ` (Pizza Extras: ${i.customization.toppings.join(', ')})`;
      if (i.customization?.extras) cust += ` (Extras: ${i.customization.extras.join(', ')})`;
      if (i.customization?.instructions) cust += ` (Note: ${i.customization.instructions})`;
      
      const itemPrice = i.price + (i.customization?.extraCost || 0);
      return `• ${i.name}${cust} x${i.quantity} (${(itemPrice * i.quantity).toLocaleString()} RWF)`;
    }).join('%0A');

    const orderDetails = `%0A%0A*CUSTOMER:* ${userProfile.name}%0A*PHONE:* ${userProfile.phone}%0A*ORDER TYPE:* ${orderType}${orderType === OrderType.DELIVERY ? `%0A*AREA:* ${deliveryArea}%0A*EST. TIME:* ${deliveryInfo.estimatedTime}` : ''}%0A*PRODUCT TOTAL:* ${productSubtotal.toLocaleString()} RWF%0A*DISCOUNT:* -${discount.toLocaleString()} RWF%0A*DELIVERY:* ${deliveryFee.toLocaleString()} RWF%0A*TOTAL:* ${total.toLocaleString()} RWF%0A*LOYALTY POINTS EARNED:* ${earnedPoints}`;
    const message = `Hello Kuci! I'd like to place an order:%0A%0A${itemsList}${orderDetails}`;
    
    onOrderComplete({
      id: Math.random().toString(36).substr(2, 9),
      date: new Date().toLocaleDateString(),
      items: [...cart],
      total: total,
      type: orderType
    });

    window.open(`https://wa.me/${CONTACT_INFO.whatsapp}?text=${message}`, '_blank');
  };

  const handleUpdateItemConfirm = (item: any, customization: ItemCustomization) => {
    if (editingItem) {
      onUpdateCustomization(editingItem.instanceId, customization);
    }
    setEditingItem(null);
  };

  const orderTypeOptions = [
    { 
      id: OrderType.EAT_IN, 
      label: 'Eat-In', 
      description: 'Dine at the café', 
      icon: <Utensils className="w-5 h-5" /> 
    },
    { 
      id: OrderType.PICK_UP, 
      label: 'Pick-Up', 
      description: 'Grab and go', 
      icon: <Package className="w-5 h-5" /> 
    },
    { 
      id: OrderType.DELIVERY, 
      label: 'Delivery', 
      description: 'To your door', 
      icon: <Truck className="w-5 h-5" /> 
    },
  ];

  const renderHistorySection = () => {
    if (orderHistory.length === 0) return null;

    return (
      <section className="space-y-6 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-200">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xl font-serif flex items-center gap-2">
            <History className="w-5 h-5 text-[#f97316]" />
            Past Cravings
          </h3>
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Order History</span>
        </div>

        <div className="space-y-4">
          {orderHistory.slice(0, 5).map((order) => (
            <div 
              key={order.id} 
              className="bg-white rounded-[40px] p-6 border border-[#f5f5dc] shadow-sm hover:shadow-md transition-all active:scale-[0.99]"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
                    <Clock className="w-3 h-3" /> {order.date}
                  </p>
                  <h4 className="text-lg font-serif">{order.items.length} {order.items.length === 1 ? 'Item' : 'Items'}</h4>
                </div>
                <div className="text-right">
                  <p className="text-base font-black text-[#3e2723]">{order.total.toLocaleString()} RWF</p>
                  <span className="text-[9px] px-2 py-0.5 bg-orange-50 text-[#f97316] rounded-full font-bold uppercase tracking-tighter">
                    {order.type}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 mb-6">
                 {order.items.slice(0, 3).map((item, idx) => (
                   <span key={`${item.id}-${idx}`} className="text-[9px] bg-[#f5f5dc]/50 px-3 py-1.5 rounded-xl font-bold text-[#3e2723]/60 border border-[#f5f5dc]">
                      {item.name}
                   </span>
                 ))}
                 {order.items.length > 3 && (
                   <span className="text-[9px] bg-white border border-[#f5f5dc] px-3 py-1.5 rounded-xl font-bold text-gray-300">
                      +{order.items.length - 3} more
                   </span>
                 )}
              </div>

              <button 
                onClick={() => onReorder(order.items)}
                className="w-full bg-[#f97316] text-white py-4 rounded-[20px] font-black uppercase tracking-[0.2em] text-[10px] flex items-center justify-center gap-3 shadow-lg shadow-orange-100 hover:scale-105 active:scale-95 transition-all"
              >
                <RefreshCw className="w-4 h-4" /> Order Again
              </button>
            </div>
          ))}
        </div>
      </section>
    );
  };

  if (cart.length === 0) {
    return (
      <div className="px-4 py-12 space-y-12 animate-in fade-in duration-500 pb-32">
        <div className="flex flex-col items-center justify-center text-center space-y-6">
          <div className="w-24 h-24 bg-[#f5f5dc] rounded-full flex items-center justify-center text-[#f97316] relative">
            <ShoppingBag className="w-12 h-12" />
            <div className="absolute inset-0 rounded-full border-2 border-dashed border-[#f97316] animate-spin-slow" />
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-serif">Empty Cravings?</h2>
            <p className="text-[#3e2723]/50 text-sm leading-relaxed px-8">Deliciousness is just a few taps away. Explore our menu or reorder a past favorite below.</p>
          </div>
        </div>

        {renderHistorySection()}
      </div>
    );
  }

  return (
    <div className="px-4 py-8 space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-32">
      <CustomizerModal 
        item={editingItem}
        initialCustomization={editingItem?.customization}
        onClose={() => setEditingItem(null)}
        onConfirm={handleUpdateItemConfirm}
      />

      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-serif">Your Order</h2>
          {isIdentified && !showProfileForm && (
            <p className="text-[10px] text-[#f97316] font-black uppercase tracking-widest mt-1 flex items-center gap-1.5 animate-in fade-in slide-in-from-left duration-500">
              <CheckCircle2 className="w-3 h-3" /> Ordering as {userProfile.name}
            </p>
          )}
        </div>
        <button onClick={clearCart} className="text-[#3e2723]/30 text-[9px] font-bold uppercase tracking-[0.2em] flex items-center gap-1 active:text-red-400 transition-colors">
          <Trash2 className="w-3 h-3" /> CLEAR ALL
        </button>
      </header>

      {/* REFACTORED: Cart Items Card Layout */}
      <div className="space-y-5">
        {cart.map((item) => {
          const itemPriceWithExtras = item.price + (item.customization?.extraCost || 0);
          return (
            <div 
              key={item.instanceId} 
              className="bg-white rounded-[40px] overflow-hidden shadow-sm border border-[#f5f5dc] animate-in zoom-in-95 duration-300 relative group"
            >
              {/* Overlay edit button to signal interactivity */}
              <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="p-2 bg-orange-50 rounded-full text-[#f97316]">
                  <Edit className="w-4 h-4" />
                </div>
              </div>

              <div className="p-6 space-y-5">
                {/* Main Item Info Row - Clicking name/icon opens customizer */}
                <div className="flex items-start gap-4 cursor-pointer" onClick={() => setEditingItem(item)}>
                  <div className="w-14 h-14 bg-[#f5f5dc] rounded-2xl flex items-center justify-center text-[#f97316] shrink-0">
                    {CATEGORY_ICONS[item.category] || <Utensils className="w-7 h-7" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-[#3e2723] font-serif uppercase leading-tight truncate">{item.name}</h4>
                    <p className="text-[#3e2723]/40 text-[10px] font-bold uppercase tracking-widest mt-1">{item.category}</p>
                    <p className="text-[#f97316] text-sm font-black mt-1">
                      {itemPriceWithExtras.toLocaleString()} RWF <span className="text-[10px] text-gray-300 font-bold ml-1">/ unit</span>
                    </p>
                  </div>
                </div>

                {/* Customization Details: Highlighted Box - Clicking opens customizer */}
                {(item.customization?.sides || item.customization?.toppings || item.customization?.extras || item.customization?.instructions) && (
                  <div 
                    className="bg-[#f5f5dc]/30 rounded-3xl p-4 space-y-2 border border-[#f5f5dc]/50 cursor-pointer hover:bg-[#f5f5dc]/50 transition-colors"
                    onClick={() => setEditingItem(item)}
                  >
                    {item.customization.sides && (
                      <div className="flex items-start gap-2.5 text-[10px] font-black text-[#3e2723]/60">
                        <Utensils className="w-3 h-3 mt-0.5 shrink-0 text-[#f97316]" />
                        <span className="leading-tight uppercase tracking-widest">SIDES: {item.customization.sides.join(' & ')}</span>
                      </div>
                    )}
                    {(item.customization.toppings || item.customization.extras) && (
                      <div className="flex items-start gap-2.5 text-[10px] font-black text-[#f97316]">
                        <Plus className="w-3 h-3 mt-0.5 shrink-0" />
                        <span className="leading-tight uppercase tracking-widest">
                          EXTRAS: {[...(item.customization.toppings || []), ...(item.customization.extras || [])].join(', ')}
                        </span>
                      </div>
                    )}
                    {item.customization.instructions && (
                      <div className="flex items-start gap-2.5 text-[10px] font-medium italic text-gray-500 pt-1 border-t border-[#f5f5dc]">
                        <MessageSquare className="w-3 h-3 shrink-0 text-gray-300" />
                        <span>"{item.customization.instructions}"</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1 text-[8px] font-black text-[#f97316] uppercase tracking-widest mt-1">
                      <Edit className="w-2.5 h-2.5" /> Tap to change choices
                    </div>
                  </div>
                )}

                {/* Footer of Card: Total & Controls */}
                <div className="flex items-center justify-between pt-2">
                   <div>
                     <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Item Total</p>
                     <p className="text-lg font-serif text-[#3e2723]">{(itemPriceWithExtras * item.quantity).toLocaleString()} RWF</p>
                   </div>
                   <div className="flex items-center gap-5 bg-[#3e2723] rounded-full px-5 py-2.5 shadow-lg border border-[#3e2723]">
                    <button 
                      onClick={() => updateQuantity(item.instanceId, -1)} 
                      className="text-white hover:text-orange-400 active:scale-75 transition-all"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="font-black text-sm w-4 text-center text-white">{item.quantity}</span>
                    <button 
                      onClick={() => updateQuantity(item.instanceId, 1)} 
                      className="text-white hover:text-orange-400 active:scale-75 transition-all"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Identity Form */}
      {showProfileForm && (
        <section className="bg-orange-50 rounded-[48px] p-8 border-2 border-orange-100 shadow-xl shadow-orange-100/50 animate-in zoom-in-95 duration-500">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-[#f97316] rounded-2xl flex items-center justify-center text-white shadow-lg">
              <UserCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-serif">Identify Yourself</h3>
              <p className="text-[10px] text-[#f97316] font-black uppercase tracking-widest">Create your profile</p>
            </div>
          </div>
          
          <p className="text-xs text-[#3e2723]/60 mb-6 leading-relaxed italic border-l-2 border-[#f97316]/20 pl-4">
            "For a smooth {orderType.toLowerCase()}, please let us know who we're preparing for. We'll remember you for next time!"
          </p>
          
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-2">Your Name</label>
              <input 
                type="text" 
                placeholder="How should we call you?" 
                value={tempProfile.name}
                onChange={(e) => setTempProfile({...tempProfile, name: e.target.value})}
                className="w-full px-6 py-5 rounded-3xl bg-white border-2 border-transparent focus:border-[#f97316] outline-none text-sm transition-all shadow-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-2">Phone Number</label>
              <input 
                type="tel" 
                placeholder="e.g. 07..." 
                value={tempProfile.phone}
                onChange={(e) => setTempProfile({...tempProfile, phone: e.target.value})}
                className="w-full px-6 py-5 rounded-3xl bg-white border-2 border-transparent focus:border-[#f97316] outline-none text-sm transition-all shadow-sm"
              />
            </div>
            <button 
              disabled={!isInputValid}
              className={`w-full py-5 rounded-3xl font-black uppercase tracking-[0.2em] text-xs transition-all flex items-center justify-center gap-3 ${
                isInputValid 
                  ? 'bg-[#f97316] text-white shadow-xl active:scale-95' 
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed opacity-60'
              }`}
            >
              Continue to Payment <CheckCircle2 className={`w-4 h-4 ${isInputValid ? 'opacity-100' : 'opacity-0'} transition-opacity`} />
            </button>
          </form>
        </section>
      )}

      {!showProfileForm && (
        <div className="space-y-12 animate-in fade-in slide-in-from-top-4 duration-500">
          {/* Enhanced Order Type Selection */}
          <section className="space-y-6">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xl font-serif">Service Mode</h3>
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">How can we serve you?</span>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {orderTypeOptions.map((option) => {
                const isSelected = orderType === option.id;
                return (
                  <button
                    key={option.id}
                    onClick={() => setOrderType(option.id)}
                    className={`flex items-center gap-4 p-5 rounded-[32px] border-2 transition-all text-left relative overflow-hidden group ${
                      isSelected 
                        ? 'bg-[#3e2723] text-white border-[#3e2723] shadow-lg scale-[1.02]' 
                        : 'bg-white text-[#3e2723] border-[#f5f5dc] hover:border-[#f97316]/30'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${
                      isSelected ? 'bg-orange-400 text-white' : 'bg-orange-50 text-orange-400'
                    }`}>
                      {option.icon}
                    </div>
                    <div className="flex-1">
                      <h4 className={`text-sm font-bold uppercase tracking-widest ${isSelected ? 'text-white' : 'text-[#3e2723]'}`}>
                        {option.label}
                      </h4>
                      <p className={`text-[10px] font-medium italic mt-0.5 ${isSelected ? 'text-white/60' : 'text-gray-400'}`}>
                        {option.description}
                      </p>
                    </div>
                    {isSelected && (
                      <div className="animate-in zoom-in-50 duration-300">
                        <CheckCircle2 className="w-5 h-5 text-orange-400" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {orderType === OrderType.DELIVERY && (
              <div className="bg-orange-50/30 rounded-[32px] p-6 space-y-4 border border-[#f5f5dc] animate-in slide-in-from-top-2 duration-300">
                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                  {(Object.keys(DELIVERY_OPTIONS) as DeliveryArea[]).map((area) => (
                    <button
                      key={area}
                      onClick={() => setDeliveryArea(area)}
                      className={`flex-shrink-0 px-4 py-2.5 rounded-xl text-[9px] font-black border-2 uppercase transition-all ${
                        deliveryArea === area ? 'bg-[#f97316] text-white border-[#f97316]' : 'bg-white text-[#3e2723]/50 border-gray-200'
                      }`}
                    >
                      {area}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-[#3e2723]/50 italic flex items-center gap-1.5 px-1">
                  <AlertCircle className="w-3.5 h-3.5 text-[#f97316]" />
                  Delivery to {deliveryArea} is {DELIVERY_OPTIONS[deliveryArea].fee.toLocaleString()} RWF.
                </p>
              </div>
            )}
          </section>

          {/* Summary */}
          <section className="bg-white border border-[#f5f5dc] rounded-[48px] p-8 space-y-5 shadow-sm relative overflow-hidden">
            <div className="flex justify-between text-sm">
              <span className="text-[#3e2723]/50 font-medium">Subtotal</span>
              <span className="font-black">{productSubtotal.toLocaleString()} RWF</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-sm text-[#25D366]">
                <span className="font-bold flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Loyalty Used
                </span>
                <span className="font-black">-{discount.toLocaleString()} RWF</span>
              </div>
            )}
            {orderType === OrderType.DELIVERY && (
              <div className="flex justify-between text-sm">
                <span className="text-[#3e2723]/50 font-medium">Delivery Fee</span>
                <span className="font-black">{deliveryFee.toLocaleString()} RWF</span>
              </div>
            )}
            
            <div className="h-px bg-[#f5f5dc] w-full" />
            
            <div className="flex justify-between items-center py-2">
              <span className="text-xl font-serif">Grand Total</span>
              <span className="text-3xl font-serif text-[#f97316]">{total.toLocaleString()} RWF</span>
            </div>

            <div className="h-px bg-[#f5f5dc] w-full" />

            <div className="flex justify-between items-center text-[10px] text-[#f97316] font-black uppercase tracking-widest bg-orange-50/70 -mx-8 px-8 py-5">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 animate-pulse" />
                <span>Points you'll earn today</span>
              </div>
              <span className="text-sm font-black">{earnedPoints} PTS</span>
            </div>
          </section>

          {/* Actions */}
          <section className="space-y-4">
            <button 
              onClick={handleMomoPayment}
              className="w-full bg-[#f97316] text-white py-6 rounded-[32px] font-black uppercase tracking-[0.2em] shadow-2xl shadow-orange-100 flex items-center justify-center gap-3 text-xs active:scale-95 transition-all"
            >
              <Wallet className="w-5 h-5" /> Pay with Mobile Money
            </button>
            
            <button 
              onClick={handleWhatsAppOrder}
              className="w-full bg-[#3e2723] text-white py-6 rounded-[32px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 text-xs active:scale-95 transition-all"
            >
              <Send className="w-5 h-5" /> Order on WhatsApp
            </button>
          </section>

          {/* Order History Section in Orders Tab */}
          {renderHistorySection()}
        </div>
      )}
    </div>
  );
};
