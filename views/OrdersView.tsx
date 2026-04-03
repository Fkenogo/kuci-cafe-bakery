
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, Plus, Minus, Send, Phone, Wallet, Truck, ShoppingBag, MapPin, Sparkles, Clock, UserCheck, AlertCircle, Utensils, Pizza, MessageSquare, Info, CheckCircle2, User, Package, History, ChevronRight, RefreshCw, Tag, Edit } from 'lucide-react';
import { AppUserRecord, CartItem, FinancialStatus, OrderStatus, OrderType, DeliveryArea, UserProfile, HistoricalOrder, ItemCustomization, RestaurantSettings, PersistedOrder } from '../types';
import { DELIVERY_OPTIONS, CATEGORY_ICONS } from '../constants';
import { CustomizerModal } from '../components/CustomizerModal';
import { getCartItemUnitPrice, getCategoryIconKey, getDeliveryOptions, getMomoDialHref, getRestaurantContactInfo, getWhatsAppHref } from '../lib/catalog';
import { createOrder, validateOrderInput } from '../lib/orderPersistence';
import { formatBusinessDateDisplay, toBusinessDate } from '../lib/businessDate';
import { db } from '../lib/firebase';
import { collection, doc, limit, onSnapshot, query, where } from 'firebase/firestore';

interface OrdersViewProps {
  cart: CartItem[];
  updateQuantity: (id: string, delta: number) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
  loyaltyPoints: number;
  userProfile: UserProfile;
  setUserProfile: (profile: UserProfile) => void;
  onOrderComplete: (order: HistoricalOrder, options?: { trackInLocalHistory?: boolean }) => void;
  orderHistory: HistoricalOrder[];
  guestOrderRefs: string[];
  onReorder: (items: CartItem[]) => void;
  onUpdateCustomization: (instanceId: string, customization: ItemCustomization) => void;
  settings: RestaurantSettings | null;
  userId?: string | null;
  orderEntryContext?: {
    defaultMode: 'customer_self' | 'staff_assisted';
    canUseStaffAssistedEntry: boolean;
    staffIdentity?: { uid: string; role: 'admin' | 'front_service' | 'bakery_front_service'; displayName: string } | null;
    onExitToOperational?: () => void;
  };
  hideIdentityCapture?: boolean;
  lockedStaffOrderSource?: 'walk_in' | 'phone_call' | 'whatsapp' | 'other';
  hidePersonalOrderWidgets?: boolean;
}

export const OrdersView: React.FC<OrdersViewProps> = ({ 
  cart, updateQuantity, removeFromCart, clearCart, loyaltyPoints, userProfile, setUserProfile, onOrderComplete, orderHistory, guestOrderRefs, onReorder, onUpdateCustomization, settings, userId, orderEntryContext, hideIdentityCapture = false, lockedStaffOrderSource, hidePersonalOrderWidgets = false
}) => {
  const [orderType, setOrderType] = useState<OrderType>(OrderType.PICK_UP);
  const [deliveryArea, setDeliveryArea] = useState<DeliveryArea>(DeliveryArea.NYAMATA_CENTRAL);
  const [editingItem, setEditingItem] = useState<CartItem | null>(null);
  const [showClearOrderConfirm, setShowClearOrderConfirm] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [receiptByOrderId, setReceiptByOrderId] = useState<Record<string, HistoricalOrder['receipt']>>({});
  const [expandedReceiptOrderId, setExpandedReceiptOrderId] = useState<string | null>(null);
  const [liveOrderStatusById, setLiveOrderStatusById] = useState<Record<string, OrderStatus>>({});
  const [liveOrderUpdatedAtById, setLiveOrderUpdatedAtById] = useState<Record<string, string>>({});
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [identityValidationError, setIdentityValidationError] = useState<string | null>(null);
  const [entryMode, setEntryMode] = useState<'customer_self' | 'staff_assisted'>(orderEntryContext?.defaultMode || 'customer_self');
  const [staffOrderSource, setStaffOrderSource] = useState<'walk_in' | 'phone_call' | 'whatsapp' | 'other'>('walk_in');
  const [useLoyaltyPayment, setUseLoyaltyPayment] = useState(false);
  const [assistedOrders, setAssistedOrders] = useState<PersistedOrder[]>([]);
  const [assistedOrdersFilter, setAssistedOrdersFilter] = useState<'all' | 'open' | 'completed' | 'cancelled'>('all');
  const [assistedDateFilter, setAssistedDateFilter] = useState<'today' | 'yesterday' | 'last7' | 'custom'>('today');
  const [assistedLaneFilter, setAssistedLaneFilter] = useState<'all' | 'cafe' | 'bakery'>('all');
  const [assistedSourceFilter, setAssistedSourceFilter] = useState<'all' | 'walk_in' | 'phone_call' | 'whatsapp' | 'other'>('all');
  const [assistedStationFilter, setAssistedStationFilter] = useState<'all' | 'kitchen' | 'barista' | 'bakery_lane'>('all');
  const [assistedDateFrom, setAssistedDateFrom] = useState('');
  const [assistedDateTo, setAssistedDateTo] = useState('');
  const [assistedVisibleCount, setAssistedVisibleCount] = useState(10);
  const lastKnownStatusByIdRef = useRef<Record<string, OrderStatus>>({});
  const previousEntryModeRef = useRef<'customer_self' | 'staff_assisted'>(entryMode);
  
  // Local state for the identity form
  const [tempProfile, setTempProfile] = useState<UserProfile>(
    (orderEntryContext?.defaultMode || 'customer_self') === 'staff_assisted'
      ? { name: '', phone: '' }
      : userProfile
  );
  const isIdentified = entryMode === 'staff_assisted'
    ? (userProfile.name.trim().length >= 3 || userProfile.phone.trim().length >= 10)
    : !!(userProfile.name && userProfile.phone);
  const [showProfileForm, setShowProfileForm] = useState(hideIdentityCapture ? false : (entryMode === 'staff_assisted' ? true : !isIdentified));

  const historyByOrderId: Record<string, HistoricalOrder> = orderHistory.reduce((acc: Record<string, HistoricalOrder>, order) => {
    acc[order.id] = order;
    return acc;
  }, {});

  const trackedOrderIds = Array.from(
    new Set(
      [...orderHistory.map((order) => order.id), ...guestOrderRefs]
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    )
  );

  const visibleOrderIds = trackedOrderIds.length > 0 ? trackedOrderIds.slice(0, 10) : orderHistory.slice(0, 10).map((order) => order.id);

  const formatCustomerOrderStatus = (status: OrderStatus | undefined): string => {
    if (!status) return 'Order received';
    if (status === 'pending' || status === 'front_accepted') return 'Order received';
    if (status === 'in_progress') return 'Being prepared';
    if (status === 'ready_for_handover') return 'Ready for pickup';
    if (status === 'completed') return 'Completed';
    if (status === 'rejected') return 'Cancelled';
    return 'Order received';
  };

  const statusToneClass = (status: OrderStatus | undefined): string => {
    if (status === 'completed') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (status === 'ready_for_handover') return 'bg-blue-50 text-blue-700 border-blue-200';
    if (status === 'rejected') return 'bg-rose-50 text-rose-700 border-rose-200';
    if (status === 'in_progress') return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-[var(--color-primary)]/5 text-[var(--color-primary)] border-[var(--color-primary)]/20';
  };

  const financialStatusLabel = (status: FinancialStatus | undefined): string => {
    if (status === 'complimentary') return 'Complimentary';
    if (status === 'credit') return 'Credit';
    if (status === 'paid') return 'Paid';
    return 'Unpaid';
  };

  const formatServiceModeLabel = (mode: PersistedOrder['serviceMode'] | undefined): string => {
    if (mode === 'dine_in') return 'dine in';
    if (mode === 'pickup') return 'pickup';
    if (mode === 'delivery') return 'delivery';
    return 'pickup';
  };

  useEffect(() => {
    if (!statusNotice) return;
    const timer = window.setTimeout(() => setStatusNotice(null), 4500);
    return () => window.clearTimeout(timer);
  }, [statusNotice]);

  // Sync temp state if external profile changes
  useEffect(() => {
    if (hideIdentityCapture) {
      setShowProfileForm(false);
      return;
    }
    if (entryMode === 'customer_self' && !tempProfile.name && userProfile.name) {
      setTempProfile(userProfile);
    }
    // In staff-assisted mode, keep the customer form open until staff explicitly saves.
    if (entryMode === 'customer_self' && isIdentified) {
      setShowProfileForm(false);
    }
  }, [hideIdentityCapture, entryMode, userProfile, isIdentified, tempProfile.name]);

  useEffect(() => {
    if (hideIdentityCapture) {
      setShowProfileForm(false);
      return;
    }
    const needsForm = entryMode === 'staff_assisted'
      ? !(userProfile.name.trim().length >= 3 || userProfile.phone.trim().length >= 10)
      : !(userProfile.name.trim().length >= 3 && userProfile.phone.trim().length >= 10);
    if (entryMode === 'staff_assisted') {
      // In staff-assisted mode, keep customer entry explicitly editable on mode switch.
      // Only force-open when identity is missing; do not auto-collapse when values exist.
      if (needsForm) {
        setShowProfileForm(true);
      }
    } else {
      setShowProfileForm(needsForm);
    }
    if (entryMode === 'staff_assisted' && !needsForm) {
      setUseLoyaltyPayment(false);
    }
  }, [hideIdentityCapture, entryMode, userProfile.name, userProfile.phone]);

  useEffect(() => {
    if (orderEntryContext?.defaultMode) {
      setEntryMode(orderEntryContext.defaultMode);
    }
  }, [orderEntryContext?.defaultMode]);

  useEffect(() => {
    if (hideIdentityCapture) return;
    if (previousEntryModeRef.current !== entryMode && entryMode === 'staff_assisted') {
      setShowProfileForm(true);
      setTempProfile({ name: userProfile.name || '', phone: userProfile.phone || '' });
    }
    previousEntryModeRef.current = entryMode;
  }, [hideIdentityCapture, entryMode, userProfile.name, userProfile.phone]);

  useEffect(() => {
    if (entryMode === 'staff_assisted') {
      setUseLoyaltyPayment(false);
    }
  }, [entryMode]);

  const contactInfo = getRestaurantContactInfo(settings);
  const availableDeliveryOptions = getDeliveryOptions(settings, DELIVERY_OPTIONS);
  const deliveryAreas = Object.keys(availableDeliveryOptions) as DeliveryArea[];
  const productSubtotal = cart.reduce((acc, item) => acc + (getCartItemUnitPrice(item) * item.quantity), 0);
  const deliveryInfo = availableDeliveryOptions[deliveryArea] || availableDeliveryOptions[deliveryAreas[0]] || DELIVERY_OPTIONS[DeliveryArea.NYAMATA_CENTRAL];
  const deliveryFee = orderType === OrderType.DELIVERY ? deliveryInfo.fee : 0;

  const grossTotal = productSubtotal + deliveryFee;
  const redeemableBlocks = Math.floor(Math.max(0, loyaltyPoints) / 1000);
  const redeemableNow = redeemableBlocks * 1000;
  const orderBlockCap = Math.floor(Math.max(0, grossTotal) / 1000) * 1000;
  const canUseLoyaltyPayment = entryMode === 'customer_self';
  const selectedLoyaltyRedemption = canUseLoyaltyPayment && useLoyaltyPayment ? Math.min(redeemableNow, orderBlockCap) : 0;
  const total = grossTotal - selectedLoyaltyRedemption;
  const earnedPoints = Math.floor(grossTotal / 100);

  const isInputValid = entryMode === 'staff_assisted'
    ? (tempProfile.name.trim().length > 2 || tempProfile.phone.trim().length >= 10)
    : (tempProfile.name.trim().length > 2 && tempProfile.phone.trim().length >= 10);
  const momoDialHref = getMomoDialHref(contactInfo.momoPayCode);
  const momoUnavailableReason = !contactInfo.momoPayCode ? 'Mobile Money is not configured yet.' : null;
  const whatsappUnavailableReason = !contactInfo.whatsapp ? 'WhatsApp ordering is not configured yet.' : null;
  const requireIdentityBeforeCheckout = !hideIdentityCapture;

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isInputValid) {
      setIdentityValidationError('Provide at least customer name or phone before continuing.');
      return;
    }
    setIdentityValidationError(null);
    setUserProfile({
      ...userProfile,
      name: tempProfile.name.trim(),
      phone: tempProfile.phone.trim()
    });
    setShowProfileForm(false);
  };

  const handleMomoPayment = () => {
    if (requireIdentityBeforeCheckout && !isIdentified) {
      setShowProfileForm(true);
      return;
    }
    void handleCheckout(() => {
      if (!momoDialHref) return;
      window.location.href = momoDialHref;
    }, 'mobile_money');
  };

  const handleCashPayment = () => {
    if (requireIdentityBeforeCheckout && !isIdentified) {
      setShowProfileForm(true);
      return;
    }
    void handleCheckout(() => {
      // Cash is paid at pickup/front; order still enters the same pipeline.
    }, 'cash');
  };

  const handleOrderSuccess = (orderId: string) => {
    onOrderComplete({
      id: orderId,
      date: formatBusinessDateDisplay(toBusinessDate()),
      items: [...cart],
      total: grossTotal,
      type: orderType
    }, { trackInLocalHistory: entryMode === 'customer_self' });
  };

  const handleCheckout = async (onSuccess: (orderId: string) => void, paymentChoice: 'cash' | 'mobile_money' | 'whatsapp') => {
    if (isSubmittingOrder) return;
    if (requireIdentityBeforeCheckout && !isIdentified) {
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
      total: grossTotal,
      userId,
      loyaltyRedemption: {
        selectedByCustomer: canUseLoyaltyPayment && useLoyaltyPayment && selectedLoyaltyRedemption > 0,
        requestedAmount: selectedLoyaltyRedemption,
        appliedAmount: selectedLoyaltyRedemption,
        blockSize: 1000,
      },
      entry: {
        orderEntryMode: entryMode,
        ...(entryMode === 'staff_assisted'
          ? {
              orderSource: lockedStaffOrderSource ?? staffOrderSource,
              createdByStaff: orderEntryContext?.staffIdentity
                ? {
                    uid: orderEntryContext.staffIdentity.uid,
                    role: orderEntryContext.staffIdentity.role,
                    name: orderEntryContext.staffIdentity.displayName,
                  }
                : null,
            }
          : {}),
      },
      checkoutPaymentChoice: paymentChoice,
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
        total: grossTotal,
        userId,
        loyaltyRedemption: {
          selectedByCustomer: canUseLoyaltyPayment && useLoyaltyPayment && selectedLoyaltyRedemption > 0,
          requestedAmount: selectedLoyaltyRedemption,
          appliedAmount: selectedLoyaltyRedemption,
          blockSize: 1000,
        },
        entry: {
          orderEntryMode: entryMode,
          ...(entryMode === 'staff_assisted'
            ? {
                orderSource: lockedStaffOrderSource ?? staffOrderSource,
                createdByStaff: orderEntryContext?.staffIdentity
                  ? {
                      uid: orderEntryContext.staffIdentity.uid,
                      role: orderEntryContext.staffIdentity.role,
                      name: orderEntryContext.staffIdentity.displayName,
                    }
                  : null,
              }
            : {}),
        },
        checkoutPaymentChoice: paymentChoice,
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

    const orderDetails = `\n\n*CUSTOMER:* ${userProfile.name}\n*PHONE:* ${userProfile.phone}\n*ORDER TYPE:* ${orderType}${orderType === OrderType.DELIVERY ? `\n*AREA:* ${deliveryArea}\n*EST. TIME:* ${deliveryInfo.estimatedTime}` : ''}\n*PRODUCT TOTAL:* ${productSubtotal.toLocaleString()} RWF\n*DELIVERY:* ${deliveryFee.toLocaleString()} RWF\n*ORDER TOTAL:* ${grossTotal.toLocaleString()} RWF${selectedLoyaltyRedemption > 0 ? `\n*LOYALTY REDEEMED:* -${selectedLoyaltyRedemption.toLocaleString()} RWF` : ''}\n*PAYABLE NOW:* ${total.toLocaleString()} RWF\n*LOYALTY POINTS EARNED FOR NEXT ORDER:* ${earnedPoints}\n*CURRENT REWARD BALANCE:* ${loyaltyPoints}`;
    const message = `Hello ${settings.name}! I'd like to place an order:\n\n${itemsList}${orderDetails}`;
    const whatsappHref = getWhatsAppHref(contactInfo.whatsapp, message);

    if (!whatsappHref) return;

    void handleCheckout(() => {
      window.open(whatsappHref, '_blank');
    }, 'whatsapp');
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

  useEffect(() => {
    if (!canUseLoyaltyPayment || redeemableNow < 1000 || orderBlockCap < 1000) {
      setUseLoyaltyPayment(false);
    }
  }, [canUseLoyaltyPayment, orderBlockCap, redeemableNow]);

  useEffect(() => {
    const uniqueIds: string[] = trackedOrderIds;
    if (uniqueIds.length === 0) {
      setReceiptByOrderId({});
      setLiveOrderStatusById({});
      setLiveOrderUpdatedAtById({});
      return;
    }

    const unsubscribers = uniqueIds.map((orderId) =>
      onSnapshot(
        doc(db, 'orders', orderId),
        (snapshot) => {
          const data = snapshot.data() as Record<string, unknown> | undefined;
          if (!snapshot.exists() || !data) {
            setLiveOrderStatusById((prev) => {
              if (!(orderId in prev)) return prev;
              const next = { ...prev };
              delete next[orderId];
              return next;
            });
            setLiveOrderUpdatedAtById((prev) => {
              if (!(orderId in prev)) return prev;
              const next = { ...prev };
              delete next[orderId];
              return next;
            });
            delete lastKnownStatusByIdRef.current[orderId];
            setReceiptByOrderId((prev) => {
              if (!(orderId in prev)) return prev;
              const next = { ...prev };
              delete next[orderId];
              return next;
            });
            return;
          }

          const receipt = data.receipt && typeof data.receipt === 'object' ? (data.receipt as Record<string, unknown>) : null;
          const payment = data.payment && typeof data.payment === 'object' ? (data.payment as Record<string, unknown>) : null;
          const loyaltyRedemption = data.loyaltyRedemption && typeof data.loyaltyRedemption === 'object'
            ? (data.loyaltyRedemption as Record<string, unknown>)
            : null;
          const financialStatus = data.financialStatus;
          const status = data.status;
          const normalizedStatus: OrderStatus | undefined =
            status === 'pending' ||
            status === 'front_accepted' ||
            status === 'in_progress' ||
            status === 'ready_for_handover' ||
            status === 'completed' ||
            status === 'rejected'
              ? status
              : undefined;

          const updatedAt =
            data.updatedAt && typeof (data.updatedAt as { toDate?: () => Date }).toDate === 'function'
              ? (data.updatedAt as { toDate: () => Date }).toDate().toLocaleString('en-GB')
              : null;

          if (normalizedStatus) {
            setLiveOrderStatusById((prev) => ({ ...prev, [orderId]: normalizedStatus }));
            if (updatedAt) {
              setLiveOrderUpdatedAtById((prev) => ({ ...prev, [orderId]: updatedAt }));
            }

            const previousStatus = lastKnownStatusByIdRef.current[orderId];
            if (previousStatus && previousStatus !== normalizedStatus) {
              setStatusNotice(`Order ${orderId.slice(0, 8).toUpperCase()} is now ${formatCustomerOrderStatus(normalizedStatus).toLowerCase()}.`);
            }
            lastKnownStatusByIdRef.current[orderId] = normalizedStatus;
          }

          if (
            status !== 'completed' ||
            !receipt ||
            receipt.visibleToCustomer !== true ||
            typeof receipt.receiptNumber !== 'string' ||
            !payment
          ) {
            setReceiptByOrderId((prev) => {
              if (!(orderId in prev)) return prev;
              const next = { ...prev };
              delete next[orderId];
              return next;
            });
            return;
          }

          setReceiptByOrderId((prev) => ({
            ...prev,
            [orderId]: {
              receiptNumber: receipt.receiptNumber,
              paymentMethod:
                payment.method === 'cash' ||
                payment.method === 'mobile_money' ||
                payment.method === 'bank_transfer' ||
                payment.method === 'other'
                  ? payment.method
                  : null,
              amountReceived: typeof payment.amountReceived === 'number' ? Math.max(0, payment.amountReceived) : 0,
              financialStatus:
                financialStatus === 'paid' || financialStatus === 'complimentary' || financialStatus === 'credit'
                  ? financialStatus
                  : 'unpaid',
              generatedAt:
                receipt.generatedAt && typeof (receipt.generatedAt as { toDate?: () => Date }).toDate === 'function'
                  ? (receipt.generatedAt as { toDate: () => Date }).toDate().toLocaleString('en-GB')
                  : (updatedAt || new Date().toLocaleString('en-GB')),
              loyaltyRedeemed:
                typeof loyaltyRedemption?.appliedAmount === 'number'
                  ? Math.max(0, loyaltyRedemption.appliedAmount)
                  : 0,
            },
          }));
        },
        () => {
          // Keep customer ordering resilient even if live order read is not available.
        }
      )
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [trackedOrderIds]);

  useEffect(() => {
    const staffUid = orderEntryContext?.staffIdentity?.uid;
    if (!staffUid) {
      setAssistedOrders([]);
      return;
    }

    const assistedQuery = query(
      collection(db, 'orders'),
      where('createdByStaffUid', '==', staffUid),
      limit(100)
    );

    const unsubscribe = onSnapshot(assistedQuery, (snapshot) => {
      const parsed = snapshot.docs.map((entry) => {
        const normalized = (entry.data() as PersistedOrder) || ({} as PersistedOrder);
        return {
          ...normalized,
          id: entry.id,
        } as PersistedOrder;
      });
      parsed.sort((a, b) => {
        const aMs = a.createdAt && typeof (a.createdAt as { toDate?: () => Date }).toDate === 'function'
          ? (a.createdAt as { toDate: () => Date }).toDate().getTime()
          : 0;
        const bMs = b.createdAt && typeof (b.createdAt as { toDate?: () => Date }).toDate === 'function'
          ? (b.createdAt as { toDate: () => Date }).toDate().getTime()
          : 0;
        return bMs - aMs;
      });
      setAssistedOrders(parsed);
    });

    return () => unsubscribe();
  }, [orderEntryContext?.staffIdentity?.uid]);

  const rewardBalanceAfterByOrderId = useMemo(() => {
    const completedPaid = visibleOrderIds
      .map((orderId) => {
        const receipt = receiptByOrderId[orderId];
        const order = historyByOrderId[orderId];
        if (!receipt || receipt.financialStatus !== 'paid' || !order) return null;
        const earned = Math.max(0, Math.floor(order.total / 100));
        const generatedMs = receipt.generatedAt ? Date.parse(receipt.generatedAt) : 0;
        return { orderId, earned, generatedMs: Number.isFinite(generatedMs) ? generatedMs : 0 };
      })
      .filter((entry): entry is { orderId: string; earned: number; generatedMs: number } => !!entry)
      .sort((a, b) => a.generatedMs - b.generatedMs);

    let running = 0;
    const map: Record<string, number> = {};
    completedPaid.forEach((entry) => {
      running += entry.earned;
      map[entry.orderId] = running;
    });
    return map;
  }, [historyByOrderId, receiptByOrderId, visibleOrderIds]);

  const filteredAssistedOrders = useMemo(() => {
    let next = assistedOrders;
    if (assistedOrdersFilter !== 'all') {
      if (assistedOrdersFilter === 'open') {
        next = next.filter((order) =>
          order.status === 'pending' ||
          order.status === 'front_accepted' ||
          order.status === 'in_progress' ||
          order.status === 'ready_for_handover'
        );
      } else if (assistedOrdersFilter === 'completed') {
        next = next.filter((order) => order.status === 'completed');
      } else {
        next = next.filter((order) => order.status === 'rejected');
      }
    }
    if (assistedLaneFilter !== 'all') {
      next = next.filter((order) => assistedLaneFilter === 'bakery' ? order.frontLane === 'bakery_front' : order.frontLane !== 'bakery_front');
    }
    if (assistedSourceFilter !== 'all') {
      next = next.filter((order) => (order.orderSource || 'walk_in') === assistedSourceFilter);
    }
    if (assistedStationFilter !== 'all') {
      next = next.filter((order) => {
        if (assistedStationFilter === 'bakery_lane') return order.frontLane === 'bakery_front';
        return Array.isArray(order.involvedStations) && order.involvedStations.includes(assistedStationFilter);
      });
    }
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    const startOfLast7 = new Date(startOfToday);
    startOfLast7.setDate(startOfLast7.getDate() - 6);
    if (assistedDateFilter === 'today') {
      next = next.filter((order) => {
        const d = order.createdAt && typeof (order.createdAt as { toDate?: () => Date }).toDate === 'function' ? (order.createdAt as { toDate: () => Date }).toDate() : null;
        return !!d && d >= startOfToday;
      });
    } else if (assistedDateFilter === 'yesterday') {
      next = next.filter((order) => {
        const d = order.createdAt && typeof (order.createdAt as { toDate?: () => Date }).toDate === 'function' ? (order.createdAt as { toDate: () => Date }).toDate() : null;
        return !!d && d >= startOfYesterday && d < startOfToday;
      });
    } else if (assistedDateFilter === 'last7') {
      next = next.filter((order) => {
        const d = order.createdAt && typeof (order.createdAt as { toDate?: () => Date }).toDate === 'function' ? (order.createdAt as { toDate: () => Date }).toDate() : null;
        return !!d && d >= startOfLast7;
      });
    } else if (assistedDateFilter === 'custom' && (assistedDateFrom || assistedDateTo)) {
      const from = assistedDateFrom ? new Date(`${assistedDateFrom}T00:00:00`) : null;
      const to = assistedDateTo ? new Date(`${assistedDateTo}T23:59:59`) : null;
      next = next.filter((order) => {
        const d = order.createdAt && typeof (order.createdAt as { toDate?: () => Date }).toDate === 'function' ? (order.createdAt as { toDate: () => Date }).toDate() : null;
        if (!d) return false;
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      });
    }
    return next;
  }, [assistedOrders, assistedOrdersFilter, assistedLaneFilter, assistedSourceFilter, assistedStationFilter, assistedDateFilter, assistedDateFrom, assistedDateTo]);

  const visibleAssistedOrders = useMemo(() => filteredAssistedOrders.slice(0, assistedVisibleCount), [filteredAssistedOrders, assistedVisibleCount]);

  useEffect(() => {
    setAssistedVisibleCount(10);
  }, [assistedOrdersFilter, assistedDateFilter, assistedLaneFilter, assistedSourceFilter, assistedStationFilter, assistedDateFrom, assistedDateTo, orderEntryContext?.staffIdentity?.uid]);

  const renderHistorySection = () => {
    if (hidePersonalOrderWidgets) return null;
    if (visibleOrderIds.length === 0) return null;

    return (
      <section className="space-y-6 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-200">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xl font-serif flex items-center gap-2">
            <History className="w-5 h-5 text-[var(--color-primary)]" />
            Past Cravings
          </h3>
          <span className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-widest">Order History</span>
        </div>

        {statusNotice && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            {statusNotice}
          </div>
        )}

        <div className="space-y-4">
          {visibleOrderIds.map((orderId) => {
            const order = historyByOrderId[orderId];
            const liveStatus = liveOrderStatusById[orderId];
            const customerStatusLabel = formatCustomerOrderStatus(liveStatus);
            const liveUpdatedAt = liveOrderUpdatedAtById[orderId];
            const receipt = receiptByOrderId[orderId];

            const fallbackOrder: HistoricalOrder = order || {
              id: orderId,
              date: liveUpdatedAt || formatBusinessDateDisplay(toBusinessDate()),
              items: [],
              total: 0,
              type: OrderType.PICK_UP,
            };

            return (
            <div
              key={orderId}
              className="bg-[var(--color-bg)] rounded-[40px] p-6 border border-[var(--color-border)] shadow-sm hover:shadow-md transition-all active:scale-[0.99]"
            >
              <div className={`mb-4 rounded-2xl border px-3 py-2 text-xs font-black uppercase tracking-wider ${statusToneClass(liveStatus)}`}>
                {customerStatusLabel}
                {receipt && <span className="ml-2">- Receipt ready</span>}
              </div>

              <div className="flex justify-between items-start mb-4">
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] flex items-center gap-2">
                    <Clock className="w-3 h-3" /> {fallbackOrder.date}
                  </p>
                  <h4 className="text-lg font-serif">{fallbackOrder.items.length} {fallbackOrder.items.length === 1 ? 'Item' : 'Items'}</h4>
                </div>
                <div className="text-right">
                  <p className="text-base font-black text-[var(--color-text)]">{fallbackOrder.total.toLocaleString()} RWF</p>
                  <span className="text-[9px] px-2 py-0.5 bg-[var(--color-primary)]/5 text-[var(--color-primary)] rounded-full font-bold uppercase tracking-tighter">
                    {fallbackOrder.type}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 mb-6">
                 {fallbackOrder.items.slice(0, 3).map((item, idx) => (
                   <span key={`${item.id}-${idx}`} className="text-[9px] bg-[var(--color-border)]/50 px-3 py-1.5 rounded-xl font-bold text-[var(--color-text)]/60 border border-[var(--color-border)]">
                      {item.name}
                   </span>
                 ))}
                 {fallbackOrder.items.length > 3 && (
                   <span className="text-[9px] bg-white border border-[var(--color-border)] px-3 py-1.5 rounded-xl font-bold text-[var(--color-text-muted)]/40">
                      +{fallbackOrder.items.length - 3} more
                   </span>
                 )}
              </div>

              <button 
                onClick={() => onReorder(fallbackOrder.items)}
                disabled={fallbackOrder.items.length === 0}
                className="w-full bg-[var(--color-primary)] text-white py-4 rounded-[20px] font-black uppercase tracking-[0.2em] text-[10px] flex items-center justify-center gap-3 shadow-lg shadow-[var(--color-primary)]/10 hover:scale-105 active:scale-95 transition-all"
              >
                <RefreshCw className="w-4 h-4" /> Order Again
              </button>
              {receipt && (
                <div className="mt-3 rounded-[18px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
                  <button
                    onClick={() => setExpandedReceiptOrderId((current) => (current === orderId ? null : orderId))}
                    className="w-full flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-[var(--color-primary)]"
                  >
                    <span>Digital Receipt</span>
                    <ChevronRight className={`w-3.5 h-3.5 transition-transform ${expandedReceiptOrderId === orderId ? 'rotate-90' : ''}`} />
                  </button>
                  {expandedReceiptOrderId === orderId && (
                    <div className="mt-2 space-y-1.5 text-xs text-[var(--color-text)]">
                      <p><span className="font-semibold">Receipt #:</span> {receipt.receiptNumber}</p>
                      <p><span className="font-semibold">Order ID:</span> {orderId}</p>
                      <p><span className="font-semibold">Payment:</span> {receipt.paymentMethod || 'N/A'}</p>
                      <p><span className="font-semibold">Amount Received:</span> {(receipt.amountReceived || 0).toLocaleString()} RWF</p>
                      {(receipt.loyaltyRedeemed || 0) > 0 && (
                        <p><span className="font-semibold">Loyalty Redeemed:</span> {(receipt.loyaltyRedeemed || 0).toLocaleString()} RWF</p>
                      )}
                      <p><span className="font-semibold">Outcome:</span> {financialStatusLabel(receipt.financialStatus)}</p>
                      <p><span className="font-semibold">Completed:</span> {receipt.generatedAt}</p>
                      <p><span className="font-semibold">Reward Earned:</span> {receipt.financialStatus === 'paid' ? Math.floor(Math.max(0, fallbackOrder.total) / 100) : 0} PTS</p>
                      <p><span className="font-semibold">Reward Balance After Order:</span> {rewardBalanceAfterByOrderId[orderId] ?? Math.max(0, loyaltyPoints)} PTS</p>
                      {fallbackOrder.items.length > 0 && (
                        <div>
                          <p className="font-semibold">Items:</p>
                          <ul className="list-disc pl-5 space-y-0.5">
                            {fallbackOrder.items.map((item) => (
                              <li key={`${orderId}-${item.instanceId}`}>{item.name} x{item.quantity}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <p><span className="font-semibold">Total:</span> {fallbackOrder.total.toLocaleString()} RWF</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )})}
        </div>
      </section>
    );
  };

  const renderAssistedOrdersSection = () => {
    if (hidePersonalOrderWidgets) return null;
    if (!orderEntryContext?.staffIdentity) return null;

    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xl font-serif">My Assisted Orders</h3>
          <span className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-widest">
            {assistedOrders.length} total
          </span>
        </div>
        <div className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] p-1">
          {([
            { id: 'all' as const, label: 'All' },
            { id: 'open' as const, label: 'Open' },
            { id: 'completed' as const, label: 'Completed' },
            { id: 'cancelled' as const, label: 'Cancelled' },
          ]).map((option) => (
            <button
              key={option.id}
              onClick={() => setAssistedOrdersFilter(option.id)}
              className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                assistedOrdersFilter === option.id ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Date</span>
            <select value={assistedDateFilter} onChange={(e) => setAssistedDateFilter(e.target.value as 'today' | 'yesterday' | 'last7' | 'custom')} className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold">
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="last7">Last 7 days</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Lane</span>
            <select value={assistedLaneFilter} onChange={(e) => setAssistedLaneFilter(e.target.value as 'all' | 'cafe' | 'bakery')} className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold">
              <option value="all">All lanes</option>
              <option value="cafe">Cafe lane</option>
              <option value="bakery">Bakery lane</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Source</span>
            <select value={assistedSourceFilter} onChange={(e) => setAssistedSourceFilter(e.target.value as 'all' | 'walk_in' | 'phone_call' | 'whatsapp' | 'other')} className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold">
              <option value="all">All sources</option>
              <option value="walk_in">Walk-in</option>
              <option value="phone_call">Phone Call</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Station Outcome</span>
            <select value={assistedStationFilter} onChange={(e) => setAssistedStationFilter(e.target.value as 'all' | 'kitchen' | 'barista' | 'bakery_lane')} className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold">
              <option value="all">All</option>
              <option value="kitchen">Kitchen involved</option>
              <option value="barista">Barista involved</option>
              <option value="bakery_lane">Bakery lane</option>
            </select>
          </label>
        </div>
        {assistedDateFilter === 'custom' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">From</span>
              <input type="date" value={assistedDateFrom} onChange={(e) => setAssistedDateFrom(e.target.value)} className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold" />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">To</span>
              <input type="date" value={assistedDateTo} onChange={(e) => setAssistedDateTo(e.target.value)} className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold" />
            </label>
          </div>
        )}
        {filteredAssistedOrders.length === 0 ? (
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-4 text-sm text-[var(--color-text-muted)]">
            No assisted orders in this filter yet.
          </div>
        ) : (
          <div className="space-y-3">
            {visibleAssistedOrders.map((order) => {
              const sourceLabel = order.orderSource ? order.orderSource.replace('_', ' ') : 'walk in';
              const paymentChoiceLabel =
                order.checkoutPaymentChoice === 'mobile_money'
                  ? 'mobile money'
                  : order.checkoutPaymentChoice === 'whatsapp'
                    ? 'whatsapp'
                    : 'cash';
              const createdAtLabel =
                order.createdAt && typeof (order.createdAt as { toDate?: () => Date }).toDate === 'function'
                  ? (order.createdAt as { toDate: () => Date }).toDate().toLocaleString('en-GB')
                  : formatBusinessDateDisplay(toBusinessDate());
              return (
                <article key={order.id} className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Order #{order.id?.slice(-6)}</p>
                      <p className="text-sm font-semibold">{order.customer?.name || order.assistedCustomerName || 'Unnamed customer'}</p>
                      {order.customer?.phone && <p className="text-xs text-[var(--color-text-muted)]">{order.customer.phone}</p>}
                    </div>
                    <p className="text-sm font-black text-[var(--color-primary)]">{(order.total || 0).toLocaleString()} RWF</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-wider font-black">
                    <span className="rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] px-2 py-1">{sourceLabel}</span>
                    <span className="rounded-full bg-[var(--color-bg-secondary)] px-2 py-1">pay: {paymentChoiceLabel}</span>
                    <span className="rounded-full bg-[var(--color-bg-secondary)] px-2 py-1">{formatServiceModeLabel(order.serviceMode)}</span>
                    <span className="rounded-full bg-[var(--color-bg-secondary)] px-2 py-1">{order.frontLane === 'bakery_front' ? 'bakery lane' : 'cafe lane'}</span>
                    {Array.isArray(order.involvedStations) && order.involvedStations.includes('kitchen') && (
                      <span className="rounded-full bg-[var(--color-bg-secondary)] px-2 py-1">kitchen</span>
                    )}
                    {Array.isArray(order.involvedStations) && order.involvedStations.includes('barista') && (
                      <span className="rounded-full bg-[var(--color-bg-secondary)] px-2 py-1">barista</span>
                    )}
                    <span className="rounded-full bg-[var(--color-bg-secondary)] px-2 py-1">{(order.status || 'pending').replaceAll('_', ' ')}</span>
                    <span className="rounded-full bg-[var(--color-bg-secondary)] px-2 py-1">{createdAtLabel}</span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {filteredAssistedOrders.length > assistedVisibleCount && (
          <div className="flex justify-center">
            <button
              onClick={() => setAssistedVisibleCount((prev) => prev + 10)}
              className="rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-xs font-black uppercase tracking-wider hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
            >
              Load More
            </button>
          </div>
        )}
      </section>
    );
  };

  if (cart.length === 0) {
    if (hidePersonalOrderWidgets) {
      return (
        <div className="px-4 py-10 space-y-4 pb-20">
          <section className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-5 py-5">
            <h3 className="text-lg font-serif">Start Building This Customer Order</h3>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              Add items from Cafe Menu or Bakery, then return here for service mode and checkout.
            </p>
          </section>
        </div>
      );
    }
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

        {renderAssistedOrdersSection()}
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
      {showClearOrderConfirm && (
        <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center px-4">
          <div className="w-full max-w-sm rounded-[24px] border border-[var(--color-border)] bg-white shadow-2xl p-5 space-y-4">
            <h3 className="text-lg font-serif">Clear order?</h3>
            <p className="text-sm text-[var(--color-text-muted)]">
              Remove all items from your order? This can't be undone.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowClearOrderConfirm(false)}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] px-4 py-2 text-xs font-black uppercase tracking-wider"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  clearCart();
                  setShowClearOrderConfirm(false);
                }}
                className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 text-red-700 px-4 py-2 text-xs font-black uppercase tracking-wider"
              >
                Yes, clear
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-serif">Your Order</h2>
          {entryMode === 'staff_assisted' && (
            <p className="text-[10px] text-[var(--color-primary)] font-black uppercase tracking-widest mt-1">
              Staff-assisted order entry
            </p>
          )}
          {isIdentified && !showProfileForm && (
            <p className="text-[10px] text-[var(--color-primary)] font-black uppercase tracking-widest mt-1 flex items-center gap-1.5 animate-in fade-in slide-in-from-left duration-500">
              <CheckCircle2 className="w-3 h-3" /> Ordering as {userProfile.name}
            </p>
          )}
        </div>
        <button onClick={() => setShowClearOrderConfirm(true)} className="text-[var(--color-text-muted)]/50 text-[9px] font-bold uppercase tracking-[0.2em] flex items-center gap-1 active:text-[var(--color-wishlist)] transition-colors">
          <Trash2 className="w-3 h-3" /> Clear order
        </button>
      </header>

      {!hideIdentityCapture && (orderEntryContext?.canUseStaffAssistedEntry || entryMode === 'staff_assisted') && (
        <section className="rounded-[28px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-5 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black uppercase tracking-widest text-[var(--color-text-muted)]">Order Entry Mode</h3>
            {entryMode === 'staff_assisted' && orderEntryContext?.onExitToOperational && (
              <button
                onClick={orderEntryContext.onExitToOperational}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-[9px] font-black uppercase tracking-wider"
              >
                Back to Staff Board
              </button>
            )}
          </div>
          {orderEntryContext?.canUseStaffAssistedEntry && (
            <div className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] p-1">
              {([
                { id: 'customer_self' as const, label: 'Customer Self' },
                { id: 'staff_assisted' as const, label: 'Staff Assisted' },
              ]).map((option) => (
                <button
                  key={option.id}
                  onClick={() => {
                    setEntryMode(option.id);
                    if (option.id === 'staff_assisted') {
                      setTempProfile({ name: userProfile.name || '', phone: userProfile.phone || '' });
                      setShowProfileForm(true);
                      setIdentityValidationError(null);
                    }
                  }}
                  className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                    entryMode === option.id ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)]'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
          {entryMode === 'staff_assisted' && !lockedStaffOrderSource && (
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Order Source</label>
              <select
                value={staffOrderSource}
                onChange={(event) => setStaffOrderSource(event.target.value as 'walk_in' | 'phone_call' | 'whatsapp' | 'other')}
                className="w-full rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm"
              >
                <option value="walk_in">Walk-in</option>
                <option value="phone_call">Phone Call</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="other">Other</option>
              </select>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                Capture customer phone when possible. Loyalty tracking depends on customer phone.
              </p>
              {userProfile.phone.trim().length < 10 && (
                <p className="text-[11px] text-amber-700 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Phone missing: loyalty accrual will be skipped for this order.
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {/* Identity Form */}
      {!hideIdentityCapture && showProfileForm && (
        <section className="bg-[var(--color-bg-secondary)] rounded-[48px] p-8 border-2 border-[var(--color-border)] shadow-xl shadow-[var(--color-border)]/50 animate-in zoom-in-95 duration-500">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-[var(--color-primary)] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-[var(--color-primary)]/20">
              <UserCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-serif">{entryMode === 'staff_assisted' ? 'Customer Details' : 'Identify Yourself'}</h3>
              <p className="text-[10px] text-[var(--color-primary)] font-black uppercase tracking-widest">
                {entryMode === 'staff_assisted' ? 'Staff-assisted order requires customer identity' : 'Create your profile'}
              </p>
            </div>
          </div>
          
          <p className="text-xs text-[var(--color-text-muted)] mb-6 leading-relaxed italic border-l-2 border-[var(--color-primary)]/20 pl-4">
            {entryMode === 'staff_assisted'
              ? 'Capture customer name and/or phone before placing this assisted order.'
              : `"For a smooth ${orderType.toLowerCase()}, please let us know who we're preparing for. We'll remember you for next time!"`}
          </p>
          
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-[var(--color-text-muted)]/50 uppercase tracking-widest px-2">{entryMode === 'staff_assisted' ? 'Customer Name' : 'Your Name'}</label>
              <input 
                type="text" 
                placeholder={entryMode === 'staff_assisted' ? 'Customer name (optional if phone provided)' : 'How should we call you?'} 
                value={tempProfile.name}
                onChange={(e) => setTempProfile({...tempProfile, name: e.target.value})}
                className="w-full px-6 py-5 rounded-3xl bg-[var(--color-bg)] border-2 border-transparent focus:border-[var(--color-primary)] outline-none text-sm transition-all shadow-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-[var(--color-text-muted)]/50 uppercase tracking-widest px-2">{entryMode === 'staff_assisted' ? 'Telephone Number' : 'Phone Number'}</label>
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
            {!isInputValid && entryMode === 'staff_assisted' && (
              <p className="text-[11px] text-amber-700 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                Provide at least a customer name or phone number.
              </p>
            )}
            {identityValidationError && (
              <p className="text-[11px] text-red-700 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                {identityValidationError}
              </p>
            )}
          </form>
        </section>
      )}

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

      {(hideIdentityCapture || !showProfileForm) && (
        <div className="space-y-12 animate-in fade-in slide-in-from-top-4 duration-500">
          {!hideIdentityCapture && entryMode === 'staff_assisted' && (
            <section className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-5 py-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Customer Details</p>
                <button
                  onClick={() => {
                    setTempProfile({ name: userProfile.name || '', phone: userProfile.phone || '' });
                    setShowProfileForm(true);
                  }}
                  className="text-[10px] font-black uppercase tracking-widest text-[var(--color-primary)]"
                >
                  Edit
                </button>
              </div>
              <p className="text-sm font-semibold">{userProfile.name || 'No customer name provided'}</p>
              <p className="text-xs text-[var(--color-text-muted)]">{userProfile.phone || 'No customer phone provided'}</p>
              {!userProfile.phone && (
                <p className="text-[11px] text-amber-700 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Loyalty tracking is skipped until customer phone is captured.
                </p>
              )}
            </section>
          )}
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
            {orderType === OrderType.DELIVERY && (
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-text-muted)]/50 font-medium">Delivery Fee</span>
                <span className="font-black">{deliveryFee.toLocaleString()} RWF</span>
              </div>
            )}
            {selectedLoyaltyRedemption > 0 && (
              <div className="flex justify-between text-sm text-[var(--color-whatsapp)]">
                <span className="font-bold flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Loyalty Redeemed
                </span>
                <span className="font-black">-{selectedLoyaltyRedemption.toLocaleString()} RWF</span>
              </div>
            )}
            
            <div className="h-px bg-[var(--color-border)] w-full" />
            
            <div className="flex justify-between items-center py-2">
              <span className="text-xl font-serif">Amount Due</span>
              <span className="text-3xl font-serif text-[var(--color-primary)]">{total.toLocaleString()} RWF</span>
            </div>

            <div className="h-px bg-[var(--color-border)] w-full" />

            <div className="flex justify-between items-center text-[10px] text-[var(--color-primary)] font-black uppercase tracking-widest bg-[var(--color-primary)]/5 -mx-8 px-8 py-5">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 animate-pulse" />
                <span>Points earned for next order</span>
              </div>
              <span className="text-sm font-black">{earnedPoints} PTS</span>
            </div>
            <div className="flex justify-between items-center text-[10px] text-[var(--color-text-muted)] font-black uppercase tracking-widest -mx-8 px-8 pb-2">
              <span>Available reward balance</span>
              <span>{Math.max(0, loyaltyPoints)} PTS</span>
            </div>
            <div className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 space-y-2">
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">
                <span>Loyalty Payment</span>
                <span>{redeemableNow.toLocaleString()} RWF redeemable now</span>
              </div>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                {canUseLoyaltyPayment
                  ? 'Optional. Redemption only in 1,000 RWF blocks.'
                  : 'Disabled for staff-assisted entry. Loyalty still accrues to customer phone after paid completion.'}
              </p>
              <label className="inline-flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={useLoyaltyPayment}
                  disabled={!canUseLoyaltyPayment || redeemableNow < 1000 || orderBlockCap < 1000}
                  onChange={(event) => setUseLoyaltyPayment(event.target.checked)}
                />
                Use loyalty points on this order
              </label>
              <p className="text-[10px] text-[var(--color-text-muted)]">
                {!canUseLoyaltyPayment
                  ? 'Loyalty redemption is available only in customer self-order mode.'
                  : redeemableNow < 1000
                  ? 'You need at least 1,000 points before redemption is available.'
                  : orderBlockCap < 1000
                    ? 'Order total is below 1,000 RWF, so redemption is not available.'
                    : `If selected: ${selectedLoyaltyRedemption.toLocaleString()} RWF will be applied.`}
              </p>
            </div>
          </section>

          {/* Actions */}
          <section className="space-y-4">
            <div className="rounded-[20px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Choose Payment at Checkout</p>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-1">Your selection is saved as payment intention. Final captured payment is recorded at front handover.</p>
            </div>
            {checkoutError && (
              <div className="rounded-[28px] border border-red-200 bg-red-50 px-5 py-4 text-[11px] text-red-700 flex items-start gap-3">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{checkoutError}</span>
              </div>
            )}
            <button
              onClick={handleCashPayment}
              disabled={isSubmittingOrder}
              className="w-full py-6 rounded-[32px] font-black uppercase tracking-[0.2em] shadow-2xl flex items-center justify-center gap-3 text-xs transition-all bg-emerald-600 text-white shadow-emerald-700/20 active:scale-95 disabled:bg-[var(--color-bg-secondary)] disabled:text-[var(--color-text-muted)]/50 disabled:shadow-none"
            >
              <Wallet className="w-5 h-5" /> {isSubmittingOrder ? 'Saving Order...' : 'Pay at Pickup (Cash)'}
            </button>
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

          {renderAssistedOrdersSection()}

          {/* Order History Section in Orders Tab */}
          {renderHistorySection()}
        </div>
      )}
    </div>
  );
};
