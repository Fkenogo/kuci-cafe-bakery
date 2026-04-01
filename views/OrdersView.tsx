
import React, { useState, useEffect } from 'react';
import { Trash2, Plus, Minus, Send, Phone, Wallet, Truck, ShoppingBag, MapPin, Sparkles, Clock, UserCheck, AlertCircle, Utensils, Pizza, MessageSquare, Info, CheckCircle2, User, Package, History, ChevronRight, RefreshCw, Tag, Edit } from 'lucide-react';
import { CartItem, OrderType, DeliveryArea, UserProfile, HistoricalOrder, ItemCustomization, RestaurantSettings } from '../types';
import { DELIVERY_OPTIONS, CATEGORY_ICONS } from '../constants';
import { CustomizerModal } from '../components/CustomizerModal';
import { getCartItemUnitPrice, getCategoryIconKey, getDeliveryOptions, getMomoDialHref, getRestaurantContactInfo, getWhatsAppHref } from '../lib/catalog';
import { createOrder, validateOrderInput } from '../lib/orderPersistence';
import { formatBusinessDateDisplay, toBusinessDate } from '../lib/businessDate';

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
  settings: RestaurantSettings | null;
  userId?: string | null;
}

export const OrdersView: React.FC<OrdersViewProps> = ({ 
  cart, updateQuantity, removeFromCart, clearCart, loyaltyPoints, userProfile, setUserProfile, onOrderComplete, orderHistory, onReorder, onUpdateCustomization, settings, userId
}) => {
  const [orderType, setOrderType] = useState<OrderType>(OrderType.PICK_UP);
  const [deliveryArea, setDeliveryArea] = useState<DeliveryArea>(DeliveryArea.NYAMATA_CENTRAL);
  const [editingItem, setEditingItem] = useState<CartItem | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  
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

  const contactInfo = getRestaurantContactInfo(settings);
  const availableDeliveryOptions = getDeliveryOptions(settings, DELIVERY_OPTIONS);
  const deliveryAreas = Object.keys(availableDeliveryOptions) as DeliveryArea[];
  const productSubtotal = cart.reduce((acc, item) => acc + (getCartItemUnitPrice(item) * item.quantity), 0);
  const deliveryInfo = availableDeliveryOptions[deliveryArea] || availableDeliveryOptions[deliveryAreas[0]] || DELIVERY_OPTIONS[DeliveryArea.NYAMATA_CENTRAL];
  const deliveryFee = orderType === OrderType.DELIVERY ? deliveryInfo.fee : 0;
  
  const earnedPoints = Math.floor(productSubtotal / 100);
  const discount = Math.min(productSubtotal, loyaltyPoints * 1);
  const total = (productSubtotal - discount) + deliveryFee;

  const isInputValid = tempProfile.name.trim().length > 2 && tempProfile.phone.trim().length >= 10;
  const momoDialHref = getMomoDialHref(contactInfo.momoPayCode);
  const momoUnavailableReason = !contactInfo.momoPayCode ? 'Mobile Money is not configured yet.' : null;
  const whatsappUnavailableReason = !contactInfo.whatsapp ? 'WhatsApp ordering is not configured yet.' : null;

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
    void handleCheckout(() => {
      if (!momoDialHref) return;
      window.location.href = momoDialHref;
    });
  };

  const handleOrderSuccess = (orderId: string) => {
    onOrderComplete({
      id: orderId,
      date: formatBusinessDateDisplay(toBusinessDate()),
      items: [...cart],
      total,
      type: orderType
    });
  };

  const handleCheckout = async (onSuccess: (orderId: string) => void) => {
    if (isSubmittingOrder) return;
    if (!isIdentified) {
      setShowProfileForm(true);
      return;
    }

    const validation = validateOrderInput({
      cart,
      orderType,
      deliveryArea,
      userProfile,
      subtotal: productSubtotal,
      deliveryFee,
      total,
      userId,
    });

    if (validation.valid === false) {
      setCheckoutError(validation.message);
      return;
    }

    setCheckoutError(null);
    setIsSubmittingOrder(true);

    try {
      const { orderId } = await createOrder({
        cart,
        orderType,
        deliveryArea,
        userProfile,
        subtotal: productSubtotal,
        deliveryFee,
        total,
        userId,
      });
      handleOrderSuccess(orderId);
      onSuccess(orderId);
    } catch (error) {
      console.error('Failed to persist order:', error);
      setCheckoutError('We could not save your order. Please try again before continuing.');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const handleWhatsAppOrder = () => {
    if (!settings) return;

    const itemsList = cart.map(i => {
      let cust = "";
      if (i.customization?.sides) cust += ` (Sides: ${i.customization.sides.join(', ')})`;
      if (i.customization?.toppings) cust += ` (Pizza Extras: ${i.customization.toppings.join(', ')})`;
      if (i.customization?.extras) cust += ` (Extras: ${i.customization.extras.join(', ')})`;
      if (i.customization?.instructions) cust += ` (Note: ${i.customization.instructions})`;
      
      const itemPrice = getCartItemUnitPrice(i);
      return `• ${i.name}${cust} x${i.quantity} (${(itemPrice * i.quantity).toLocaleString()} RWF)`;
    }).join('\n');

    const orderDetails = `\n\n*CUSTOMER:* ${userProfile.name}\n*PHONE:* ${userProfile.phone}\n*ORDER TYPE:* ${orderType}${orderType === OrderType.DELIVERY ? `\n*AREA:* ${deliveryArea}\n*EST. TIME:* ${deliveryInfo.estimatedTime}` : ''}\n*PRODUCT TOTAL:* ${productSubtotal.toLocaleString()} RWF\n*DISCOUNT:* -${discount.toLocaleString()} RWF\n*DELIVERY:* ${deliveryFee.toLocaleString()} RWF\n*TOTAL:* ${total.toLocaleString()} RWF\n*LOYALTY POINTS EARNED:* ${earnedPoints}`;
    const message = `Hello ${settings.name}! I'd like to place an order:\n\n${itemsList}${orderDetails}`;
    const whatsappHref = getWhatsAppHref(contactInfo.whatsapp, message);

    if (!whatsappHref) return;

    void handleCheckout(() => {
      window.open(whatsappHref, '_blank');
    });
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

  useEffect(() => {
    if (cart.length > 0) {
      setCheckoutError(null);
    }
  }, [cart, orderType, deliveryArea, total]);

  const renderHistorySection = () => {
    if (orderHistory.length === 0) return null;

    return (
      <section className="space-y-6 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-200">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xl font-serif flex items-center gap-2">
            <History className="w-5 h-5 text-[var(--color-primary)]" />
            Past Cravings
          </h3>
          <span className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-widest">Order History</span>
        </div>

        <div className="space-y-4">
          {orderHistory.slice(0, 5).map((order) => (
            <div 
              key={order.id} 
              className="bg-[var(--color-bg)] rounded-[40px] p-6 border border-[var(--color-border)] shadow-sm hover:shadow-md transition-all active:scale-[0.99]"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] flex items-center gap-2">
                    <Clock className="w-3 h-3" /> {order.date}
                  </p>
                  <h4 className="text-lg font-serif">{order.items.length} {order.items.length === 1 ? 'Item' : 'Items'}</h4>
                </div>
                <div className="text-right">
                  <p className="text-base font-black text-[var(--color-text)]">{order.total.toLocaleString()} RWF</p>
                  <span className="text-[9px] px-2 py-0.5 bg-[var(--color-primary)]/5 text-[var(--color-primary)] rounded-full font-bold uppercase tracking-tighter">
                    {order.type}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 mb-6">
                 {order.items.slice(0, 3).map((item, idx) => (
                   <span key={`${item.id}-${idx}`} className="text-[9px] bg-[var(--color-border)]/50 px-3 py-1.5 rounded-xl font-bold text-[var(--color-text)]/60 border border-[var(--color-border)]">
                      {item.name}
                   </span>
                 ))}
                 {order.items.length > 3 && (
                   <span className="text-[9px] bg-white border border-[var(--color-border)] px-3 py-1.5 rounded-xl font-bold text-[var(--color-text-muted)]/40">
                      +{order.items.length - 3} more
                   </span>
                 )}
              </div>

              <button 
                onClick={() => onReorder(order.items)}
                className="w-full bg-[var(--color-primary)] text-white py-4 rounded-[20px] font-black uppercase tracking-[0.2em] text-[10px] flex items-center justify-center gap-3 shadow-lg shadow-[var(--color-primary)]/10 hover:scale-105 active:scale-95 transition-all"
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
          <div className="w-24 h-24 bg-[var(--color-bg-secondary)]/50 rounded-full flex items-center justify-center text-[var(--color-primary)] relative">
            <ShoppingBag className="w-12 h-12" />
            <div className="absolute inset-0 rounded-full border-2 border-dashed border-[var(--color-primary)]/30 animate-spin-slow" />
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-serif">Empty Cravings?</h2>
            <p className="text-[var(--color-text-muted)] text-sm leading-relaxed px-8">Deliciousness is just a few taps away. Explore our menu or reorder a past favorite below.</p>
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
            <p className="text-[10px] text-[var(--color-primary)] font-black uppercase tracking-widest mt-1 flex items-center gap-1.5 animate-in fade-in slide-in-from-left duration-500">
              <CheckCircle2 className="w-3 h-3" /> Ordering as {userProfile.name}
            </p>
          )}
        </div>
        <button onClick={clearCart} className="text-[var(--color-text-muted)]/50 text-[9px] font-bold uppercase tracking-[0.2em] flex items-center gap-1 active:text-[var(--color-wishlist)] transition-colors">
          <Trash2 className="w-3 h-3" /> CLEAR ALL
        </button>
      </header>

      {/* REFACTORED: Cart Items Card Layout */}
      <div className="space-y-5">
        {cart.map((item) => {
          const itemPriceWithExtras = getCartItemUnitPrice(item);
          return (
            <div 
              key={item.instanceId} 
              className="bg-[var(--color-bg)] rounded-[40px] overflow-hidden shadow-sm border border-[var(--color-border)] animate-in zoom-in-95 duration-300 relative group"
            >
              {/* Overlay edit button to signal interactivity */}
              <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="p-2 bg-[var(--color-primary)]/5 rounded-full text-[var(--color-primary)]">
                  <Edit className="w-4 h-4" />
                </div>
              </div>

              <div className="p-6 space-y-5">
                {/* Main Item Info Row - Clicking name/icon opens customizer */}
                <div className="flex items-start gap-4 cursor-pointer" onClick={() => setEditingItem(item)}>
                  <div className="w-14 h-14 bg-[var(--color-bg-secondary)] rounded-2xl flex items-center justify-center text-[var(--color-primary)] shrink-0">
                    {CATEGORY_ICONS[getCategoryIconKey(item)] || <Utensils className="w-7 h-7" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-[var(--color-text)] font-serif uppercase leading-tight truncate">{item.name}</h4>
                    <p className="text-[var(--color-text-muted)] text-[10px] font-bold uppercase tracking-widest mt-1">{item.categoryName || item.station}</p>
                    <p className="text-[var(--color-primary)] text-sm font-black mt-1">
                      {itemPriceWithExtras.toLocaleString()} RWF <span className="text-[10px] text-[var(--color-text-muted)]/50 font-bold ml-1">/ unit</span>
                    </p>
                  </div>
                </div>

                {/* Customization Details: Highlighted Box - Clicking opens customizer */}
                {(item.customization?.sides || item.customization?.toppings || item.customization?.extras || item.customization?.instructions) && (
                  <div 
                    className="bg-[var(--color-border)]/30 rounded-3xl p-4 space-y-2 border border-[var(--color-border)]/50 cursor-pointer hover:bg-[var(--color-border)]/50 transition-colors"
                    onClick={() => setEditingItem(item)}
                  >
                    {item.customization.sides && (
                      <div className="flex items-start gap-2.5 text-[10px] font-black text-[var(--color-text)]/60">
                        <Utensils className="w-3 h-3 mt-0.5 shrink-0 text-[var(--color-primary)]" />
                        <span className="leading-tight uppercase tracking-widest">SIDES: {item.customization.sides.join(' & ')}</span>
                      </div>
                    )}
                    {(item.customization.toppings || item.customization.extras) && (
                      <div className="flex items-start gap-2.5 text-[10px] font-black text-[var(--color-primary)]">
                        <Plus className="w-3 h-3 mt-0.5 shrink-0" />
                        <span className="leading-tight uppercase tracking-widest">
                          EXTRAS: {[...(item.customization.toppings || []), ...(item.customization.extras || [])].join(', ')}
                        </span>
                      </div>
                    )}
                    {item.customization.selectedVariantName && (
                      <div className="flex items-start gap-2.5 text-[10px] font-black text-[var(--color-text)]/60">
                        <Tag className="w-3 h-3 mt-0.5 shrink-0 text-[var(--color-primary)]" />
                        <span className="leading-tight uppercase tracking-widest">VARIANT: {item.customization.selectedVariantName}</span>
                      </div>
                    )}
                    {item.customization.instructions && (
                      <div className="flex items-start gap-2.5 text-[10px] font-medium italic text-[var(--color-text-muted)] pt-1 border-t border-[var(--color-border)]">
                        <MessageSquare className="w-3 h-3 shrink-0 text-[var(--color-text-muted)]/30" />
                        <span>"{item.customization.instructions}"</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1 text-[8px] font-black text-[var(--color-primary)] uppercase tracking-widest mt-1">
                      <Edit className="w-2.5 h-2.5" /> Tap to change choices
                    </div>
                  </div>
                )}

                {/* Footer of Card: Total & Controls */}
                <div className="flex items-center justify-between pt-2">
                   <div>
                     <p className="text-[9px] font-black text-[var(--color-text-muted)]/40 uppercase tracking-widest">Item Total</p>
                     <p className="text-lg font-serif text-[var(--color-text)]">{(itemPriceWithExtras * item.quantity).toLocaleString()} RWF</p>
                   </div>
                   <div className="flex items-center gap-5 bg-[var(--color-text)] rounded-full px-5 py-2.5 shadow-lg border border-[var(--color-text)]">
                    <button 
                      onClick={() => updateQuantity(item.instanceId, -1)} 
                      className="text-white hover:text-[var(--color-primary)] active:scale-75 transition-all"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="font-black text-sm w-4 text-center text-white">{item.quantity}</span>
                    <button 
                      onClick={() => updateQuantity(item.instanceId, 1)} 
                      className="text-white hover:text-[var(--color-primary)] active:scale-75 transition-all"
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
        <section className="bg-[var(--color-bg-secondary)] rounded-[48px] p-8 border-2 border-[var(--color-border)] shadow-xl shadow-[var(--color-border)]/50 animate-in zoom-in-95 duration-500">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-[var(--color-primary)] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-[var(--color-primary)]/20">
              <UserCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-serif">Identify Yourself</h3>
              <p className="text-[10px] text-[var(--color-primary)] font-black uppercase tracking-widest">Create your profile</p>
            </div>
          </div>
          
          <p className="text-xs text-[var(--color-text-muted)] mb-6 leading-relaxed italic border-l-2 border-[var(--color-primary)]/20 pl-4">
            "For a smooth {orderType.toLowerCase()}, please let us know who we're preparing for. We'll remember you for next time!"
          </p>
          
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-[var(--color-text-muted)]/50 uppercase tracking-widest px-2">Your Name</label>
              <input 
                type="text" 
                placeholder="How should we call you?" 
                value={tempProfile.name}
                onChange={(e) => setTempProfile({...tempProfile, name: e.target.value})}
                className="w-full px-6 py-5 rounded-3xl bg-[var(--color-bg)] border-2 border-transparent focus:border-[var(--color-primary)] outline-none text-sm transition-all shadow-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-[var(--color-text-muted)]/50 uppercase tracking-widest px-2">Phone Number</label>
              <input 
                type="tel" 
                placeholder="e.g. 07..." 
                value={tempProfile.phone}
                onChange={(e) => setTempProfile({...tempProfile, phone: e.target.value})}
                className="w-full px-6 py-5 rounded-3xl bg-[var(--color-bg)] border-2 border-transparent focus:border-[var(--color-primary)] outline-none text-sm transition-all shadow-sm"
              />
            </div>
            <button 
              disabled={!isInputValid}
              className={`w-full py-5 rounded-3xl font-black uppercase tracking-[0.2em] text-xs transition-all flex items-center justify-center gap-3 ${
                isInputValid 
                  ? 'bg-[var(--color-primary)] text-white shadow-xl shadow-[var(--color-primary)]/20 active:scale-95' 
                  : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)]/40 cursor-not-allowed opacity-60'
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
              <span className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-widest">How can we serve you?</span>
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
                        ? 'bg-[var(--color-text)] text-white border-[var(--color-text)] shadow-lg scale-[1.02]' 
                        : 'bg-[var(--color-bg)] text-[var(--color-text)] border-[var(--color-border)] hover:border-[var(--color-primary)]/30'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${
                      isSelected ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-primary)]/5 text-[var(--color-primary)]'
                    }`}>
                      {option.icon}
                    </div>
                    <div className="flex-1">
                      <h4 className={`text-sm font-bold uppercase tracking-widest ${isSelected ? 'text-white' : 'text-[var(--color-text)]'}`}>
                        {option.label}
                      </h4>
                      <p className={`text-[10px] font-medium italic mt-0.5 ${isSelected ? 'text-white/60' : 'text-[var(--color-text-muted)]'}`}>
                        {option.description}
                      </p>
                    </div>
                    {isSelected && (
                      <div className="animate-in zoom-in-50 duration-300">
                        <CheckCircle2 className="w-5 h-5 text-[var(--color-primary)]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {orderType === OrderType.DELIVERY && (
              <div className="bg-[var(--color-primary)]/5 rounded-[32px] p-6 space-y-4 border border-[var(--color-border)] animate-in slide-in-from-top-2 duration-300">
                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                  {deliveryAreas.map((area) => (
                    <button
                      key={area}
                      onClick={() => setDeliveryArea(area)}
                      className={`flex-shrink-0 px-4 py-2.5 rounded-xl text-[9px] font-black border-2 uppercase transition-all ${
                        deliveryArea === area ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]' : 'bg-[var(--color-bg)] text-[var(--color-text-muted)]/50 border-[var(--color-border)]'
                      }`}
                    >
                      {area}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-[var(--color-text-muted)]/50 italic flex items-center gap-1.5 px-1">
                  <AlertCircle className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                  Delivery to {deliveryArea} is {deliveryInfo.fee.toLocaleString()} RWF.
                </p>
              </div>
            )}
          </section>

          {/* Summary */}
          <section className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[48px] p-8 space-y-5 shadow-sm relative overflow-hidden">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--color-text-muted)]/50 font-medium">Subtotal</span>
              <span className="font-black">{productSubtotal.toLocaleString()} RWF</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-sm text-[var(--color-whatsapp)]">
                <span className="font-bold flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Loyalty Used
                </span>
                <span className="font-black">-{discount.toLocaleString()} RWF</span>
              </div>
            )}
            {orderType === OrderType.DELIVERY && (
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-text-muted)]/50 font-medium">Delivery Fee</span>
                <span className="font-black">{deliveryFee.toLocaleString()} RWF</span>
              </div>
            )}
            
            <div className="h-px bg-[var(--color-border)] w-full" />
            
            <div className="flex justify-between items-center py-2">
              <span className="text-xl font-serif">Grand Total</span>
              <span className="text-3xl font-serif text-[var(--color-primary)]">{total.toLocaleString()} RWF</span>
            </div>

            <div className="h-px bg-[var(--color-border)] w-full" />

            <div className="flex justify-between items-center text-[10px] text-[var(--color-primary)] font-black uppercase tracking-widest bg-[var(--color-primary)]/5 -mx-8 px-8 py-5">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 animate-pulse" />
                <span>Points you'll earn today</span>
              </div>
              <span className="text-sm font-black">{earnedPoints} PTS</span>
            </div>
          </section>

          {/* Actions */}
          <section className="space-y-4">
            {checkoutError && (
              <div className="rounded-[28px] border border-red-200 bg-red-50 px-5 py-4 text-[11px] text-red-700 flex items-start gap-3">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{checkoutError}</span>
              </div>
            )}
            <button 
              onClick={handleMomoPayment}
              disabled={!momoDialHref || isSubmittingOrder}
              className={`w-full py-6 rounded-[32px] font-black uppercase tracking-[0.2em] shadow-2xl flex items-center justify-center gap-3 text-xs transition-all ${
                momoDialHref && !isSubmittingOrder
                  ? 'bg-[var(--color-primary)] text-white shadow-[var(--color-primary)]/10 active:scale-95'
                  : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)]/50 cursor-not-allowed shadow-none'
              }`}
            >
              <Wallet className="w-5 h-5" /> {isSubmittingOrder ? 'Saving Order...' : momoDialHref ? 'Pay with Mobile Money' : 'Mobile Money Unavailable'}
            </button>
            {momoUnavailableReason && (
              <p className="text-[10px] text-[var(--color-text-muted)]/60 px-1 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                {momoUnavailableReason}
              </p>
            )}
            
            <button 
              onClick={handleWhatsAppOrder}
              disabled={!contactInfo.whatsapp || isSubmittingOrder}
              className={`w-full py-6 rounded-[32px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 text-xs transition-all ${
                contactInfo.whatsapp && !isSubmittingOrder
                  ? 'bg-[var(--color-text)] text-white active:scale-95'
                  : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)]/50 cursor-not-allowed'
              }`}
            >
              <Send className="w-5 h-5" /> {isSubmittingOrder ? 'Saving Order...' : contactInfo.whatsapp ? 'Order on WhatsApp' : 'WhatsApp Unavailable'}
            </button>
            {whatsappUnavailableReason && (
              <p className="text-[10px] text-[var(--color-text-muted)]/60 px-1 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                {whatsappUnavailableReason}
              </p>
            )}
          </section>

          {/* Order History Section in Orders Tab */}
          {renderHistorySection()}
        </div>
      )}
    </div>
  );
};
