
import React, { useState } from 'react';
import { Trash2, Plus, Minus, Send, Phone, Wallet, Truck, ShoppingBag, MapPin, Sparkles, Clock } from 'lucide-react';
import { CartItem, OrderType, DeliveryArea } from '../types';
import { CONTACT_INFO, DELIVERY_OPTIONS } from '../constants';

interface OrdersViewProps {
  cart: CartItem[];
  updateQuantity: (id: string, delta: number) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
  loyaltyPoints: number;
}

export const OrdersView: React.FC<OrdersViewProps> = ({ 
  cart, updateQuantity, removeFromCart, clearCart, loyaltyPoints 
}) => {
  const [orderType, setOrderType] = useState<OrderType>(OrderType.PICK_UP);
  const [deliveryArea, setDeliveryArea] = useState<DeliveryArea>(DeliveryArea.NYAMATA_CENTRAL);

  // 1. Calculate Product Subtotal (Points and Disounts apply only to this)
  const productSubtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  
  // 2. Fetch Structured Delivery Fee
  const deliveryInfo = DELIVERY_OPTIONS[deliveryArea];
  const deliveryFee = orderType === OrderType.DELIVERY ? deliveryInfo.fee : 0;

  // 3. Loyalty Logic: Rewards based ONLY on product spend, excluding delivery
  // Earn 1 point per 200 RWF spent on products
  const earnedPoints = Math.floor(productSubtotal / 200);
  
  // Redeem 1 point = 5 RWF discount (Discount capped at product subtotal)
  const discount = Math.min(productSubtotal, loyaltyPoints * 5);
  
  // Final Total: Discounted Products + Full Delivery Fee
  const total = (productSubtotal - discount) + deliveryFee;

  const handleMomoPayment = () => {
    // Standard format: *182*8*1*PAYBILL*AMOUNT#
    window.location.href = `tel:*182*8*1*${CONTACT_INFO.paybill}*`;
  };

  const handleWhatsAppOrder = () => {
    const itemsList = cart.map(i => `• ${i.name} x${i.quantity} (${(i.price * i.quantity).toLocaleString()} RWF)`).join('%0A');
    const orderDetails = `%0A%0A*ORDER TYPE:* ${orderType}${orderType === OrderType.DELIVERY ? `%0A*AREA:* ${deliveryArea}%0A*EST. TIME:* ${deliveryInfo.estimatedTime}` : ''}%0A*PRODUCT TOTAL:* ${productSubtotal.toLocaleString()} RWF%0A*DISCOUNT:* -${discount.toLocaleString()} RWF%0A*DELIVERY:* ${deliveryFee.toLocaleString()} RWF%0A*TOTAL:* ${total.toLocaleString()} RWF`;
    const message = `Hello Kuci! I'd like to place an order:%0A%0A${itemsList}${orderDetails}%0A%0A*Loyalty Points Earned on Products:* ${earnedPoints}`;
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
        <div className="flex items-center gap-2">
          <h2 className="text-3xl font-serif">Order Summary</h2>
          <span className="text-[10px] bg-[#f97316]/10 text-[#f97316] px-2 py-1 rounded-full font-black uppercase tracking-tighter">Draft</span>
        </div>
        <button onClick={clearCart} className="text-[#3e2723]/30 text-[9px] font-bold uppercase tracking-[0.2em] flex items-center gap-1 hover:text-red-500 transition-colors">
          <Trash2 className="w-3 h-3" /> CLEAR
        </button>
      </header>

      {/* Cart Items */}
      <div className="space-y-4">
        {cart.map((item) => (
          <div key={item.id} className="bg-white rounded-[32px] p-5 shadow-sm border border-[#f5f5dc] flex items-center justify-between gap-4">
            <div className="flex-1">
              <h4 className="font-bold text-[#3e2723] font-serif">{item.name}</h4>
              <p className="text-[#f97316] text-[10px] font-black tracking-widest mt-1">{(item.price * item.quantity).toLocaleString()} RWF</p>
            </div>
            <div className="flex items-center gap-4 bg-[#f5f5dc] rounded-full px-4 py-1.5 shadow-inner">
              <button onClick={() => updateQuantity(item.id, -1)} className="p-1 hover:text-[#f97316] active:scale-125 transition-transform">
                <Minus className="w-4 h-4" />
              </button>
              <span className="font-black text-sm min-w-[20px] text-center">{item.quantity}</span>
              <button onClick={() => updateQuantity(item.id, 1)} className="p-1 hover:text-[#f97316] active:scale-125 transition-transform">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Order Type Selection */}
      <section className="space-y-5">
        <h3 className="text-xl font-serif">How'd you like it?</h3>
        <div className="grid grid-cols-3 gap-4">
          {[OrderType.EAT_IN, OrderType.PICK_UP, OrderType.DELIVERY].map((type) => (
            <button
              key={type}
              onClick={() => setOrderType(type)}
              className={`py-5 px-2 rounded-[32px] text-[10px] font-black uppercase tracking-widest flex flex-col items-center gap-3 border-2 transition-all ${
                orderType === type 
                  ? 'bg-[#3e2723] text-white border-[#3e2723] shadow-xl scale-105' 
                  : 'bg-white text-[#3e2723]/40 border-[#f5f5dc] hover:border-[#f97316]/30'
              }`}
            >
              {type === OrderType.EAT_IN && <ShoppingBag className="w-5 h-5" />}
              {type === OrderType.PICK_UP && <MapPin className="w-5 h-5" />}
              {type === OrderType.DELIVERY && <Truck className="w-5 h-5" />}
              {type}
            </button>
          ))}
        </div>

        {orderType === OrderType.DELIVERY && (
          <div className="bg-[#f97316]/5 rounded-[32px] p-6 space-y-4 animate-in fade-in zoom-in-95 duration-300 border border-[#f97316]/10">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#f97316]">Delivery Area</p>
              <Truck className="w-4 h-4 text-[#f97316]" />
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {(Object.keys(DELIVERY_OPTIONS) as DeliveryArea[]).map((area) => (
                <button
                  key={area}
                  onClick={() => setDeliveryArea(area)}
                  className={`flex-shrink-0 px-5 py-3 rounded-2xl text-[9px] font-black border-2 uppercase tracking-tighter transition-all ${
                    deliveryArea === area ? 'bg-[#f97316] text-white border-[#f97316] shadow-md' : 'bg-white text-[#3e2723]/50 border-[#f5f5dc]'
                  }`}
                >
                  {area} {DELIVERY_OPTIONS[area].fee > 0 ? `(+${DELIVERY_OPTIONS[area].fee.toLocaleString()} RWF)` : ''}
                </button>
              ))}
            </div>
            <div className="bg-[#f97316] text-white text-[9px] font-bold py-2 px-4 rounded-xl flex items-center justify-center gap-2">
              <Clock className="w-3 h-3" /> FAST RESPONSE • {DELIVERY_OPTIONS[deliveryArea].estimatedTime}
            </div>
          </div>
        )}
      </section>

      {/* Summary with Loyalty Rewards */}
      <section className="bg-white border border-[#f5f5dc] rounded-[40px] p-8 space-y-5 shadow-sm">
        <div className="flex justify-between text-sm">
          <span className="text-[#3e2723]/50 font-medium">Product Subtotal</span>
          <span className="font-black text-[#3e2723]">{productSubtotal.toLocaleString()} RWF</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-sm text-[#25D366]">
            <span className="font-bold flex items-center gap-1"><Sparkles className="w-3 h-3" /> Loyalty Discount</span>
            <span className="font-black">-{discount.toLocaleString()} RWF</span>
          </div>
        )}
        {orderType === OrderType.DELIVERY && (
          <div className="flex justify-between text-sm border-t border-[#f5f5dc] pt-2">
            <span className="text-[#3e2723]/50 font-medium">Delivery Fee</span>
            <span className="font-black text-[#3e2723]">{deliveryFee.toLocaleString()} RWF</span>
          </div>
        )}
        <div className="h-px bg-[#f5f5dc] w-full" />
        <div className="flex justify-between items-center pt-2">
          <span className="text-xl font-serif">Final Total</span>
          <div className="text-right">
            <span className="text-3xl font-serif text-[#f97316]">{total.toLocaleString()} RWF</span>
            <p className="text-[8px] text-[#3e2723]/40 font-bold uppercase tracking-widest mt-1">Excludes Delivery from Rewards</p>
          </div>
        </div>
        
        <div className="bg-[#f5f5dc]/50 p-4 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#f97316]" />
            <span className="text-[9px] font-black uppercase tracking-widest text-[#3e2723]">Earn Rewards</span>
          </div>
          <span className="text-[10px] font-bold text-[#f97316]">+{earnedPoints} POINTS</span>
        </div>
      </section>

      {/* Payment Actions */}
      <section className="space-y-4">
        <div className="bg-[#f5f5dc] rounded-[32px] p-6 border-2 border-dashed border-[#f97316]/30">
          <div className="flex items-start gap-4 mb-4">
            <Wallet className="w-6 h-6 text-[#f97316] mt-1" />
            <div className="space-y-1">
              <p className="text-xs font-black uppercase tracking-widest text-[#3e2723]">Dynamic USSD Payment</p>
              <p className="text-[11px] text-[#3e2723]/70 leading-relaxed font-medium">
                Tap to pre-fill your dialer. Enter <span className="text-[#f97316] font-bold">Amount ({total.toLocaleString()} RWF)</span> and <span className="font-bold">#</span> to complete payment to <span className="font-bold">{CONTACT_INFO.vendor}</span>.
              </p>
            </div>
          </div>
          
          <button 
            onClick={handleMomoPayment}
            className="w-full bg-[#f97316] text-white py-5 rounded-[24px] font-black uppercase tracking-widest shadow-xl shadow-orange-200 active:scale-95 transition-all flex items-center justify-center gap-4 text-xs"
          >
            <Wallet className="w-5 h-5" />
            Initiate MoMo Pay (*182*8*1*...)
          </button>
        </div>
        
        <button 
          onClick={handleWhatsAppOrder}
          className="w-full bg-[#3e2723] text-white py-5 rounded-[24px] font-black uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-4 text-xs"
        >
          <Send className="w-5 h-5" />
          Finalize Order on WhatsApp
        </button>

        <a 
          href={`tel:${CONTACT_INFO.phone}`}
          className="w-full border-2 border-[#3e2723] text-[#3e2723] py-4 rounded-[24px] font-black uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-4 text-[10px]"
        >
          <Phone className="w-4 h-4" /> Voice Call to Nyamata
        </a>
        
        <p className="text-center text-[9px] text-[#3e2723]/40 font-bold uppercase tracking-[0.2em]">
          “Fast response. Freshly prepared.”
        </p>
      </section>
    </div>
  );
};
