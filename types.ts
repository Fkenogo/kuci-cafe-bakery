
export type StationType =
  | 'kitchen'
  | 'barista'
  | 'front_service'
  | 'bakery'
  | 'bar'
  | 'coffee';

export type FulfillmentMode = 'made_to_order' | 'ready_to_serve';
export type ItemServiceArea = 'cafe' | 'bakery';
export type OrderServiceArea = ItemServiceArea | 'mixed';
export type FrontLane = 'cafe_front' | 'bakery_front';
export type DispatchMode = 'station_prep' | 'front_only' | 'bakery_front_only' | 'mixed_split';

export type MenuPrepStation = 'kitchen' | 'barista' | 'front' | 'none';

export type MenuItemType = 'simple' | 'variant' | 'configurable' | 'composite';

export type ModifierSelectionType = 'single' | 'multiple';

export interface MenuCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  sortOrder?: number;
  active: boolean;
  iconName?: string;
  hiddenFromCustomer?: boolean;
  deprecated?: boolean;
  legacySource?: string;
  station?: StationType;
  categoryGroup?: 'main' | 'bakery';
  parentCategoryId?: string;
  subcategories?: Array<{
    id: string;
    name: string;
    slug: string;
    sortOrder?: number;
  }>;
}

export type Category = MenuCategory;

export interface BakeryCategory {
  id: string;
  name: string;
  slug: string;
  iconName?: string;
  sortOrder?: number;
  active: boolean;
  description?: string;
  serviceAreaDefault?: ItemServiceArea;
  frontLaneDefault?: FrontLane;
  dispatchModeDefault?: DispatchMode;
  hiddenFromCustomer?: boolean;
  deprecated?: boolean;
  legacySource?: string;
}

export type BakeryItemKind = 'bread' | 'whole_cake' | 'slice' | 'pastry' | 'simple' | 'variant' | 'configurable' | 'composite';

export interface BakeryItem {
  id: string;
  name: string;
  slug: string;
  bakeryCategoryId: string;
  bakeryCategoryName?: string;
  price: number | null;
  description: string;
  imageUrl?: string;
  active: boolean;
  sortOrder?: number;
  prepStation: MenuPrepStation;
  fulfillmentMode: FulfillmentMode;
  itemType: BakeryItemKind;
  serviceArea: ItemServiceArea;
  sku?: string;
  hiddenFromCustomer?: boolean;
  deprecated?: boolean;
  legacySource?: string;
  reviews?: Review[];
  averageRating?: number;
  ratingCount?: number;
  variants?: MenuVariant[];
  modifierGroups?: ModifierGroup[];
  prepInstructionsEnabled?: boolean;
  prepInstructionsLabel?: string;
}

export interface Review {
  user: string;
  rating: number;
  comment: string;
  date: string;
}

export interface MenuVariant {
  id: string;
  name: string;
  price: number;
  active: boolean;
  description?: string;
  isDefault?: boolean;
}

export interface ModifierOption {
  id: string;
  name: string;
  priceDelta: number;
  active: boolean;
  description?: string;
  isDefault?: boolean;
  tags?: string[];
  prepStation?: MenuPrepStation;
  // Legacy field retained for backward compatibility with older seed data.
  station?: StationType;
}

export interface ModifierGroup {
  id: string;
  name: string;
  selectionType: ModifierSelectionType;
  required?: boolean;
  minSelections?: number;
  maxSelections?: number;
  includedInPrice?: boolean;
  options: ModifierOption[];
}

export interface OptionGroupRegistryOption {
  id: string;
  name: string;
  priceDelta: number;
  prepStation?: MenuPrepStation;
}

export interface OptionGroupRegistryEntry {
  id: string;
  name: string;
  required: boolean;
  multiSelect: boolean;
  options: OptionGroupRegistryOption[];
}

export interface CompositeMenuItemComponent {
  id: string;
  name: string;
  prepStation: MenuPrepStation;
  required: boolean;
  quantity: number;
  optionGroupId?: string;
}

export interface MenuItem {
  id: string;
  name: string;
  slug?: string;
  description: string;
  descriptionShort?: string;
  descriptionLong?: string;
  category: string;
  categoryId: string;
  categoryName?: string;
  basePrice: number | null;
  // Legacy compatibility for pre-normalized local data and existing UI fallbacks.
  price?: number | null;
  tagline?: string;
  note?: string;
  reviews?: Review[];
  averageRating?: number;
  ratingCount?: number;
  imageUrl?: string;
  active: boolean;
  isAvailable: boolean;
  available: boolean;
  featured?: boolean;
  sortOrder?: number;
  sku?: string;
  hiddenFromCustomer?: boolean;
  deprecated?: boolean;
  legacySource?: string;
  // Legacy field retained to avoid UI/data breakage while prepStation migration rolls out.
  station: StationType;
  prepStation: MenuPrepStation;
  fulfillmentMode: FulfillmentMode;
  itemType: MenuItemType;
  serviceArea?: ItemServiceArea;
  variants?: MenuVariant[];
  optionGroupIds?: string[];
  modifierGroups?: ModifierGroup[];
  prepInstructionsEnabled?: boolean;
  prepInstructionsLabel?: string;
  components?: CompositeMenuItemComponent[];
  tags?: string[];
}

export interface SelectedModifier {
  groupId: string;
  groupName: string;
  optionIds: string[];
  optionNames: string[];
  priceDelta: number;
}

export interface RestaurantSettings {
  name: string;
  tagline?: string;
  description?: string;
  logo?: string;
  contactInfo: RestaurantContactInfo;
  active?: boolean;
  colors: {
    primary: string;
    text: string;
    bg: string;
    bgSecondary: string;
  };
  extraCosts: {
    topping: number;
    otherExtra: number;
  };
  deliveryOptions: Record<string, DeliveryInfo>;
  paymentMethods?: string[];
  socialLinks?: Record<string, string>;
  customizationOptions: {
    sides: string[];
    pizzaToppings: string[];
    breakfastToppings: string[];
    burritoFillings: string[];
  };
}

export interface RestaurantContactInfo {
  phone?: string;
  whatsapp?: string;
  email?: string;
  location?: string;
  mapLink?: string;
  contactPerson?: string;
  momoPayCode?: string;
  momoMerchantName?: string;
  hours?: string;
}

export interface ItemCustomization {
  selectedVariantId?: string;
  selectedVariantName?: string;
  selectedVariantPrice?: number;
  selectedModifiers?: SelectedModifier[];
  sides?: string[];
  toppings?: string[];
  extras?: string[]; // Up to 2 specific extra items (e.g., "Extra Sauce")
  instructions?: string; // General prep instructions
  extraCost: number;
}

export interface CartItem extends MenuItem {
  quantity: number;
  customization?: ItemCustomization;
  instanceId: string; // Unique ID for items with different customizations
}

export enum OrderType {
  EAT_IN = "Eat-In",
  PICK_UP = "Pick-Up",
  DELIVERY = "Delivery"
}

export enum DeliveryArea {
  NYAMATA_CENTRAL = "Nyamata Central",
  WITHIN_5KM = "Within 5 km",
  OUTSIDE = "Other / Check with us"
}

export interface DeliveryInfo {
  area: DeliveryArea;
  fee: number;
  estimatedTime: string;
}

export interface UserProfile {
  name: string;
  phone: string;
  photo?: string;
}

export type UserRole =
  | 'user'
  | 'admin'
  | 'front_service'
  | 'bakery_front_service'
  | 'kitchen'
  | 'barista'
  | 'bakery_account_reconciliation'
  | 'cafe_account_reconciliation';

export interface AppUserRecord {
  uid: string;
  email?: string;
  phoneNumber?: string;
  displayName: string;
  photoURL?: string;
  role: UserRole;
  isActive: boolean;
  profileType?: 'staff_profile' | 'linked_account';
  linkedUid?: string;
  linkedInviteId?: string;
  phone?: string;
  staffCode?: string;
  shiftLabel?: string;
  linkedAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface HistoricalOrder {
  id: string;
  date: string;
  items: CartItem[];
  total: number;
  type: OrderType;
  receipt?: {
    receiptNumber: string;
    paymentMethod: PaymentMethod | null;
    amountReceived: number;
    financialStatus: FinancialStatus;
    generatedAt: string;
    loyaltyRedeemed?: number;
  };
}

export type OrderServiceMode = 'dine_in' | 'pickup' | 'delivery';
export type PaymentMethod = 'cash' | 'mobile_money' | 'bank_transfer' | 'other';
export type FinancialStatus = 'unpaid' | 'paid' | 'complimentary' | 'credit';
export type OrderPaymentStatus = 'pending' | 'paid' | 'complimentary' | 'credit';
export type OrderEntryMode = 'customer_self' | 'staff_assisted';
export type OrderSource = 'walk_in' | 'phone_call' | 'whatsapp' | 'other';
export type CheckoutPaymentChoice = 'cash' | 'mobile_money' | 'whatsapp';

export interface OrderPaymentRecord {
  method: PaymentMethod | null;
  amountReceived: number;
  currency: string;
  isComplimentary: boolean;
  isCredit: boolean;
  recordedBy: StaffIdentity | null;
  recordedAt: unknown | null;
}

export interface OrderReceipt {
  receiptNumber: string;
  generatedAt: unknown;
  visibleToCustomer: boolean;
}

export interface OrderLoyaltyRedemption {
  selectedByCustomer: boolean;
  requestedAmount: number;
  appliedAmount: number;
  blockSize: number;
}

export type AccountingTreatment = 'paid' | 'complimentary' | 'credit' | 'cancelled' | 'mixed_review';
export type AccountingReasonCode =
  | 'owner_use'
  | 'complimentary_client'
  | 'staff_meal'
  | 'promo'
  | 'replacement'
  | 'credit_customer'
  | 'pay_later'
  | 'mixed_unresolved'
  | 'other';
export type OrderStatus =
  | 'pending'
  | 'front_accepted'
  | 'in_progress'
  | 'ready_for_handover'
  | 'completed'
  | 'rejected';
export type PrepStation = 'kitchen' | 'barista';
export type StationOrderStatus = 'queued' | 'accepted' | 'preparing' | 'ready' | 'rejected';

export interface PersistedOrderCustomer {
  name: string;
  phone: string;
  location?: string;
}

export interface PersistedOrderItem {
  itemId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  selectedOptions: string[];
  lineTotal: number;
  serviceArea?: ItemServiceArea;
  prepStation?: PrepStation;
}

export interface StationStatusRecord {
  status: StationOrderStatus;
  updatedAt: unknown;
  acceptedBy?: StaffIdentity;
  preparingBy?: StaffIdentity;
  readyBy?: StaffIdentity;
  rejectedBy?: StaffIdentity;
  rejectionReason?: string;
}

export interface StaffIdentity {
  uid: string;
  displayName: string;
  role: Exclude<UserRole, 'user'>;
}

export interface PersistedOrderTask {
  taskId: string;
  sourceItemId: string;
  sourceItemName: string;
  taskName: string;
  quantity: number;
  selectedOptions: string[];
  prepStation: PrepStation;
}

export interface PersistedOrder {
  id?: string;
  createdAt: unknown;
  updatedAt: unknown;
  businessDate?: string; // YYYY-MM-DD
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  payment?: OrderPaymentRecord;
  financialStatus?: FinancialStatus;
  receipt?: OrderReceipt;
  loyaltyRedemption?: OrderLoyaltyRedemption;
  checkoutPaymentChoice?: CheckoutPaymentChoice;
  serviceMode: OrderServiceMode;
  orderEntryMode?: OrderEntryMode;
  orderSource?: OrderSource;
  serviceArea: OrderServiceArea;
  frontLane: FrontLane;
  dispatchMode: DispatchMode;
  createdByStaffUid?: string;
  createdByStaffRole?: Exclude<UserRole, 'user'>;
  createdByStaffName?: string;
  assistedCustomerName?: string;
  assistedCustomerPhoneNormalized?: string;
  customer: PersistedOrderCustomer;
  items: PersistedOrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  notes: string;
  involvedStations?: PrepStation[];
  stationStatus?: Partial<Record<PrepStation, StationStatusRecord>>;
  routedTasks?: PersistedOrderTask[];
  frontAcceptedBy?: StaffIdentity | null;
  completedBy?: StaffIdentity | null;
  userId?: string | null;
  accountingTreatment?: AccountingTreatment;
  accountingReasonCode?: AccountingReasonCode;
  accountingReasonNote?: string;
  accountingUpdatedAt?: unknown;
  accountingUpdatedBy?: StaffIdentity | null;
  resolution?: 'normal' | 'forced_close';
  resolutionReason?: 'day_close' | 'stale_recovery_cancel';
  resolutionUpdatedAt?: unknown;
  resolutionUpdatedBy?: StaffIdentity | null;
  originalBusinessDate?: string;
  recoveryAction?: 'stale_complete' | 'stale_cancel' | 'stale_carry_forward';
  recoveryReason?: 'stale_recovery_complete' | 'stale_recovery_cancel' | 'stale_recovery_carry_forward';
  recoveryUpdatedAt?: unknown;
  recoveryUpdatedBy?: StaffIdentity | null;
}

export interface ItemRating {
  id: string;
  orderId: string;
  itemId: string;
  itemName: string;
  serviceArea: ItemServiceArea;
  stars: number;
  comment?: string;
  customerDisplayName: string;
  userId: string;
  quantityPurchased?: number;
  businessDate?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ItemRatingAggregate {
  id: string;
  itemId: string;
  serviceArea: ItemServiceArea;
  averageRating: number;
  ratingCount: number;
  reviews: Review[];
  updatedAt?: unknown;
}

export interface BakeryStockSku {
  id: string;
  bakeryItemId: string;
  skuCode: string;
  name: string;
  unit: 'pcs' | 'tray' | 'kg' | 'loaf';
  active: boolean;
}

export interface BakeryStockLedgerEntry {
  id: string;
  businessDate: string; // YYYY-MM-DD
  sku: string;
  itemId: string;
  itemName: string;
  eventType: 'opening' | 'received' | 'sold' | 'waste' | 'adjustment' | 'closing_actual';
  quantity: number;
  note?: string;
  createdAt: unknown;
  createdBy?: StaffIdentity;
  reconciliationId?: string;
}

export interface BakeryDailyReconciliationLine {
  sku: string;
  itemId: string;
  itemName: string;
  unitPrice: number;
  openingStock: number;
  receivedStock: number;
  soldStock: number;
  expectedSalesValue: number;
  waste: number;
  adjustment: number;
  closingExpected: number;
  closingActual?: number;
  variance?: number;
}

export interface BakeryDailyReconciliation {
  id: string; // YYYY-MM-DD
  businessDate: string; // YYYY-MM-DD
  status: 'open' | 'closed';
  lines: BakeryDailyReconciliationLine[];
  totals?: {
    openingStock: number;
    receivedStock: number;
    soldStock: number;
    expectedSalesValue: number;
    waste: number;
    adjustment: number;
    closingExpected: number;
    closingActual: number;
    variance: number;
  };
  createdAt: unknown;
  updatedAt: unknown;
  openedBy?: StaffIdentity;
  lastUpdatedBy?: StaffIdentity;
  lastUpdatedAt?: unknown;
  closedBy?: StaffIdentity;
  closedAt?: unknown;
  reopenedBy?: StaffIdentity;
  reopenedAt?: unknown;
  notes?: string;
  settlement?: ReconciliationSettlementTotals;
  cashControl?: ReconciliationCashControl;
}

export interface BakeryStockSnapshot {
  id: string;
  businessDate: string;
  sku: string;
  itemId: string;
  itemName: string;
  unitPrice: number;
  openingStock: number;
  receivedStock: number;
  soldStock: number;
  expectedSalesValue: number;
  waste: number;
  adjustment: number;
  closingExpected: number;
  closingActual: number;
  variance: number;
  reconciliationStatus: 'open' | 'closed';
  updatedAt: unknown;
}

export interface CafeDailyReconciliationTotals {
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  pendingOrders: number;
  expectedSalesValue: number;
  grossCompletedSales: number;
  complimentaryValue: number;
  creditValue: number;
  mixedReviewValue: number;
  collectibleExpectedCash: number;
  dineInValue: number;
  pickupValue: number;
  deliveryValue: number;
  cashReceived: number;
  mobileMoneyReceived: number;
  bankReceived: number;
  otherReceived: number;
  totalReceived: number;
  variance: number;
  dineInOrders: number;
  pickupOrders: number;
  deliveryOrders: number;
  excludedBakeryOrders: number;
  excludedMixedOrders: number;
  excludedPendingOrders: number;
  excludedCancelledOrders: number;
}

export interface ReconciliationSettlementTotals {
  grossCompletedSales: number;
  complimentaryValue: number;
  creditValue: number;
  mixedReviewValue: number;
  loyaltyRedeemedValue?: number;
  collectibleExpectedCash: number;
  cashReceived: number;
  mobileMoneyReceived: number;
  bankReceived: number;
  otherReceived: number;
  totalReceived: number;
  variance: number;
}

export type ReconciliationHandoverStatus = 'draft' | 'handed_over' | 'received' | 'closed';

export interface ReconciliationCashControl {
  openingCashFloat: number;
  expectedDrawerCash: number;
  actualCountedCash: number;
  cashOverShort: number;
  cashRemoved: number;
  handoverNotes?: string;
  handedOverBy?: StaffIdentity;
  handedOverAt?: unknown;
  receivedBy?: StaffIdentity;
  receivedAt?: unknown;
  handoverStatus: ReconciliationHandoverStatus;
}

export interface CafeDailyReconciliation {
  id: string; // YYYY-MM-DD
  businessDate: string; // YYYY-MM-DD
  status: 'open' | 'closed';
  totals: CafeDailyReconciliationTotals;
  notes?: string;
  includeMixedOrders?: boolean;
  createdAt: unknown;
  updatedAt: unknown;
  openedBy?: StaffIdentity;
  lastUpdatedBy?: StaffIdentity;
  lastUpdatedAt?: unknown;
  closedBy?: StaffIdentity;
  closedAt?: unknown;
  reopenedBy?: StaffIdentity;
  reopenedAt?: unknown;
  cashControl?: ReconciliationCashControl;
}

export interface CustomerReward {
  phone: string;
  totalEarned: number;
  totalRedeemed: number;
  balance: number;
  updatedAt: unknown;
  lastOrderId?: string;
}

export interface CustomerRewardTransaction {
  orderId: string;
  phone: string;
  type: 'earn' | 'redeem' | 'adjustment';
  amount: number;
  createdAt: unknown;
  recordedBy?: StaffIdentity | null;
}
