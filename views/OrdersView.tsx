
import React, { useState } from 'react';
import { Trash2, Plus, Minus, Send, Phone, Wallet, Truck, ShoppingBag, MapPin, Sparkles, Clock, UserCheck, AlertCircle, Utensils, Pizza, MessageSquare, Info } from 'lucide-react';
import { CartItem, OrderType, DeliveryArea, UserProfile, HistoricalOrder } from '../types';
import { CONTACT_INFO, DELIVERY_OPTIONS } from '../constants';

interface OrdersViewProps {
  cart: CartItem[];
  updateQuantity: (id: string, delta: number) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
  loyaltyPoints: number;
  userProfile: UserProfile;
  setUserProfile: (profile: UserProfile) => void;
  onOrderComplete: (order: HistoricalOrder) => void;
}

export const OrdersView: React.FC<OrdersViewProps> = ({ 
  cart, updateQuantity, removeFromCart, clearCart, loyaltyPoints, userProfile, setUserProfile, onOrderComplete
}) => {
  const [orderType, setOrderType] = useState<OrderType>(OrderType.PICK_UP);
  const [deliveryArea, setDeliveryArea] = useState<DeliveryArea>(DeliveryArea.NYAMATA_CENTRAL);
  
  // Local state for the contact form
  const [tempProfile, setTempProfile] = useState<UserProfile>(userProfile);
  const [showProfileForm, setShowProfileForm] = useState(!userProfile.name || !userProfile.phone);

  const productSubtotal = cart.reduce((acc, item) => acc + ((item.price + (item.customization?.extraCost || 0)) * item.quantity), 0);
  const deliveryInfo = DELIVERY_OPTIONS[deliveryArea];
  const deliveryFee = orderType === OrderType.DELIVERY ? deliveryInfo.fee : 0;
  
  // Loyalty calculation: 1% of the menu order = 1 point (each point worth something later)
  // Logic from prompt: "1% worth of the menu order represented by 1 point" = total / 100
  const earnedPoints = Math.floor(productSubtotal / 100);
  
  const discount = Math.min(productSubtotal, loyaltyPoints * 1);
  const total = (productSubtotal - discount) + deliveryFee;

  const isProfileValid = tempProfile.name.length > 2 && tempProfile.phone.length >= 10;

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (isProfileValid) {
      setUserProfile(tempProfile);
      setShowProfileForm(false);
    }
  };

  const handleMomoPayment = () => {
    if (!userProfile.name || !userProfile.phone) {
      setShowProfileForm(true);
      return;
    }
    window.location.href = `tel:*182*8*1*${CONTACT_INFO.paybill}*`;
  };

  const handleWhatsAppOrder = () => {
    if (!userProfile.name || !userProfile.phone) {
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
    
    // Save to history before redirect
    onOrderComplete({
      id: Math.random().toString(36).substr(2, 9),
      date: new Date().toLocaleDateString(),
      items: [...cart],
      total: total,
      type: orderType
    });

    window.open(`https://wa.me/${CONTACT_INFO.whatsapp}?text=${message}`, '_blank');
  };

  if (cart.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] px-8 text-center space-y-6 animate-in fade-in duration-500">
        <div className="w-24 h-24 bg-[#f5f5dc] rounded-full flex items-center justify-center text-[#f97316] relative">
          <ShoppingBag className="w-12 h-12" />
          <div className="absolute inset-0 rounded-full border-2 border-dashed border-[#f97316] animate-spin-slow" />
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl font-serif">Empty Cravings?</h2>
          <p className="text-[#3e2723]/50 text-sm leading-relaxed">Deliciousness is just a few taps away. Explore our menu and start your KUCI story.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-32">
      <header className="flex items-center justify-between">
        <h2 className="text-3xl font-serif">Checkout</h2>
        <button onClick={clearCart} className="text-[#3e2723]/30 text-[9px] font-bold uppercase tracking-[0.2em] flex items-center gap-1">
          <Trash2 className="w-3 h-3" /> CLEAR
        </button>
      </header>

      {/* Cart Items */}
      <div className="space-y-4">
        {cart.map((item) => (
          <div key={item.instanceId} className="bg-white rounded-[32px] p-6 shadow-sm border border-[#f5f5dc] space-y-4 animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <h4 className="font-bold text-[#3e2723] font-serif uppercase">{item.name}</h4>
                <p className="text-[#f97316] text-xs font-black tracking-widest mt-1">
                  {((item.price + (item.customization?.extraCost || 0)) * item.quantity).toLocaleString()} RWF
                </p>
              </div>
              <div className="flex items-center gap-4 bg-[#f5f5dc] rounded-full px-4 py-1.5 shadow-inner">
                <button onClick={() => updateQuantity(item.instanceId, -1)} className="p-1 active:scale-90"><Minus className="w-4 h-4" /></button>
                <span className="font-black text-sm">{item.quantity}</span>
                <button onClick={() => updateQuantity(item.instanceId, 1)} className="p-1 active:scale-90"><Plus className="w-4 h-4" /></button>
              </div>
            </div>

            {/* Customization Details Display */}
            {(item.customization?.sides || item.customization?.toppings || item.customization?.extras || item.customization?.instructions) && (
              <div className="pt-3 border-t border-[#f5f5dc] space-y-2">
                {item.customization.sides && (
                  <div className="flex items-start gap-2 text-[10px] font-bold text-gray-400">
                    <Utensils className="w-3 h-3 mt-0.5 shrink-0" />
                    <span className="leading-tight uppercase tracking-wider">{item.customization.sides.join(' & ')}</span>
                  </div>
                )}
                {(item.customization.toppings || item.customization.extras) && (
                  <div className="flex items-start gap-2 text-[10px] font-bold text-orange-400">
                    <Pizza className="w-3 h-3 mt-0.5 shrink-0" />
                    <span className="leading-tight uppercase tracking-wider">
                      EXTRAS: {[...(item.customization.toppings || []), ...(item.customization.extras || [])].join(', ')}
                    </span>
                  </div>
                )}
                {item.customization.instructions && (
                  <div className="flex items-start gap-2 text-[10px] font-medium italic text-gray-500 bg-[#f5f5dc]/40 p-2.5 rounded-xl">
                    <MessageSquare className="w-3 h-3 shrink-0" />
                    <span>Note: {item.customization.instructions}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Contact Prompt */}
      {showProfileForm && (
        <section className="bg-orange-50 rounded-[32px] p-6 border-2 border-orange-200 animate-in zoom-in-95 duration-300">
          <div className="flex items-center gap-3 mb-4">
            <UserCheck className="w-6 h-6 text-[#f97316]" />
            <h3 className="text-lg font-serif">Identify Yourself</h3>
          </div>
          <p className="text-xs text-[#3e2723]/60 mb-4 leading-relaxed italic">
            "For a smooth {orderType.toLowerCase()}, please let us know who we're preparing for."
          </p>
          <form onSubmit={handleSaveProfile} className="space-y-3">
            <input 
              type="text" 
              placeholder="Your Name" 
              value={tempProfile.name}
              onChange={(e) => setTempProfile({...tempProfile, name: e.target.value})}
              className="w-full px-5 py-4 rounded-2xl bg-white border-2 border-transparent focus:border-[#f97316] outline-none text-sm transition-all"
            />
            <input 
              type="tel" 
              placeholder="Phone (e.g. 07...)" 
              value={tempProfile.phone}
              onChange={(e) => setTempProfile({...tempProfile, phone: e.target.value})}
              className="w-full px-5 py-4 rounded-2xl bg-white border-2 border-transparent focus:border-[#f97316] outline-none text-sm transition-all"
            />
            <button 
              disabled={!isProfileValid}
              className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all ${isProfileValid ? 'bg-[#f97316] text-white shadow-lg active:scale-95' : 'bg-gray-200 text-gray-400'}`}
            >
              Continue to Payment
            </button>
          </form>
        </section>
      )}

      {/* Order Type Selection */}
      {!showProfileForm && (
        <section className="space-y-5">
          <h3 className="text-xl font-serif">Delivery Options</h3>
          <div className="grid grid-cols-3 gap-3">
            {[OrderType.EAT_IN, OrderType.PICK_UP, OrderType.DELIVERY].map((type) => (
              <button
                key={type}
                onClick={() => setOrderType(type)}
                className={`py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${
                  orderType === type ? 'bg-[#3e2723] text-white border-[#3e2723]' : 'bg-white text-[#3e2723]/40 border-[#f5f5dc]'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          {orderType === OrderType.DELIVERY && (
            <div className="bg-[#f5f5dc]/50 rounded-[32px] p-6 space-y-4 border border-[#f5f5dc] animate-in slide-in-from-top-2 duration-300">
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {(Object.keys(DELIVERY_OPTIONS) as DeliveryArea[]).map((area) => (
                  <button
                    key={area}
                    onClick={() => setDeliveryArea(area)}
                    className={`flex-shrink-0 px-4 py-2 rounded-xl text-[9px] font-black border-2 uppercase transition-all ${
                      deliveryArea === area ? 'bg-[#f97316] text-white border-[#f97316]' : 'bg-white text-[#3e2723]/50 border-gray-200'
                    }`}
                  >
                    {area}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-[#3e2723]/50 italic flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Delivery to {deliveryArea} is {DELIVERY_OPTIONS[deliveryArea].fee.toLocaleString()} RWF.
              </p>
            </div>
          )}
        </section>
      )}

      {/* Summary */}
      {!showProfileForm && (
        <section className="bg-white border border-[#f5f5dc] rounded-[40px] p-8 space-y-4 shadow-sm relative overflow-hidden">
          <div className="flex justify-between text-sm">
            <span className="text-[#3e2723]/50 font-medium">Subtotal</span>
            <span className="font-black">{productSubtotal.toLocaleString()} RWF</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-sm text-[#25D366]">
              <span className="font-bold">Loyalty Discount Used</span>
              <span className="font-black">-{discount.toLocaleString()} RWF</span>
            </div>
          )}
          {orderType === OrderType.DELIVERY && (
            <div className="flex justify-between text-sm">
              <span className="text-[#3e2723]/50 font-medium">Delivery</span>
              <span className="font-black">{deliveryFee.toLocaleString()} RWF</span>
            </div>
          )}
          
          <div className="h-px bg-[#f5f5dc] w-full" />
          
          <div className="flex justify-between items-center py-2">
            <span className="text-xl font-serif">Total</span>
            <span className="text-3xl font-serif text-[#f97316]">{total.toLocaleString()} RWF</span>
          </div>

          <div className="h-px bg-[#f5f5dc] w-full" />

          {/* Loyalty Earned Row */}
          <div className="flex justify-between items-center pt-2 text-[11px] text-[#f97316] font-black uppercase tracking-widest bg-orange-50/50 -mx-8 px-8 py-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              <span>Points you'll earn</span>
            </div>
            <span className="text-sm font-black">{earnedPoints} PTS</span>
          </div>
          <div className="absolute -bottom-1 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#f97316]/20 to-transparent" />
        </section>
      )}

      {/* Payment Actions */}
      {!showProfileForm && (
        <section className="space-y-4">
          <button 
            onClick={handleMomoPayment}
            className="w-full bg-[#f97316] text-white py-5 rounded-[24px] font-black uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 text-xs active:scale-95 transition-all"
          >
            <Wallet className="w-5 h-5" /> Pay with Mobile Money
          </button>
          
          <button 
            onClick={handleWhatsAppOrder}
            className="w-full bg-[#3e2723] text-white py-5 rounded-[24px] font-black uppercase tracking-widest flex items-center justify-center gap-3 text-xs active:scale-95 transition-all"
          >
            <Send className="w-5 h-5" /> Order on WhatsApp
          </button>
        </section>
      )}
    </div>
  );
};
