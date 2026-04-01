import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ClipboardCheck, Loader2, Save } from 'lucide-react';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  AccountingReasonCode,
  AccountingTreatment,
  BakeryDailyReconciliation,
  BakeryDailyReconciliationLine,
  BakeryItem,
  BakeryStockSnapshot,
  CafeDailyReconciliation,
  ReconciliationCashControl,
  ReconciliationSettlementTotals,
  AppUserRecord,
  PersistedOrder,
} from '../types';
import {
  buildReconciliationAuditRows,
  computeSettlementTotals,
  summarizeAuditRows,
  ReconciliationAuditRow,
  ReconciliationMode,
} from '../lib/accountingTreatment';
import {
  buildBakeryReconciliationLine,
  buildOpeningLinesFromItems,
  buildPreviousSnapshotIndex,
  computeBakeryReconciliationTotals,
  computeBakerySoldBySkuForDate,
  mergeManualLineFields,
  timestampToDate,
} from '../lib/bakeryReconciliation';
import { formatBusinessDateDisplay, parseBusinessDateInput, toBusinessDate } from '../lib/businessDate';
import { isStaleOrder, isTerminalOrderStatus, resolveOrderBusinessDate } from '../lib/orderDayLifecycle';
import { toStaffIdentity } from '../lib/orderRouting';
import { buildCafeTotals } from '../lib/cafeReconciliation';

interface ReconciliationViewProps {
  isAllowed: boolean;
  currentUser: AppUserRecord | null;
}

type LineDraft = {
  receivedStock: number;
  waste: number;
  adjustment: number;
  closingActualInput: string;
};

interface WriteSummary {
  reconciliationDocId: string;
  collection: 'bakeryDailyReconciliation' | 'cafeDailyReconciliation';
  ledgerEntriesWritten: number;
  snapshotsWritten: number;
  action: 'open' | 'save' | 'close';
}

interface CafeDraft {
  cashReceived: number;
  mobileMoneyReceived: number;
  bankReceived: number;
  otherReceived: number;
  notes: string;
}

interface SettlementDraft {
  cashReceived: number;
  mobileMoneyReceived: number;
  bankReceived: number;
  otherReceived: number;
}

interface CashControlDraft {
  openingCashFloat: number;
  actualCountedCash: number;
  cashRemoved: number;
  handoverNotes: string;
  handoverStatus: 'draft' | 'handed_over' | 'received' | 'closed';
  handedOverBy?: ReconciliationCashControl['handedOverBy'];
  handedOverAt?: unknown;
  receivedBy?: ReconciliationCashControl['receivedBy'];
  receivedAt?: unknown;
}

interface AccountingDraft {
  treatment: AccountingTreatment;
  reasonCode: AccountingReasonCode | '';
  reasonNote: string;
}

const ACCOUNTING_TREATMENT_OPTIONS: Array<{ value: AccountingTreatment; label: string }> = [
  { value: 'paid', label: 'Paid' },
  { value: 'complimentary', label: 'Complimentary' },
  { value: 'credit', label: 'Credit / Pay Later' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'mixed_review', label: 'Mixed Review' },
];

const ACCOUNTING_REASON_OPTIONS: Array<{ value: AccountingReasonCode; label: string }> = [
  { value: 'owner_use', label: 'Owner Use' },
  { value: 'complimentary_client', label: 'Complimentary Client' },
  { value: 'staff_meal', label: 'Staff Meal' },
  { value: 'promo', label: 'Promo' },
  { value: 'replacement', label: 'Replacement' },
  { value: 'credit_customer', label: 'Credit Customer' },
  { value: 'pay_later', label: 'Pay Later' },
  { value: 'mixed_unresolved', label: 'Mixed Unresolved' },
  { value: 'other', label: 'Other' },
];

function normalizeNumberInput(value: string): number {
  const next = Number(value);
  if (!Number.isFinite(next)) return 0;
  return Math.max(0, next);
}

function formatDateTime(value: unknown): string {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return new Intl.DateTimeFormat('en-RW', { dateStyle: 'medium', timeStyle: 'short' }).format(value);
  }
  const asDate = timestampToDate(value);
  if (!asDate) return 'Not available';
  return new Intl.DateTimeFormat('en-RW', { dateStyle: 'medium', timeStyle: 'short' }).format(asDate);
}

function formatCurrency(amount: number): string {
  return `${Math.round(amount).toLocaleString()} RWF`;
}

function computeCashControl(settlement: ReconciliationSettlementTotals, draft: CashControlDraft): ReconciliationCashControl {
  const openingCashFloat = Number.isFinite(draft.openingCashFloat) ? draft.openingCashFloat : 0;
  const cashRemoved = Number.isFinite(draft.cashRemoved) ? draft.cashRemoved : 0;
  const actualCountedCash = Number.isFinite(draft.actualCountedCash) ? draft.actualCountedCash : 0;
  const expectedDrawerCash = openingCashFloat + settlement.cashReceived - cashRemoved;
  const cashOverShort = actualCountedCash - expectedDrawerCash;

  return {
    openingCashFloat,
    expectedDrawerCash,
    actualCountedCash,
    cashOverShort,
    cashRemoved,
    handoverNotes: draft.handoverNotes || '',
    handoverStatus: draft.handoverStatus || 'draft',
    ...(draft.handedOverBy ? { handedOverBy: draft.handedOverBy } : {}),
    ...(draft.handedOverAt ? { handedOverAt: draft.handedOverAt } : {}),
    ...(draft.receivedBy ? { receivedBy: draft.receivedBy } : {}),
    ...(draft.receivedAt ? { receivedAt: draft.receivedAt } : {}),
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => stripUndefinedDeep(entry)) as T;
  }
  if (isPlainObject(value)) {
    const output: Record<string, unknown> = {};
    Object.entries(value).forEach(([key, entry]) => {
      if (entry === undefined) return;
      output[key] = stripUndefinedDeep(entry);
    });
    return output as T;
  }
  return value;
}

function sanitizeWritePayload(value: unknown): Record<string, unknown> {
  const sanitized = stripUndefinedDeep(value);
  if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) {
    throw new Error('Firestore write payload is not a valid object after sanitization.');
  }
  return sanitized as Record<string, unknown>;
}

function normalizeReconciliationLine(value: unknown): BakeryDailyReconciliationLine | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;

  if (
    typeof record.sku !== 'string' ||
    typeof record.itemId !== 'string' ||
    typeof record.itemName !== 'string'
  ) {
    return null;
  }

  const closingActual = typeof record.closingActual === 'number' && Number.isFinite(record.closingActual)
    ? record.closingActual
    : undefined;

  return buildBakeryReconciliationLine({
    sku: record.sku,
    itemId: record.itemId,
    itemName: record.itemName,
    unitPrice: typeof record.unitPrice === 'number' ? record.unitPrice : 0,
    openingStock: typeof record.openingStock === 'number' ? record.openingStock : 0,
    receivedStock: typeof record.receivedStock === 'number' ? record.receivedStock : 0,
    soldStock: typeof record.soldStock === 'number' ? record.soldStock : 0,
    waste: typeof record.waste === 'number' ? record.waste : 0,
    adjustment: typeof record.adjustment === 'number' ? record.adjustment : 0,
    ...(typeof closingActual === 'number' ? { closingActual } : {}),
  });
}

function normalizeReconciliationDoc(id: string, value: unknown): BakeryDailyReconciliation | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const lines = Array.isArray(record.lines)
    ? record.lines.flatMap((line) => {
        const normalized = normalizeReconciliationLine(line);
        return normalized ? [normalized] : [];
      })
    : [];

  return {
    id,
    businessDate: typeof record.businessDate === 'string' ? record.businessDate : id,
    status: record.status === 'closed' ? 'closed' : 'open',
    lines,
    ...(record.totals && typeof record.totals === 'object' ? { totals: record.totals as BakeryDailyReconciliation['totals'] } : {}),
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null,
    ...(record.openedBy ? { openedBy: record.openedBy as BakeryDailyReconciliation['openedBy'] } : {}),
    ...(record.lastUpdatedBy ? { lastUpdatedBy: record.lastUpdatedBy as BakeryDailyReconciliation['lastUpdatedBy'] } : {}),
    ...(record.closedBy ? { closedBy: record.closedBy as BakeryDailyReconciliation['closedBy'] } : {}),
    ...(record.closedAt ? { closedAt: record.closedAt } : {}),
    ...(typeof record.notes === 'string' ? { notes: record.notes } : {}),
    ...(record.settlement && typeof record.settlement === 'object'
      ? { settlement: record.settlement as ReconciliationSettlementTotals }
      : {}),
    ...(record.cashControl && typeof record.cashControl === 'object'
      ? { cashControl: record.cashControl as ReconciliationCashControl }
      : {}),
  };
}

function normalizeCafeReconciliationDoc(id: string, value: unknown): CafeDailyReconciliation | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const totalsRecord = record.totals && typeof record.totals === 'object' ? record.totals as Record<string, unknown> : {};

  return {
    id,
    businessDate: typeof record.businessDate === 'string' ? record.businessDate : id,
    status: record.status === 'closed' ? 'closed' : 'open',
    totals: {
      totalOrders: typeof totalsRecord.totalOrders === 'number' ? totalsRecord.totalOrders : 0,
      completedOrders: typeof totalsRecord.completedOrders === 'number' ? totalsRecord.completedOrders : 0,
      cancelledOrders: typeof totalsRecord.cancelledOrders === 'number' ? totalsRecord.cancelledOrders : 0,
      pendingOrders: typeof totalsRecord.pendingOrders === 'number' ? totalsRecord.pendingOrders : 0,
      expectedSalesValue: typeof totalsRecord.expectedSalesValue === 'number' ? totalsRecord.expectedSalesValue : 0,
      grossCompletedSales: typeof totalsRecord.grossCompletedSales === 'number' ? totalsRecord.grossCompletedSales : 0,
      complimentaryValue: typeof totalsRecord.complimentaryValue === 'number' ? totalsRecord.complimentaryValue : 0,
      creditValue: typeof totalsRecord.creditValue === 'number' ? totalsRecord.creditValue : 0,
      mixedReviewValue: typeof totalsRecord.mixedReviewValue === 'number' ? totalsRecord.mixedReviewValue : 0,
      collectibleExpectedCash: typeof totalsRecord.collectibleExpectedCash === 'number' ? totalsRecord.collectibleExpectedCash : 0,
      dineInValue: typeof totalsRecord.dineInValue === 'number' ? totalsRecord.dineInValue : 0,
      pickupValue: typeof totalsRecord.pickupValue === 'number' ? totalsRecord.pickupValue : 0,
      deliveryValue: typeof totalsRecord.deliveryValue === 'number' ? totalsRecord.deliveryValue : 0,
      cashReceived: typeof totalsRecord.cashReceived === 'number' ? totalsRecord.cashReceived : 0,
      mobileMoneyReceived: typeof totalsRecord.mobileMoneyReceived === 'number' ? totalsRecord.mobileMoneyReceived : 0,
      bankReceived: typeof totalsRecord.bankReceived === 'number' ? totalsRecord.bankReceived : 0,
      otherReceived: typeof totalsRecord.otherReceived === 'number' ? totalsRecord.otherReceived : 0,
      totalReceived: typeof totalsRecord.totalReceived === 'number' ? totalsRecord.totalReceived : 0,
      variance: typeof totalsRecord.variance === 'number' ? totalsRecord.variance : 0,
      dineInOrders: typeof totalsRecord.dineInOrders === 'number' ? totalsRecord.dineInOrders : 0,
      pickupOrders: typeof totalsRecord.pickupOrders === 'number' ? totalsRecord.pickupOrders : 0,
      deliveryOrders: typeof totalsRecord.deliveryOrders === 'number' ? totalsRecord.deliveryOrders : 0,
      excludedBakeryOrders: typeof totalsRecord.excludedBakeryOrders === 'number' ? totalsRecord.excludedBakeryOrders : 0,
      excludedMixedOrders: typeof totalsRecord.excludedMixedOrders === 'number' ? totalsRecord.excludedMixedOrders : 0,
      excludedPendingOrders: typeof totalsRecord.excludedPendingOrders === 'number' ? totalsRecord.excludedPendingOrders : 0,
      excludedCancelledOrders: typeof totalsRecord.excludedCancelledOrders === 'number' ? totalsRecord.excludedCancelledOrders : 0,
    },
    ...(typeof record.notes === 'string' ? { notes: record.notes } : {}),
    ...(typeof record.includeMixedOrders === 'boolean' ? { includeMixedOrders: record.includeMixedOrders } : {}),
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null,
    ...(record.openedBy ? { openedBy: record.openedBy as CafeDailyReconciliation['openedBy'] } : {}),
    ...(record.lastUpdatedBy ? { lastUpdatedBy: record.lastUpdatedBy as CafeDailyReconciliation['lastUpdatedBy'] } : {}),
    ...(record.closedBy ? { closedBy: record.closedBy as CafeDailyReconciliation['closedBy'] } : {}),
    ...(record.closedAt ? { closedAt: record.closedAt } : {}),
    ...(record.cashControl && typeof record.cashControl === 'object'
      ? { cashControl: record.cashControl as ReconciliationCashControl }
      : {}),
  };
}

function normalizeBakeryItem(id: string, value: unknown): BakeryItem | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.active !== true) return null;
  if (record.serviceArea && record.serviceArea !== 'bakery') return null;
  if (typeof record.name !== 'string') return null;
  const price = typeof record.price === 'number'
    ? record.price
    : typeof record.basePrice === 'number'
      ? record.basePrice
      : null;

  return {
    id,
    name: record.name,
    slug: typeof record.slug === 'string' ? record.slug : id,
    bakeryCategoryId: typeof record.bakeryCategoryId === 'string' ? record.bakeryCategoryId : '',
    price,
    description: typeof record.description === 'string' ? record.description : '',
    active: true,
    prepStation: record.prepStation === 'kitchen' || record.prepStation === 'barista' || record.prepStation === 'none' ? record.prepStation : 'front',
    fulfillmentMode: record.fulfillmentMode === 'made_to_order' ? 'made_to_order' : 'ready_to_serve',
    itemType: typeof record.itemType === 'string' ? record.itemType as BakeryItem['itemType'] : 'simple',
    serviceArea: 'bakery',
    ...(typeof record.sku === 'string' ? { sku: record.sku } : {}),
    ...(typeof record.sortOrder === 'number' ? { sortOrder: record.sortOrder } : {}),
    ...(typeof record.imageUrl === 'string' ? { imageUrl: record.imageUrl } : {}),
  };
}

function normalizeSnapshot(id: string, value: unknown): BakeryStockSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.sku !== 'string' || typeof record.businessDate !== 'string') return null;

  return {
    id,
    businessDate: record.businessDate,
    sku: record.sku,
    itemId: typeof record.itemId === 'string' ? record.itemId : '',
    itemName: typeof record.itemName === 'string' ? record.itemName : record.sku,
    unitPrice: typeof record.unitPrice === 'number' ? record.unitPrice : 0,
    openingStock: typeof record.openingStock === 'number' ? record.openingStock : 0,
    receivedStock: typeof record.receivedStock === 'number' ? record.receivedStock : 0,
    soldStock: typeof record.soldStock === 'number' ? record.soldStock : 0,
    expectedSalesValue: typeof record.expectedSalesValue === 'number' ? record.expectedSalesValue : 0,
    waste: typeof record.waste === 'number' ? record.waste : 0,
    adjustment: typeof record.adjustment === 'number' ? record.adjustment : 0,
    closingExpected: typeof record.closingExpected === 'number' ? record.closingExpected : 0,
    closingActual: typeof record.closingActual === 'number' ? record.closingActual : 0,
    variance: typeof record.variance === 'number' ? record.variance : 0,
    reconciliationStatus: record.reconciliationStatus === 'open' ? 'open' : 'closed',
    updatedAt: record.updatedAt || null,
  };
}

function normalizeOrder(id: string, value: unknown): PersistedOrder | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.items)) return null;

  return {
    id,
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null,
    ...(typeof record.businessDate === 'string' ? { businessDate: record.businessDate } : {}),
    status: record.status === 'pending' || record.status === 'front_accepted' || record.status === 'in_progress' || record.status === 'ready_for_handover' || record.status === 'completed' || record.status === 'rejected'
      ? record.status
      : 'pending',
    paymentStatus: 'pending',
    serviceMode: record.serviceMode === 'pickup' || record.serviceMode === 'delivery' ? record.serviceMode : 'dine_in',
    serviceArea: record.serviceArea === 'bakery' || record.serviceArea === 'mixed' ? record.serviceArea : 'cafe',
    frontLane: record.frontLane === 'bakery_front' ? 'bakery_front' : 'cafe_front',
    dispatchMode: record.dispatchMode === 'station_prep' || record.dispatchMode === 'bakery_front_only' || record.dispatchMode === 'mixed_split' ? record.dispatchMode : 'front_only',
    customer: {
      name: typeof (record.customer as Record<string, unknown>)?.name === 'string' ? (record.customer as Record<string, unknown>).name as string : '',
      phone: typeof (record.customer as Record<string, unknown>)?.phone === 'string' ? (record.customer as Record<string, unknown>).phone as string : '',
    },
    items: record.items as PersistedOrder['items'],
    subtotal: typeof record.subtotal === 'number' ? record.subtotal : 0,
    deliveryFee: typeof record.deliveryFee === 'number' ? record.deliveryFee : 0,
    total: typeof record.total === 'number' ? record.total : 0,
    notes: typeof record.notes === 'string' ? record.notes : '',
    ...(record.accountingTreatment &&
      (record.accountingTreatment === 'paid' ||
        record.accountingTreatment === 'complimentary' ||
        record.accountingTreatment === 'credit' ||
        record.accountingTreatment === 'cancelled' ||
        record.accountingTreatment === 'mixed_review')
      ? { accountingTreatment: record.accountingTreatment }
      : {}),
    ...(record.accountingReasonCode &&
      (record.accountingReasonCode === 'owner_use' ||
        record.accountingReasonCode === 'complimentary_client' ||
        record.accountingReasonCode === 'staff_meal' ||
        record.accountingReasonCode === 'promo' ||
        record.accountingReasonCode === 'replacement' ||
        record.accountingReasonCode === 'credit_customer' ||
        record.accountingReasonCode === 'pay_later' ||
        record.accountingReasonCode === 'mixed_unresolved' ||
        record.accountingReasonCode === 'other')
      ? { accountingReasonCode: record.accountingReasonCode }
      : {}),
    ...(typeof record.accountingReasonNote === 'string' ? { accountingReasonNote: record.accountingReasonNote } : {}),
    ...(record.accountingUpdatedAt ? { accountingUpdatedAt: record.accountingUpdatedAt } : {}),
    ...(record.accountingUpdatedBy ? { accountingUpdatedBy: record.accountingUpdatedBy as PersistedOrder['accountingUpdatedBy'] } : {}),
    ...(record.resolution === 'normal' || record.resolution === 'forced_close' ? { resolution: record.resolution } : {}),
    ...(record.resolutionReason === 'day_close' || record.resolutionReason === 'stale_recovery_cancel'
      ? { resolutionReason: record.resolutionReason }
      : {}),
    ...(record.resolutionUpdatedAt ? { resolutionUpdatedAt: record.resolutionUpdatedAt } : {}),
    ...(record.resolutionUpdatedBy ? { resolutionUpdatedBy: record.resolutionUpdatedBy as PersistedOrder['resolutionUpdatedBy'] } : {}),
    ...(typeof record.originalBusinessDate === 'string' ? { originalBusinessDate: record.originalBusinessDate } : {}),
    ...(record.recoveryAction === 'stale_complete' || record.recoveryAction === 'stale_cancel' || record.recoveryAction === 'stale_carry_forward'
      ? { recoveryAction: record.recoveryAction }
      : {}),
    ...(record.recoveryReason === 'stale_recovery_complete' || record.recoveryReason === 'stale_recovery_cancel' || record.recoveryReason === 'stale_recovery_carry_forward'
      ? { recoveryReason: record.recoveryReason }
      : {}),
    ...(record.recoveryUpdatedAt ? { recoveryUpdatedAt: record.recoveryUpdatedAt } : {}),
    ...(record.recoveryUpdatedBy ? { recoveryUpdatedBy: record.recoveryUpdatedBy as PersistedOrder['recoveryUpdatedBy'] } : {}),
  };
}

export const ReconciliationView: React.FC<ReconciliationViewProps> = ({ isAllowed, currentUser }) => {
  const [businessDate, setBusinessDate] = useState<string>(() => toBusinessDate());
  const [mode, setMode] = useState<'bakery' | 'cafe'>('bakery');
  const [bakeryItems, setBakeryItems] = useState<BakeryItem[]>([]);
  const [orders, setOrders] = useState<PersistedOrder[]>([]);
  const [snapshots, setSnapshots] = useState<BakeryStockSnapshot[]>([]);
  const [reconciliation, setReconciliation] = useState<BakeryDailyReconciliation | null>(null);
  const [cafeReconciliation, setCafeReconciliation] = useState<CafeDailyReconciliation | null>(null);
  const [draftBySku, setDraftBySku] = useState<Record<string, LineDraft>>({});
  const [cafeDraft, setCafeDraft] = useState<CafeDraft>({
    cashReceived: 0,
    mobileMoneyReceived: 0,
    bankReceived: 0,
    otherReceived: 0,
    notes: '',
  });
  const [bakerySettlementDraft, setBakerySettlementDraft] = useState<SettlementDraft>({
    cashReceived: 0,
    mobileMoneyReceived: 0,
    bankReceived: 0,
    otherReceived: 0,
  });
  const [bakeryCashDraft, setBakeryCashDraft] = useState<CashControlDraft>({
    openingCashFloat: 0,
    actualCountedCash: 0,
    cashRemoved: 0,
    handoverNotes: '',
    handoverStatus: 'draft',
    handedOverBy: undefined,
    handedOverAt: undefined,
    receivedBy: undefined,
    receivedAt: undefined,
  });
  const [cafeCashDraft, setCafeCashDraft] = useState<CashControlDraft>({
    openingCashFloat: 0,
    actualCountedCash: 0,
    cashRemoved: 0,
    handoverNotes: '',
    handoverStatus: 'draft',
    handedOverBy: undefined,
    handedOverAt: undefined,
    receivedBy: undefined,
    receivedAt: undefined,
  });
  const [orderAccountingDrafts, setOrderAccountingDrafts] = useState<Record<string, AccountingDraft>>({});
  const [selectedAccountingOrderId, setSelectedAccountingOrderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [accountingBusyOrderId, setAccountingBusyOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [writeSummary, setWriteSummary] = useState<WriteSummary | null>(null);
  const businessDateLabel = formatBusinessDateDisplay(businessDate);

  const canEditBakery = currentUser?.role === 'admin' || currentUser?.role === 'bakery_account_reconciliation';
  const canEditCafe = currentUser?.role === 'admin' || currentUser?.role === 'cafe_account_reconciliation';
  const canEditBakeryAccounting = currentUser?.role === 'admin' || currentUser?.role === 'bakery_account_reconciliation';
  const canEditCafeAccounting = currentUser?.role === 'admin' || currentUser?.role === 'cafe_account_reconciliation';
  const availableModes = useMemo(() => {
    const next: Array<'bakery' | 'cafe'> = [];
    if (currentUser?.role === 'admin' || currentUser?.role === 'bakery_account_reconciliation') next.push('bakery');
    if (currentUser?.role === 'admin' || currentUser?.role === 'cafe_account_reconciliation') next.push('cafe');
    if (next.length === 0) {
      next.push('cafe');
    }
    return next;
  }, [currentUser?.role]);
  const actor = useMemo(() => toStaffIdentity(currentUser), [currentUser]);

  useEffect(() => {
    if (!availableModes.includes(mode)) {
      setMode(availableModes[0]);
    }
  }, [availableModes, mode]);

  useEffect(() => {
    if (!isAllowed) {
      setLoading(false);
      return;
    }

    const unsubItems = onSnapshot(
      query(collection(db, 'bakeryItems')),
      (snapshot) => {
        const next = snapshot.docs.flatMap((itemDoc) => {
          const normalized = normalizeBakeryItem(itemDoc.id, itemDoc.data());
          return normalized ? [normalized] : [];
        });
        setBakeryItems(next.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)));
        setLoading(false);
      },
      (snapshotError) => {
        setError(snapshotError instanceof Error ? snapshotError.message : 'Failed to load bakery items.');
        setLoading(false);
      }
    );

    const unsubOrders = onSnapshot(
      query(collection(db, 'orders'), orderBy('createdAt', 'desc')),
      (snapshot) => {
        const next = snapshot.docs.flatMap((orderDoc) => {
          const normalized = normalizeOrder(orderDoc.id, orderDoc.data());
          return normalized ? [normalized] : [];
        });
        setOrders(next);
      },
      (snapshotError) => {
        setError(snapshotError instanceof Error ? snapshotError.message : 'Failed to load orders for sold stock.');
      }
    );

    const unsubSnapshots = onSnapshot(
      query(collection(db, 'bakeryStockSnapshots'), orderBy('businessDate', 'desc')),
      (snapshot) => {
        const next = snapshot.docs.flatMap((snapDoc) => {
          const normalized = normalizeSnapshot(snapDoc.id, snapDoc.data());
          return normalized ? [normalized] : [];
        });
        setSnapshots(next);
      },
      (snapshotError) => {
        setError(snapshotError instanceof Error ? snapshotError.message : 'Failed to load stock snapshots.');
      }
    );

    return () => {
      unsubItems();
      unsubOrders();
      unsubSnapshots();
    };
  }, [isAllowed]);

  useEffect(() => {
    if (!isAllowed) return;
    const unsubscribe = onSnapshot(
      doc(db, 'bakeryDailyReconciliation', businessDate),
      (snapshot) => {
        if (!snapshot.exists()) {
          setReconciliation(null);
          return;
        }
        setReconciliation(normalizeReconciliationDoc(snapshot.id, snapshot.data()));
      },
      (snapshotError) => {
        setError(snapshotError instanceof Error ? snapshotError.message : 'Failed to load daily reconciliation document.');
      }
    );
    return unsubscribe;
  }, [businessDate, isAllowed]);

  useEffect(() => {
    if (!isAllowed) return;
    const unsubscribe = onSnapshot(
      doc(db, 'cafeDailyReconciliation', businessDate),
      (snapshot) => {
        if (!snapshot.exists()) {
          setCafeReconciliation(null);
          return;
        }
        setCafeReconciliation(normalizeCafeReconciliationDoc(snapshot.id, snapshot.data()));
      },
      (snapshotError) => {
        setError(snapshotError instanceof Error ? snapshotError.message : 'Failed to load cafe daily reconciliation document.');
      }
    );
    return unsubscribe;
  }, [businessDate, isAllowed]);

  const soldBySku = useMemo(
    () => computeBakerySoldBySkuForDate(orders, businessDate, bakeryItems),
    [bakeryItems, businessDate, orders]
  );

  const priceByItemId = useMemo(() => {
    const next: Record<string, number> = {};
    bakeryItems.forEach((item) => {
      if (typeof item.price === 'number' && Number.isFinite(item.price) && item.price >= 0) {
        next[item.id] = item.price;
      }
    });
    return next;
  }, [bakeryItems]);

  const priceBySku = useMemo(() => {
    const next: Record<string, number> = {};
    bakeryItems.forEach((item) => {
      const sku = item.sku?.trim() || item.id;
      if (typeof item.price === 'number' && Number.isFinite(item.price) && item.price >= 0) {
        next[sku] = item.price;
      }
    });
    return next;
  }, [bakeryItems]);

  const previousSnapshotIndex = useMemo(() => {
    const olderSnapshots = snapshots.filter((snapshot) => snapshot.businessDate < businessDate);
    return buildPreviousSnapshotIndex(olderSnapshots);
  }, [businessDate, snapshots]);

  const baseLines = useMemo(() => {
    if (reconciliation?.lines?.length) {
      return reconciliation.lines
        .map((line) => buildBakeryReconciliationLine({
          sku: line.sku,
          itemId: line.itemId,
          itemName: line.itemName,
          unitPrice: priceByItemId[line.itemId] ?? priceBySku[line.sku] ?? line.unitPrice ?? 0,
          openingStock: line.openingStock,
          receivedStock: line.receivedStock,
          soldStock: soldBySku[line.sku] ?? line.soldStock,
          waste: line.waste,
          adjustment: line.adjustment,
          ...(typeof line.closingActual === 'number' ? { closingActual: line.closingActual } : {}),
        }))
        .sort((a, b) => a.itemName.localeCompare(b.itemName));
    }

    return buildOpeningLinesFromItems(bakeryItems, previousSnapshotIndex, soldBySku);
  }, [bakeryItems, previousSnapshotIndex, reconciliation, soldBySku, priceByItemId, priceBySku]);

  useEffect(() => {
    const nextDrafts: Record<string, LineDraft> = {};
    baseLines.forEach((line) => {
      nextDrafts[line.sku] = {
        receivedStock: line.receivedStock,
        waste: line.waste,
        adjustment: line.adjustment,
        closingActualInput: typeof line.closingActual === 'number' ? String(line.closingActual) : '',
      };
    });
    setDraftBySku(nextDrafts);
  }, [businessDate, reconciliation, baseLines.length]);

  const workingLines = useMemo(() => {
    return baseLines.map((line) => {
      const draft = draftBySku[line.sku];
      if (!draft) return line;

      const closingActual = draft.closingActualInput.trim() === ''
        ? undefined
        : normalizeNumberInput(draft.closingActualInput);

      return mergeManualLineFields(
        line,
        {
          receivedStock: draft.receivedStock,
          waste: draft.waste,
          adjustment: draft.adjustment,
          ...(typeof closingActual === 'number' ? { closingActual } : {}),
        },
        soldBySku[line.sku] ?? line.soldStock
      );
    });
  }, [baseLines, draftBySku, soldBySku]);

  const totals = useMemo(() => computeBakeryReconciliationTotals(workingLines), [workingLines]);
  const isClosed = reconciliation?.status === 'closed';
  const cafeStatusClosed = cafeReconciliation?.status === 'closed';
  const unresolvedOrdersForBusinessDate = useMemo(
    () =>
      orders.filter((order) => {
        if (resolveOrderBusinessDate(order) !== businessDate) return false;
        return !isTerminalOrderStatus(order.status);
      }),
    [orders, businessDate]
  );
  const staleOpenOrders = useMemo(
    () =>
      orders.filter((order) => {
        return isStaleOrder(order, businessDate);
      }),
    [orders, businessDate]
  );


  const bakeryAuditRows = useMemo(
    () => buildReconciliationAuditRows(
      orders.filter((order) => order.serviceArea === 'bakery' || order.serviceArea === 'mixed'),
      businessDate,
      'bakery'
    ),
    [orders, businessDate]
  );
  const cafeOrderAuditRows = useMemo(
    () => buildReconciliationAuditRows(
      orders.filter((order) => order.serviceArea === 'cafe' || order.serviceArea === 'mixed'),
      businessDate,
      'cafe'
    ),
    [orders, businessDate]
  );

  const bakeryDisplayAuditRows = useMemo(
    () => bakeryAuditRows.filter((row) => row.serviceArea === 'bakery'),
    [bakeryAuditRows]
  );
  const cafeDisplayAuditRows = useMemo(
    () => cafeOrderAuditRows.filter((row) => row.serviceArea === 'cafe'),
    [cafeOrderAuditRows]
  );

  const bakeryOrderSummary = useMemo(() => summarizeAuditRows(bakeryAuditRows, 'bakery'), [bakeryAuditRows]);
  const cafeOrderMetrics = useMemo(() => summarizeAuditRows(cafeOrderAuditRows, 'cafe'), [cafeOrderAuditRows]);

  const bakerySettlementTotals = useMemo(
    () =>
      computeSettlementTotals(bakeryOrderSummary, {
        cashReceived: bakerySettlementDraft.cashReceived,
        mobileMoneyReceived: bakerySettlementDraft.mobileMoneyReceived,
        bankReceived: bakerySettlementDraft.bankReceived,
        otherReceived: bakerySettlementDraft.otherReceived,
      }),
    [bakeryOrderSummary, bakerySettlementDraft]
  );
  const bakeryCashControl = useMemo(
    () => computeCashControl(bakerySettlementTotals, bakeryCashDraft),
    [bakerySettlementTotals, bakeryCashDraft]
  );

  const cafeTotals = useMemo(
    () =>
      buildCafeTotals(cafeOrderMetrics, {
        cashReceived: cafeDraft.cashReceived,
        mobileMoneyReceived: cafeDraft.mobileMoneyReceived,
        bankReceived: cafeDraft.bankReceived,
        otherReceived: cafeDraft.otherReceived,
      }),
    [cafeOrderMetrics, cafeDraft]
  );
  const cafeCashControl = useMemo(
    () => computeCashControl({
      grossCompletedSales: cafeTotals.grossCompletedSales,
      complimentaryValue: cafeTotals.complimentaryValue,
      creditValue: cafeTotals.creditValue,
      mixedReviewValue: cafeTotals.mixedReviewValue,
      collectibleExpectedCash: cafeTotals.collectibleExpectedCash,
      cashReceived: cafeTotals.cashReceived,
      mobileMoneyReceived: cafeTotals.mobileMoneyReceived,
      bankReceived: cafeTotals.bankReceived,
      otherReceived: cafeTotals.otherReceived,
      totalReceived: cafeTotals.totalReceived,
      variance: cafeTotals.variance,
    }, cafeCashDraft),
    [cafeTotals, cafeCashDraft]
  );

  useEffect(() => {
    if (!cafeReconciliation) {
      setCafeDraft({
        cashReceived: 0,
        mobileMoneyReceived: 0,
        bankReceived: 0,
        otherReceived: 0,
        notes: '',
      });
      setCafeCashDraft({
        openingCashFloat: 0,
        actualCountedCash: 0,
        cashRemoved: 0,
        handoverNotes: '',
        handoverStatus: 'draft',
        handedOverBy: undefined,
        handedOverAt: undefined,
        receivedBy: undefined,
        receivedAt: undefined,
      });
      return;
    }

    setCafeDraft({
      cashReceived: cafeReconciliation.totals.cashReceived || 0,
      mobileMoneyReceived: cafeReconciliation.totals.mobileMoneyReceived || 0,
      bankReceived: cafeReconciliation.totals.bankReceived || 0,
      otherReceived: cafeReconciliation.totals.otherReceived || 0,
      notes: cafeReconciliation.notes || '',
    });
    setCafeCashDraft({
      openingCashFloat: cafeReconciliation.cashControl?.openingCashFloat || 0,
      actualCountedCash: cafeReconciliation.cashControl?.actualCountedCash || 0,
      cashRemoved: cafeReconciliation.cashControl?.cashRemoved || 0,
      handoverNotes: cafeReconciliation.cashControl?.handoverNotes || '',
      handoverStatus: cafeReconciliation.cashControl?.handoverStatus || 'draft',
      handedOverBy: cafeReconciliation.cashControl?.handedOverBy,
      handedOverAt: cafeReconciliation.cashControl?.handedOverAt,
      receivedBy: cafeReconciliation.cashControl?.receivedBy,
      receivedAt: cafeReconciliation.cashControl?.receivedAt,
    });
  }, [cafeReconciliation, businessDate]);

  useEffect(() => {
    if (!reconciliation?.settlement) {
      setBakerySettlementDraft({
        cashReceived: 0,
        mobileMoneyReceived: 0,
        bankReceived: 0,
        otherReceived: 0,
      });
      setBakeryCashDraft({
        openingCashFloat: 0,
        actualCountedCash: 0,
        cashRemoved: 0,
        handoverNotes: '',
        handoverStatus: 'draft',
        handedOverBy: undefined,
        handedOverAt: undefined,
        receivedBy: undefined,
        receivedAt: undefined,
      });
      return;
    }
    setBakerySettlementDraft({
      cashReceived: reconciliation.settlement.cashReceived || 0,
      mobileMoneyReceived: reconciliation.settlement.mobileMoneyReceived || 0,
      bankReceived: reconciliation.settlement.bankReceived || 0,
      otherReceived: reconciliation.settlement.otherReceived || 0,
    });
    setBakeryCashDraft({
      openingCashFloat: reconciliation.cashControl?.openingCashFloat || 0,
      actualCountedCash: reconciliation.cashControl?.actualCountedCash || 0,
      cashRemoved: reconciliation.cashControl?.cashRemoved || 0,
      handoverNotes: reconciliation.cashControl?.handoverNotes || '',
      handoverStatus: reconciliation.cashControl?.handoverStatus || 'draft',
      handedOverBy: reconciliation.cashControl?.handedOverBy,
      handedOverAt: reconciliation.cashControl?.handedOverAt,
      receivedBy: reconciliation.cashControl?.receivedBy,
      receivedAt: reconciliation.cashControl?.receivedAt,
    });
  }, [reconciliation, businessDate]);

  const updateDraftField = (sku: string, key: keyof LineDraft, value: string) => {
    setDraftBySku((prev) => {
      const current = prev[sku] || { receivedStock: 0, waste: 0, adjustment: 0, closingActualInput: '' };
      const next = { ...current };

      if (key === 'closingActualInput') {
        next.closingActualInput = value;
      } else {
        next[key] = normalizeNumberInput(value);
      }

      return { ...prev, [sku]: next };
    });
  };

  const appendLedgerEntries = async (
    businessDateValue: string,
    previousLines: Record<string, BakeryDailyReconciliationLine>,
    nextLines: BakeryDailyReconciliationLine[],
    includeOpening: boolean
  ): Promise<number> => {
    const batch = writeBatch(db);
    const now = serverTimestamp();
    let writes = 0;

    nextLines.forEach((line) => {
      const prev = previousLines[line.sku];
      const addLedger = (eventType: 'opening' | 'received' | 'sold' | 'waste' | 'adjustment' | 'closing_actual', quantity: number, note?: string) => {
        if (!Number.isFinite(quantity)) return;
        if (quantity === 0) return;
        batch.set(doc(collection(db, 'bakeryStockLedger')), sanitizeWritePayload({
          businessDate: businessDateValue,
          sku: line.sku,
          itemId: line.itemId,
          itemName: line.itemName,
          eventType,
          quantity,
          ...(note ? { note } : {}),
          createdAt: now,
          ...(actor ? { createdBy: actor } : {}),
          reconciliationId: businessDateValue,
        }));
        writes += 1;
      };

      if (includeOpening && !prev) {
        addLedger('opening', line.openingStock, 'Opening stock baseline');
      }

      addLedger('received', line.receivedStock - (prev?.receivedStock || 0));
      addLedger('sold', line.soldStock - (prev?.soldStock || 0));
      addLedger('waste', line.waste - (prev?.waste || 0));
      addLedger('adjustment', line.adjustment - (prev?.adjustment || 0));
    });

    if (writes > 0) {
      await batch.commit();
    }
    return writes;
  };

  const forceResolveOrders = async (
    targetOrders: PersistedOrder[],
    reason: 'day_close' | 'stale_day_recovery'
  ): Promise<number> => {
    if (!targetOrders.length) return 0;
    const batch = writeBatch(db);
    targetOrders.forEach((order) => {
      if (!order.id) return;
      const originalBusinessDate = resolveOrderBusinessDate(order);
      batch.set(
        doc(db, 'orders', order.id),
        sanitizeWritePayload({
          status: 'rejected',
          accountingTreatment: 'cancelled',
          ...(reason === 'day_close'
            ? { accountingReasonCode: 'other', accountingReasonNote: `Auto-cancelled on day close (${businessDateLabel}).` }
            : { accountingReasonCode: 'mixed_unresolved', accountingReasonNote: 'Auto-cancelled stale unresolved order during next-day recovery.' }),
          accountingUpdatedAt: serverTimestamp(),
          ...(actor ? { accountingUpdatedBy: actor } : { accountingUpdatedBy: null }),
          resolution: 'forced_close',
          resolutionReason: reason === 'day_close' ? 'day_close' : 'stale_recovery_cancel',
          resolutionUpdatedAt: serverTimestamp(),
          ...(actor ? { resolutionUpdatedBy: actor } : { resolutionUpdatedBy: null }),
          ...(originalBusinessDate ? { originalBusinessDate } : {}),
          recoveryAction: 'stale_cancel',
          recoveryReason: 'stale_recovery_cancel',
          recoveryUpdatedAt: serverTimestamp(),
          ...(actor ? { recoveryUpdatedBy: actor } : { recoveryUpdatedBy: null }),
          updatedAt: serverTimestamp(),
        }),
        { merge: true }
      );
    });
    await batch.commit();
    return targetOrders.length;
  };

  const handleOpenDay = async () => {
    if (!canEditBakery || busy || isClosed || reconciliation) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setWriteSummary(null);

    try {
      const ledgerEntriesWritten = await appendLedgerEntries(businessDate, {}, workingLines, true);
      await setDoc(doc(db, 'bakeryDailyReconciliation', businessDate), sanitizeWritePayload({
        businessDate,
        status: 'open',
        lines: workingLines,
        totals,
        settlement: bakerySettlementTotals,
        cashControl: bakeryCashControl,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...(actor ? { openedBy: actor } : {}),
        ...(actor ? { lastUpdatedBy: actor } : {}),
      }), { merge: true });
      setNotice('Day opened. Opening stock baseline saved.');
      setWriteSummary({
        reconciliationDocId: businessDate,
        collection: 'bakeryDailyReconciliation',
        ledgerEntriesWritten,
        snapshotsWritten: 0,
        action: 'open',
      });
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'Could not open the day.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!canEditBakery || busy || isClosed) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setWriteSummary(null);

    try {
      const previousMap = Object.fromEntries((reconciliation?.lines || []).map((line) => [line.sku, line]));
      const ledgerEntriesWritten = await appendLedgerEntries(businessDate, previousMap, workingLines, !reconciliation);
      await setDoc(doc(db, 'bakeryDailyReconciliation', businessDate), sanitizeWritePayload({
        businessDate,
        status: 'open',
        lines: workingLines,
        totals,
        settlement: bakerySettlementTotals,
        cashControl: bakeryCashControl,
        ...(actor && !reconciliation ? { openedBy: actor } : {}),
        ...(reconciliation?.createdAt ? { createdAt: reconciliation.createdAt } : { createdAt: serverTimestamp() }),
        updatedAt: serverTimestamp(),
        ...(actor ? { lastUpdatedBy: actor } : {}),
      }), { merge: true });
      setNotice('Draft reconciliation saved.');
      setWriteSummary({
        reconciliationDocId: businessDate,
        collection: 'bakeryDailyReconciliation',
        ledgerEntriesWritten,
        snapshotsWritten: 0,
        action: 'save',
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save reconciliation.');
    } finally {
      setBusy(false);
    }
  };

  const handleCloseDay = async () => {
    if (!canEditBakery || busy || isClosed) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setWriteSummary(null);

    try {
      const missingClosing = workingLines.some((line) => typeof line.closingActual !== 'number');
      if (missingClosing) {
        throw new Error('Enter physical closing count for every item before closing the day.');
      }

      let forcedResolutions = 0;
      if (unresolvedOrdersForBusinessDate.length > 0) {
        if (currentUser?.role !== 'admin') {
          throw new Error('Active orders must be resolved by front/kitchen/barista before close, or closed by an admin with forced resolution.');
        }
        const confirmClose = typeof window === 'undefined'
          ? false
          : window.confirm(
              `You have ${unresolvedOrdersForBusinessDate.length} active order(s) for ${businessDateLabel}. ` +
              'Close day and auto-cancel them as forced day-close resolutions?'
            );
        if (!confirmClose) {
          throw new Error('Day close blocked: resolve active orders first or confirm forced close.');
        }
        forcedResolutions += await forceResolveOrders(unresolvedOrdersForBusinessDate, 'day_close');
      }
      if (staleOpenOrders.length > 0) {
        if (currentUser?.role !== 'admin') {
          throw new Error('Stale unresolved orders exist from previous days. Ask an admin to run forced resolution on close.');
        }
        forcedResolutions += await forceResolveOrders(staleOpenOrders, 'stale_day_recovery');
      }

      const previousMap = Object.fromEntries((reconciliation?.lines || []).map((line) => [line.sku, line]));
      const ledgerEntriesWritten = await appendLedgerEntries(businessDate, previousMap, workingLines, !reconciliation);

      const closingBatch = writeBatch(db);
      const now = serverTimestamp();
      let snapshotsWritten = 0;
      let closingLedgerWrites = 0;

      workingLines.forEach((line) => {
        closingBatch.set(doc(collection(db, 'bakeryStockLedger')), sanitizeWritePayload({
          businessDate,
          sku: line.sku,
          itemId: line.itemId,
          itemName: line.itemName,
          eventType: 'closing_actual',
          quantity: line.closingActual,
          note: 'Physical closing count',
          createdAt: now,
          ...(actor ? { createdBy: actor } : {}),
          reconciliationId: businessDate,
        }));
        closingLedgerWrites += 1;

        const snapshotId = `${businessDate}_${line.sku}`;
        closingBatch.set(doc(db, 'bakeryStockSnapshots', snapshotId), sanitizeWritePayload({
          businessDate,
          sku: line.sku,
          itemId: line.itemId,
          itemName: line.itemName,
          unitPrice: line.unitPrice,
          openingStock: line.openingStock,
          receivedStock: line.receivedStock,
          soldStock: line.soldStock,
          expectedSalesValue: line.expectedSalesValue,
          waste: line.waste,
          adjustment: line.adjustment,
          closingExpected: line.closingExpected,
          closingActual: line.closingActual,
          variance: line.variance ?? (line.closingActual - line.closingExpected),
          reconciliationStatus: 'closed',
          updatedAt: now,
        }));
        snapshotsWritten += 1;
      });

      closingBatch.set(doc(db, 'bakeryDailyReconciliation', businessDate), sanitizeWritePayload({
        businessDate,
        status: 'closed',
        lines: workingLines,
        totals: computeBakeryReconciliationTotals(workingLines),
        settlement: bakerySettlementTotals,
        cashControl: { ...bakeryCashControl, handoverStatus: 'closed' },
        ...(reconciliation?.createdAt ? { createdAt: reconciliation.createdAt } : { createdAt: now }),
        updatedAt: now,
        closedAt: now,
        ...(actor ? { lastUpdatedBy: actor } : {}),
        ...(actor ? { closedBy: actor } : {}),
      }), { merge: true });

      await closingBatch.commit();
      setNotice('Day closed. Snapshots saved for carry-forward.');
      setWriteSummary({
        reconciliationDocId: businessDate,
        collection: 'bakeryDailyReconciliation',
        ledgerEntriesWritten: ledgerEntriesWritten + closingLedgerWrites,
        snapshotsWritten,
        action: 'close',
      });
      if (forcedResolutions > 0) {
        setNotice(`Day closed. Snapshots saved, and ${forcedResolutions} active/stale order(s) were force-resolved.`);
      }
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : 'Could not close reconciliation day.');
    } finally {
      setBusy(false);
    }
  };

  const updateCafeDraftNumber = (key: keyof Omit<CafeDraft, 'notes'>, raw: string) => {
    const next = Number(raw);
    setCafeDraft((prev) => ({
      ...prev,
      [key]: Number.isFinite(next) ? Math.max(0, next) : 0,
    }));
  };

  const updateBakerySettlementDraftNumber = (key: keyof SettlementDraft, raw: string) => {
    const next = Number(raw);
    setBakerySettlementDraft((prev) => ({
      ...prev,
      [key]: Number.isFinite(next) ? Math.max(0, next) : 0,
    }));
  };

  const updateCashDraftNumber = (targetMode: ReconciliationMode, key: 'openingCashFloat' | 'actualCountedCash' | 'cashRemoved', raw: string) => {
    const next = Number(raw);
    const safe = Number.isFinite(next) ? Math.max(0, next) : 0;
    if (targetMode === 'bakery') {
      setBakeryCashDraft((prev) => ({ ...prev, [key]: safe }));
      return;
    }
    setCafeCashDraft((prev) => ({ ...prev, [key]: safe }));
  };

  const updateCashDraftText = (targetMode: ReconciliationMode, notes: string) => {
    if (targetMode === 'bakery') {
      setBakeryCashDraft((prev) => ({ ...prev, handoverNotes: notes }));
      return;
    }
    setCafeCashDraft((prev) => ({ ...prev, handoverNotes: notes }));
  };

  const updateHandoverStatusDraft = (targetMode: ReconciliationMode, status: CashControlDraft['handoverStatus']) => {
    const now = new Date();
    if (targetMode === 'bakery') {
      setBakeryCashDraft((prev) => ({
        ...prev,
        handoverStatus: status,
        ...(status === 'handed_over' ? { handedOverBy: actor || prev.handedOverBy, handedOverAt: now } : {}),
        ...(status === 'received' ? { receivedBy: actor || prev.receivedBy, receivedAt: now } : {}),
      }));
      return;
    }
    setCafeCashDraft((prev) => ({
      ...prev,
      handoverStatus: status,
      ...(status === 'handed_over' ? { handedOverBy: actor || prev.handedOverBy, handedOverAt: now } : {}),
      ...(status === 'received' ? { receivedBy: actor || prev.receivedBy, receivedAt: now } : {}),
    }));
  };

  useEffect(() => {
    const rows = mode === 'bakery' ? bakeryDisplayAuditRows : cafeDisplayAuditRows;
    const next: Record<string, AccountingDraft> = {};
    rows.forEach((row) => {
      next[row.orderId] = {
        treatment: row.treatment,
        reasonCode: row.reasonCode || '',
        reasonNote: row.reasonNote || '',
      };
    });
    setOrderAccountingDrafts(next);
    setSelectedAccountingOrderId(null);
  }, [businessDate, mode, bakeryDisplayAuditRows, cafeDisplayAuditRows]);

  const updateAccountingDraft = (
    orderId: string,
    key: keyof AccountingDraft,
    value: string
  ) => {
    setOrderAccountingDrafts((prev) => {
      const current = prev[orderId] || { treatment: 'paid', reasonCode: '', reasonNote: '' };
      let nextDraft: AccountingDraft = { ...current };
      if (key === 'treatment') {
        nextDraft = { ...nextDraft, treatment: value as AccountingTreatment };
      } else if (key === 'reasonCode') {
        nextDraft = { ...nextDraft, reasonCode: value as AccountingReasonCode | '' };
      } else {
        nextDraft = { ...nextDraft, reasonNote: value };
      }
      return {
        ...prev,
        [orderId]: nextDraft,
      };
    });
  };

  const saveAccountingTreatment = async (orderId: string, targetMode: ReconciliationMode) => {
    const canEdit = targetMode === 'bakery' ? canEditBakeryAccounting : canEditCafeAccounting;
    if (!canEdit || !orderId) return;
    const draft = orderAccountingDrafts[orderId];
    if (!draft) return;

    if (draft.treatment !== 'paid' && !draft.reasonCode) {
      setError('Reason code is required when treatment is not Paid.');
      return;
    }
    if ((draft.treatment === 'credit' || draft.treatment === 'mixed_review' || draft.treatment === 'cancelled') && !draft.reasonNote.trim()) {
      setError('A note is required for Credit, Mixed Review, and Cancelled treatments.');
      return;
    }

    setAccountingBusyOrderId(orderId);
    setError(null);
    setNotice(null);

    try {
      const payload = sanitizeWritePayload({
        accountingTreatment: draft.treatment,
        ...(draft.reasonCode ? { accountingReasonCode: draft.reasonCode } : { accountingReasonCode: null }),
        ...(draft.reasonNote.trim() ? { accountingReasonNote: draft.reasonNote.trim() } : { accountingReasonNote: '' }),
        accountingUpdatedAt: serverTimestamp(),
        ...(actor ? { accountingUpdatedBy: actor } : { accountingUpdatedBy: null }),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'orders', orderId), payload, { merge: true });
      setNotice(`Saved accounting treatment for order ${orderId}.`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Could not save accounting treatment.');
    } finally {
      setAccountingBusyOrderId(null);
    }
  };

  const handleOpenCafeDay = async () => {
    if (!canEditCafe || busy || cafeStatusClosed || cafeReconciliation) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setWriteSummary(null);

    try {
      await setDoc(doc(db, 'cafeDailyReconciliation', businessDate), sanitizeWritePayload({
        businessDate,
        status: 'open',
        totals: cafeTotals,
        cashControl: cafeCashControl,
        notes: cafeDraft.notes.trim(),
        includeMixedOrders: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...(actor ? { openedBy: actor } : {}),
        ...(actor ? { lastUpdatedBy: actor } : {}),
      }), { merge: true });
      setNotice(`Opened cafe reconciliation for ${businessDateLabel}.`);
      setWriteSummary({
        reconciliationDocId: businessDate,
        collection: 'cafeDailyReconciliation',
        ledgerEntriesWritten: 0,
        snapshotsWritten: 0,
        action: 'open',
      });
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'Could not open cafe day.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveCafeDraft = async () => {
    if (!canEditCafe || busy || cafeStatusClosed) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setWriteSummary(null);

    try {
      await setDoc(doc(db, 'cafeDailyReconciliation', businessDate), sanitizeWritePayload({
        businessDate,
        status: 'open',
        totals: cafeTotals,
        cashControl: cafeCashControl,
        notes: cafeDraft.notes.trim(),
        includeMixedOrders: false,
        ...(cafeReconciliation?.createdAt ? { createdAt: cafeReconciliation.createdAt } : { createdAt: serverTimestamp() }),
        updatedAt: serverTimestamp(),
        ...(actor && !cafeReconciliation ? { openedBy: actor } : {}),
        ...(actor ? { lastUpdatedBy: actor } : {}),
      }), { merge: true });
      setNotice(`Saved cafe reconciliation draft for ${businessDateLabel}.`);
      setWriteSummary({
        reconciliationDocId: businessDate,
        collection: 'cafeDailyReconciliation',
        ledgerEntriesWritten: 0,
        snapshotsWritten: 0,
        action: 'save',
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save cafe draft.');
    } finally {
      setBusy(false);
    }
  };

  const handleCloseCafeDay = async () => {
    if (!canEditCafe || busy || cafeStatusClosed) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setWriteSummary(null);

    try {
      let forcedResolutions = 0;
      if (unresolvedOrdersForBusinessDate.length > 0) {
        if (currentUser?.role !== 'admin') {
          throw new Error('Active orders must be resolved by front/kitchen/barista before close, or closed by an admin with forced resolution.');
        }
        const confirmClose = typeof window === 'undefined'
          ? false
          : window.confirm(
              `You have ${unresolvedOrdersForBusinessDate.length} active order(s) for ${businessDateLabel}. ` +
              'Close day and auto-cancel them as forced day-close resolutions?'
            );
        if (!confirmClose) {
          throw new Error('Day close blocked: resolve active orders first or confirm forced close.');
        }
        forcedResolutions += await forceResolveOrders(unresolvedOrdersForBusinessDate, 'day_close');
      }
      if (staleOpenOrders.length > 0) {
        if (currentUser?.role !== 'admin') {
          throw new Error('Stale unresolved orders exist from previous days. Ask an admin to run forced resolution on close.');
        }
        forcedResolutions += await forceResolveOrders(staleOpenOrders, 'stale_day_recovery');
      }

      await setDoc(doc(db, 'cafeDailyReconciliation', businessDate), sanitizeWritePayload({
        businessDate,
        status: 'closed',
        totals: cafeTotals,
        cashControl: { ...cafeCashControl, handoverStatus: 'closed' },
        notes: cafeDraft.notes.trim(),
        includeMixedOrders: false,
        ...(cafeReconciliation?.createdAt ? { createdAt: cafeReconciliation.createdAt } : { createdAt: serverTimestamp() }),
        updatedAt: serverTimestamp(),
        closedAt: serverTimestamp(),
        ...(actor ? { lastUpdatedBy: actor } : {}),
        ...(actor ? { closedBy: actor } : {}),
      }), { merge: true });
      setNotice(`Closed cafe reconciliation for ${businessDateLabel}.`);
      setWriteSummary({
        reconciliationDocId: businessDate,
        collection: 'cafeDailyReconciliation',
        ledgerEntriesWritten: 0,
        snapshotsWritten: 0,
        action: 'close',
      });
      if (forcedResolutions > 0) {
        setNotice(`Closed cafe reconciliation for ${businessDateLabel}. Force-resolved ${forcedResolutions} active/stale order(s).`);
      }
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : 'Could not close cafe day.');
    } finally {
      setBusy(false);
    }
  };

  const activeReconciliation = mode === 'bakery' ? reconciliation : cafeReconciliation;
  const activeAuditRows = mode === 'bakery' ? bakeryDisplayAuditRows : cafeDisplayAuditRows;
  const activeStatusClosed = mode === 'bakery' ? isClosed : cafeStatusClosed;
  const legacyMissingFields = useMemo(() => {
    if (!activeReconciliation) return [] as string[];
    const missing: string[] = [];
    if (!activeReconciliation.lastUpdatedBy) missing.push('lastUpdatedBy');
    if (mode === 'bakery') {
      if (!reconciliation?.settlement) missing.push('settlement');
      if (!reconciliation?.cashControl) missing.push('cashControl');
    } else {
      if (!cafeReconciliation?.cashControl) missing.push('cashControl');
    }
    return missing;
  }, [activeReconciliation, mode, reconciliation, cafeReconciliation]);

  const renderAuditActor = (value: { displayName?: string } | undefined, legacyLabel: string): string => {
    if (value?.displayName) return value.displayName;
    if (activeReconciliation) return `${legacyLabel} (legacy record)`;
    return '—';
  };

  const renderAccountingEditorPanel = (
    targetMode: ReconciliationMode,
    rows: ReconciliationAuditRow[]
  ) => {
    const row = rows.find((entry) => entry.orderId === selectedAccountingOrderId) || null;
    if (!row) {
      return (
        <section className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
          <h3 className="text-lg font-semibold">Order Treatment Editor</h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">Select an order row and click `Edit Treatment` to classify settlement treatment.</p>
        </section>
      );
    }

    const draft = orderAccountingDrafts[row.orderId] || {
      treatment: row.treatment,
      reasonCode: (row.reasonCode || '') as AccountingReasonCode | '',
      reasonNote: row.reasonNote || '',
    };
    const canEdit = targetMode === 'bakery'
      ? canEditBakeryAccounting && row.serviceArea === 'bakery'
      : canEditCafeAccounting && row.serviceArea === 'cafe';

    return (
      <section className="rounded-2xl border border-[var(--color-border)] bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold">Order Treatment Editor</h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              Editing order <strong>{row.orderId}</strong> ({row.customerName || 'Walk-in'}) - {formatCurrency(row.total)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSelectedAccountingOrderId(null)}
            className="rounded border border-[var(--color-border)] px-3 py-1 text-xs font-semibold"
          >
            Close
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-sm">
            <span className="block text-[var(--color-text-muted)] mb-1">Treatment</span>
            <select
              value={draft.treatment}
              onChange={(event) => updateAccountingDraft(row.orderId, 'treatment', event.target.value)}
              disabled={!canEdit || accountingBusyOrderId === row.orderId}
              className="w-full rounded border border-[var(--color-border)] px-2 py-2 text-sm disabled:bg-gray-100"
            >
              {ACCOUNTING_TREATMENT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-[var(--color-text-muted)] mb-1">Reason Code</span>
            <select
              value={draft.reasonCode}
              onChange={(event) => updateAccountingDraft(row.orderId, 'reasonCode', event.target.value)}
              disabled={!canEdit || accountingBusyOrderId === row.orderId}
              className="w-full rounded border border-[var(--color-border)] px-2 py-2 text-sm disabled:bg-gray-100"
            >
              <option value="">Select reason code</option>
              {ACCOUNTING_REASON_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-[var(--color-text-muted)] mb-1">Note</span>
            <input
              value={draft.reasonNote}
              onChange={(event) => updateAccountingDraft(row.orderId, 'reasonNote', event.target.value)}
              placeholder="Required for credit/mixed/cancelled"
              disabled={!canEdit || accountingBusyOrderId === row.orderId}
              className="w-full rounded border border-[var(--color-border)] px-2 py-2 text-sm disabled:bg-gray-100"
            />
          </label>
        </div>
        {!canEdit && (
          <p className="text-xs text-[var(--color-text-muted)]">You cannot edit this order from the current mode/role.</p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => saveAccountingTreatment(row.orderId, targetMode)}
            disabled={!canEdit || accountingBusyOrderId === row.orderId}
            className="rounded-xl bg-[var(--color-primary)] text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {accountingBusyOrderId === row.orderId ? 'Saving...' : 'Save Treatment'}
          </button>
        </div>
      </section>
    );
  };

  if (!isAllowed) {
    return (
      <div className="px-4 py-12 space-y-4 text-center">
        <div className="w-16 h-16 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-3xl font-serif">Access Denied</h2>
        <p className="text-sm text-[var(--color-text-muted)]">You do not have permission to access reconciliation.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 pb-24 space-y-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-3xl font-serif">
            {mode === 'bakery' ? 'Bakery Daily Reconciliation' : 'Cafe Daily Reconciliation'}
          </h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            {mode === 'bakery'
              ? 'Open day, capture stock movement, and close with variance by bakery SKU.'
              : 'Open day, reconcile completed cafe orders to received payments, and close with order-to-cash variance.'}
          </p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            Role mode: {mode === 'bakery'
              ? (canEditBakery ? 'Editable' : 'View only (admin/bakery accountant required for updates)')
              : (canEditCafe ? 'Editable' : 'View only (admin/cafe accountant required for updates)')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="business-date">Business Date</label>
          <input
            id="business-date"
            type="date"
            value={businessDate}
            onChange={(event) => setBusinessDate(parseBusinessDateInput(event.target.value, businessDate))}
            className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
          />
          <span className="text-xs font-semibold text-[var(--color-text-muted)]">{businessDateLabel}</span>
        </div>
      </header>

      <section className="rounded-2xl border border-[var(--color-border)] bg-white p-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="inline-flex gap-2">
          <button
            type="button"
            onClick={() => setMode('bakery')}
            disabled={!availableModes.includes('bakery')}
            className={`rounded-xl px-3 py-2 text-sm font-semibold ${
              mode === 'bakery'
                ? 'bg-[var(--color-primary)] text-white'
                : 'border border-[var(--color-border)] bg-white text-[var(--color-text)]'
            } disabled:opacity-50`}
          >
            Bakery Mode
          </button>
          <button
            type="button"
            onClick={() => setMode('cafe')}
            disabled={!availableModes.includes('cafe')}
            className={`rounded-xl px-3 py-2 text-sm font-semibold ${
              mode === 'cafe'
                ? 'bg-[var(--color-primary)] text-white'
                : 'border border-[var(--color-border)] bg-white text-[var(--color-text)]'
            } disabled:opacity-50`}
          >
            Cafe Mode
          </button>
        </div>
        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] space-x-3">
          <span>Active Mode: <span className="text-[var(--color-text)]">{mode === 'bakery' ? 'Bakery' : 'Cafe'}</span></span>
          <span>Status: <span className="text-[var(--color-text)]">{activeReconciliation?.status || 'not_opened'}</span></span>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}
      {notice && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">{notice}</div>
      )}
      {writeSummary && (
        <div className="rounded-xl border border-[var(--color-border)] bg-white px-4 py-2 text-xs text-[var(--color-text-muted)]">
          <strong className="text-[var(--color-text)] uppercase tracking-wide mr-2">{writeSummary.action}</strong>
          wrote <code>{writeSummary.collection}/{writeSummary.reconciliationDocId}</code>,
          ledger entries: <strong>{writeSummary.ledgerEntriesWritten}</strong>,
          snapshots: <strong>{writeSummary.snapshotsWritten}</strong>.
        </div>
      )}
      {(unresolvedOrdersForBusinessDate.length > 0 || staleOpenOrders.length > 0) && (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-1">
          {unresolvedOrdersForBusinessDate.length > 0 && (
            <p>
              Day-close guard: <strong>{unresolvedOrdersForBusinessDate.length}</strong> active order(s) exist for {businessDateLabel}.
              Close Day will block unless you confirm forced resolution.
            </p>
          )}
          {staleOpenOrders.length > 0 && (
            <p>
              Stale recovery pending: <strong>{staleOpenOrders.length}</strong> unresolved order(s) from previous business dates will be auto-resolved on close.
            </p>
          )}
        </section>
      )}

      <section className={`rounded-2xl border px-4 py-3 text-sm ${
        activeStatusClosed
          ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
          : 'border-amber-300 bg-amber-50 text-amber-900'
      }`}>
        {activeStatusClosed
          ? 'Finalized reconciliation: this business date is read-only and closed.'
          : 'Active reconciliation: this business date is open for updates until you close the day.'}
      </section>

      {activeReconciliation && legacyMissingFields.length > 0 && (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Legacy record compatibility: missing historical fields `{legacyMissingFields.join(', ')}` are shown as not available.
        </section>
      )}

      <section className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">Audit Trail</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-[var(--color-text-muted)]">Opened By</p>
            <p className="font-semibold">{renderAuditActor(activeReconciliation?.openedBy, 'Not available')}</p>
          </div>
          <div>
            <p className="text-[var(--color-text-muted)]">Last Updated By</p>
            <p className="font-semibold">{renderAuditActor(activeReconciliation?.lastUpdatedBy, 'Not available')}</p>
          </div>
          <div>
            <p className="text-[var(--color-text-muted)]">Last Updated At</p>
            <p className="font-semibold">{activeReconciliation?.updatedAt ? formatDateTime(activeReconciliation.updatedAt) : (activeReconciliation ? 'Not available (legacy record)' : '—')}</p>
          </div>
          <div>
            <p className="text-[var(--color-text-muted)]">Closed By</p>
            <p className="font-semibold">{renderAuditActor(activeReconciliation?.closedBy, 'Not available')}</p>
          </div>
          <div>
            <p className="text-[var(--color-text-muted)]">Closed At</p>
            <p className="font-semibold">{activeReconciliation?.closedAt ? formatDateTime(activeReconciliation.closedAt) : (activeStatusClosed ? 'Not available (legacy record)' : '—')}</p>
          </div>
        </div>
      </section>

      {mode === 'bakery' ? (
        <>
          <section className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><p className="text-[var(--color-text-muted)]">Status</p><p className="font-semibold">{reconciliation?.status || 'not_opened'}</p></div>
              <div><p className="text-[var(--color-text-muted)]">SKU Count</p><p className="font-semibold">{workingLines.length}</p></div>
              <div><p className="text-[var(--color-text-muted)]">Last Updated</p><p className="font-semibold">{reconciliation ? formatDateTime(reconciliation.updatedAt) : 'Not yet'}</p></div>
              <div><p className="text-[var(--color-text-muted)]">Closed At</p><p className="font-semibold">{reconciliation?.closedAt ? formatDateTime(reconciliation.closedAt) : 'Open'}</p></div>
            </div>
          </section>

          <section className="grid grid-cols-2 xl:grid-cols-6 gap-3">
            <article className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Collectible Expected Cash</p>
              <p className="mt-1 text-2xl font-semibold">{formatCurrency(bakerySettlementTotals.collectibleExpectedCash)}</p>
            </article>
            <article className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Total Received</p>
              <p className="mt-1 text-2xl font-semibold">{formatCurrency(bakerySettlementTotals.totalReceived)}</p>
            </article>
            <article className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Variance</p>
              <p className={`mt-1 text-2xl font-semibold ${bakerySettlementTotals.variance === 0 ? '' : bakerySettlementTotals.variance > 0 ? 'text-green-700' : 'text-red-700'}`}>
                {formatCurrency(bakerySettlementTotals.variance)}
              </p>
            </article>
            <article className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Gross Completed Sales</p>
              <p className="mt-1 text-2xl font-semibold">{formatCurrency(bakerySettlementTotals.grossCompletedSales)}</p>
            </article>
            <article className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Credit Outstanding</p>
              <p className="mt-1 text-2xl font-semibold">{formatCurrency(bakerySettlementTotals.creditValue)}</p>
            </article>
            <article className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Complimentary Value</p>
              <p className="mt-1 text-2xl font-semibold">{formatCurrency(bakerySettlementTotals.complimentaryValue)}</p>
            </article>
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <article className="rounded-2xl border border-[var(--color-border)] bg-white p-4 space-y-4">
              <header>
                <h3 className="text-lg font-semibold">Bakery Actual Receipts</h3>
                <p className="text-xs text-[var(--color-text-muted)]">Capture receipts to compare against collectible expected cash.</p>
              </header>
              {reconciliation && !reconciliation.cashControl && (
                <p className="text-xs text-amber-700">Legacy record: cash-control fields were not captured on this historical day.</p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-sm">
                  <span className="block text-[var(--color-text-muted)] mb-1">Cash Received</span>
                  <input
                    type="number"
                    min={0}
                    value={bakerySettlementDraft.cashReceived}
                    onChange={(event) => updateBakerySettlementDraftNumber('cashReceived', event.target.value)}
                    disabled={!canEditBakery || isClosed}
                    className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 disabled:bg-gray-100"
                  />
                </label>
                <label className="text-sm">
                  <span className="block text-[var(--color-text-muted)] mb-1">Mobile Money</span>
                  <input
                    type="number"
                    min={0}
                    value={bakerySettlementDraft.mobileMoneyReceived}
                    onChange={(event) => updateBakerySettlementDraftNumber('mobileMoneyReceived', event.target.value)}
                    disabled={!canEditBakery || isClosed}
                    className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 disabled:bg-gray-100"
                  />
                </label>
                <label className="text-sm">
                  <span className="block text-[var(--color-text-muted)] mb-1">Bank / Transfer</span>
                  <input
                    type="number"
                    min={0}
                    value={bakerySettlementDraft.bankReceived}
                    onChange={(event) => updateBakerySettlementDraftNumber('bankReceived', event.target.value)}
                    disabled={!canEditBakery || isClosed}
                    className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 disabled:bg-gray-100"
                  />
                </label>
                <label className="text-sm">
                  <span className="block text-[var(--color-text-muted)] mb-1">Other</span>
                  <input
                    type="number"
                    min={0}
                    value={bakerySettlementDraft.otherReceived}
                    onChange={(event) => updateBakerySettlementDraftNumber('otherReceived', event.target.value)}
                    disabled={!canEditBakery || isClosed}
                    className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 disabled:bg-gray-100"
                  />
                </label>
                <label className="text-sm">
                  <span className="block text-[var(--color-text-muted)] mb-1">Opening Cash Float</span>
                  <input
                    type="number"
                    min={0}
                    value={bakeryCashDraft.openingCashFloat}
                    onChange={(event) => updateCashDraftNumber('bakery', 'openingCashFloat', event.target.value)}
                    disabled={!canEditBakery || isClosed}
                    className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 disabled:bg-gray-100"
                  />
                </label>
                <label className="text-sm">
                  <span className="block text-[var(--color-text-muted)] mb-1">Cash Removed</span>
                  <input
                    type="number"
                    min={0}
                    value={bakeryCashDraft.cashRemoved}
                    onChange={(event) => updateCashDraftNumber('bakery', 'cashRemoved', event.target.value)}
                    disabled={!canEditBakery || isClosed}
                    className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 disabled:bg-gray-100"
                  />
                </label>
                <label className="text-sm">
                  <span className="block text-[var(--color-text-muted)] mb-1">Actual Counted Cash</span>
                  <input
                    type="number"
                    min={0}
                    value={bakeryCashDraft.actualCountedCash}
                    onChange={(event) => updateCashDraftNumber('bakery', 'actualCountedCash', event.target.value)}
                    disabled={!canEditBakery || isClosed}
                    className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 disabled:bg-gray-100"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-[var(--color-text-muted)]">Expected Drawer Cash</p><p className="font-semibold">{formatCurrency(bakeryCashControl.expectedDrawerCash)}</p></div>
                <div><p className="text-[var(--color-text-muted)]">Cash Over/Short</p><p className={`font-semibold ${bakeryCashControl.cashOverShort === 0 ? '' : bakeryCashControl.cashOverShort > 0 ? 'text-green-700' : 'text-red-700'}`}>{formatCurrency(bakeryCashControl.cashOverShort)}</p></div>
              </div>
              <label className="text-sm block">
                <span className="block text-[var(--color-text-muted)] mb-1">Handover Notes</span>
                <textarea
                  rows={2}
                  value={bakeryCashDraft.handoverNotes}
                  onChange={(event) => updateCashDraftText('bakery', event.target.value)}
                  disabled={!canEditBakery || isClosed}
                  className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 disabled:bg-gray-100"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => updateHandoverStatusDraft('bakery', 'handed_over')}
                  disabled={!canEditBakery || isClosed}
                  className="rounded border border-[var(--color-border)] px-3 py-1 text-xs font-semibold disabled:opacity-50"
                >
                  Mark Handed Over
                </button>
                <button
                  type="button"
                  onClick={() => updateHandoverStatusDraft('bakery', 'received')}
                  disabled={!canEditBakery || isClosed}
                  className="rounded border border-[var(--color-border)] px-3 py-1 text-xs font-semibold disabled:opacity-50"
                >
                  Mark Received
                </button>
                <p className="text-xs text-[var(--color-text-muted)] self-center">Handover Status: <strong>{bakeryCashDraft.handoverStatus}</strong></p>
              </div>
            </article>

            <article className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
              <header className="mb-3">
                <h3 className="text-lg font-semibold">Settlement Treatment Summary</h3>
                <p className="text-xs text-[var(--color-text-muted)]">Classify completed bakery orders as paid, complimentary, credit, or mixed review.</p>
              </header>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-[var(--color-text-muted)]">Complimentary Value</p><p className="font-semibold">{formatCurrency(bakerySettlementTotals.complimentaryValue)}</p></div>
                <div><p className="text-[var(--color-text-muted)]">Credit Outstanding</p><p className="font-semibold">{formatCurrency(bakerySettlementTotals.creditValue)}</p></div>
                <div><p className="text-[var(--color-text-muted)]">Mixed Review Value</p><p className="font-semibold">{formatCurrency(bakerySettlementTotals.mixedReviewValue)}</p></div>
                <div><p className="text-[var(--color-text-muted)]">Collectible Expected Cash</p><p className="font-semibold">{formatCurrency(bakerySettlementTotals.collectibleExpectedCash)}</p></div>
                <div><p className="text-[var(--color-text-muted)]">Completed Orders</p><p className="font-semibold">{bakeryOrderSummary.completedOrders}</p></div>
                <div><p className="text-[var(--color-text-muted)]">Pending Orders</p><p className="font-semibold">{bakeryOrderSummary.pendingOrders}</p></div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm mt-3">
                <div><p className="text-[var(--color-text-muted)]">Handed Over By</p><p className="font-semibold">{bakeryCashDraft.handedOverBy?.displayName || '—'}</p></div>
                <div><p className="text-[var(--color-text-muted)]">Handed Over At</p><p className="font-semibold">{bakeryCashDraft.handedOverAt ? formatDateTime(bakeryCashDraft.handedOverAt) : '—'}</p></div>
                <div><p className="text-[var(--color-text-muted)]">Received By</p><p className="font-semibold">{bakeryCashDraft.receivedBy?.displayName || '—'}</p></div>
                <div><p className="text-[var(--color-text-muted)]">Received At</p><p className="font-semibold">{bakeryCashDraft.receivedAt ? formatDateTime(bakeryCashDraft.receivedAt) : '—'}</p></div>
              </div>
            </article>
          </section>

          <section className="rounded-2xl border border-[var(--color-border)] bg-white p-4 space-y-2">
            <h3 className="text-lg font-semibold">Bakery Non-Collectible / Exclusions</h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              Mixed bakery+cafe orders are excluded from bakery reconciliation until split allocation is implemented.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><p className="text-[var(--color-text-muted)]">Mixed Unresolved</p><p className="font-semibold">{bakeryOrderSummary.excludedMixedOrders}</p></div>
              <div><p className="text-[var(--color-text-muted)]">Pending Excluded</p><p className="font-semibold">{bakeryOrderSummary.excludedPendingOrders}</p></div>
              <div><p className="text-[var(--color-text-muted)]">Cancelled Excluded</p><p className="font-semibold">{bakeryOrderSummary.excludedCancelledOrders}</p></div>
              <div><p className="text-[var(--color-text-muted)]">Completed Orders</p><p className="font-semibold">{bakeryOrderSummary.completedOrders}</p></div>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--color-border)] bg-white overflow-hidden">
            <header className="px-4 py-3 border-b border-[var(--color-border)]">
              <h3 className="text-lg font-semibold">Bakery Order Accounting Audit</h3>
              <p className="text-xs text-[var(--color-text-muted)]">Update treatment/reason to control collectible cash logic for bakery orders.</p>
            </header>
            <div className="overflow-x-auto">
              <table className="min-w-[1250px] w-full text-sm">
                <thead className="bg-[var(--color-bg-secondary)] text-left">
                  <tr>
                    <th className="px-3 py-2">Order ID</th>
                    <th className="px-3 py-2">Date/Time</th>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Service Area</th>
                    <th className="px-3 py-2">Service Mode</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Total</th>
                    <th className="px-3 py-2">Treatment</th>
                    <th className="px-3 py-2">Collectible?</th>
                    <th className="px-3 py-2">Action</th>
                    <th className="px-3 py-2">Exclusion Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {bakeryDisplayAuditRows.length === 0 && (
                    <tr><td colSpan={10} className="px-3 py-6 text-center text-[var(--color-text-muted)]">No bakery-mode orders found for this date.</td></tr>
                  )}
                  {bakeryDisplayAuditRows.map((row) => (
                    <tr key={`bakery-${row.orderId}`} className="border-t border-[var(--color-border)]">
                      <td className="px-3 py-2 font-medium">{row.orderId}</td>
                      <td className="px-3 py-2">{row.date ? formatDateTime(row.date) : 'Unknown'}</td>
                      <td className="px-3 py-2">{row.customerName || 'Walk-in'}</td>
                      <td className="px-3 py-2 uppercase text-xs">{row.serviceArea}</td>
                      <td className="px-3 py-2">{row.serviceMode}</td>
                      <td className="px-3 py-2">{row.status}</td>
                      <td className="px-3 py-2">{formatCurrency(row.total)}</td>
                      <td className="px-3 py-2 capitalize">{row.treatment.replace('_', ' ')}</td>
                      <td className={`px-3 py-2 font-semibold ${row.includedInCollectibleCash ? 'text-green-700' : 'text-[var(--color-text-muted)]'}`}>
                        {row.includedInCollectibleCash ? 'Yes' : 'No'}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setSelectedAccountingOrderId(row.orderId)}
                          disabled={row.serviceArea !== 'bakery'}
                          className="rounded border border-[var(--color-border)] px-2 py-1 text-xs font-semibold disabled:opacity-50"
                        >
                          Edit Treatment
                        </button>
                      </td>
                      <td className="px-3 py-2 text-[var(--color-text-muted)]">{row.exclusionReason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {renderAccountingEditorPanel('bakery', bakeryDisplayAuditRows)}

          <section className="rounded-2xl border border-[var(--color-border)] bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full text-sm">
                <thead className="bg-[var(--color-bg-secondary)] text-left">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2">Opening</th>
                    <th className="px-3 py-2">Unit Price</th>
                    <th className="px-3 py-2">Received</th>
                    <th className="px-3 py-2">Sold</th>
                    <th className="px-3 py-2">Expected Sales Value</th>
                    <th className="px-3 py-2">Waste</th>
                    <th className="px-3 py-2">Adjustment</th>
                    <th className="px-3 py-2">Expected</th>
                    <th className="px-3 py-2">Closing Actual</th>
                    <th className="px-3 py-2">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr><td colSpan={12} className="px-3 py-6 text-center text-[var(--color-text-muted)]">Loading bakery reconciliation data...</td></tr>
                  )}
                  {!loading && workingLines.length === 0 && (
                    <tr><td colSpan={12} className="px-3 py-6 text-center text-[var(--color-text-muted)]">No active bakery SKUs found.</td></tr>
                  )}
                  {!loading && workingLines.map((line) => (
                    <tr key={line.sku} className="border-t border-[var(--color-border)]">
                      <td className="px-3 py-2 font-medium">{line.itemName}</td>
                      <td className="px-3 py-2 text-xs text-[var(--color-text-muted)]">{line.sku}</td>
                      <td className="px-3 py-2">{line.openingStock}</td>
                      <td className="px-3 py-2">{formatCurrency(line.unitPrice)}</td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          value={draftBySku[line.sku]?.receivedStock ?? 0}
                          onChange={(event) => updateDraftField(line.sku, 'receivedStock', event.target.value)}
                          disabled={!canEditBakery || isClosed}
                          className="w-24 rounded border border-[var(--color-border)] px-2 py-1 disabled:bg-gray-100"
                        />
                      </td>
                      <td className="px-3 py-2">{line.soldStock}</td>
                      <td className="px-3 py-2 font-semibold">{formatCurrency(line.expectedSalesValue)}</td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          value={draftBySku[line.sku]?.waste ?? 0}
                          onChange={(event) => updateDraftField(line.sku, 'waste', event.target.value)}
                          disabled={!canEditBakery || isClosed}
                          className="w-24 rounded border border-[var(--color-border)] px-2 py-1 disabled:bg-gray-100"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          value={draftBySku[line.sku]?.adjustment ?? 0}
                          onChange={(event) => updateDraftField(line.sku, 'adjustment', event.target.value)}
                          disabled={!canEditBakery || isClosed}
                          className="w-24 rounded border border-[var(--color-border)] px-2 py-1 disabled:bg-gray-100"
                        />
                      </td>
                      <td className="px-3 py-2 font-semibold">{line.closingExpected}</td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          value={draftBySku[line.sku]?.closingActualInput ?? ''}
                          onChange={(event) => updateDraftField(line.sku, 'closingActualInput', event.target.value)}
                          disabled={!canEditBakery || isClosed}
                          className="w-24 rounded border border-[var(--color-border)] px-2 py-1 disabled:bg-gray-100"
                        />
                      </td>
                      <td className={`px-3 py-2 font-semibold ${(line.variance || 0) === 0 ? 'text-[var(--color-text)]' : (line.variance || 0) > 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {typeof line.variance === 'number' ? line.variance : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-[var(--color-bg-secondary)] font-semibold">
                  <tr>
                    <td className="px-3 py-2">Totals</td>
                    <td className="px-3 py-2">—</td>
                    <td className="px-3 py-2">{totals.openingStock}</td>
                    <td className="px-3 py-2">—</td>
                    <td className="px-3 py-2">{totals.receivedStock}</td>
                    <td className="px-3 py-2">{totals.soldStock}</td>
                    <td className="px-3 py-2">{formatCurrency(totals.expectedSalesValue)}</td>
                    <td className="px-3 py-2">{totals.waste}</td>
                    <td className="px-3 py-2">{totals.adjustment}</td>
                    <td className="px-3 py-2">{totals.closingExpected}</td>
                    <td className="px-3 py-2">{totals.closingActual}</td>
                    <td className={totals.variance === 0 ? 'px-3 py-2' : totals.variance > 0 ? 'px-3 py-2 text-green-700' : 'px-3 py-2 text-red-700'}>
                      {totals.variance}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <section className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleOpenDay}
              disabled={!canEditBakery || busy || !!reconciliation || workingLines.length === 0}
              className="rounded-xl bg-[var(--color-primary)] text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin inline" /> : null} Open Day
            </button>
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={!canEditBakery || busy || isClosed || workingLines.length === 0}
              className="rounded-xl border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              <Save className="w-4 h-4 inline mr-1" /> Save Draft
            </button>
            <button
              type="button"
              onClick={handleCloseDay}
              disabled={!canEditBakery || busy || isClosed || workingLines.length === 0}
              className="rounded-xl bg-emerald-600 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              <ClipboardCheck className="w-4 h-4 inline mr-1" /> Close Day
            </button>
          </section>
        </>
      ) : (
        <>
          <section className="grid grid-cols-2 xl:grid-cols-6 gap-3">
            <article className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Collectible Expected Cash</p>
              <p className="mt-1 text-2xl font-semibold">{formatCurrency(cafeTotals.collectibleExpectedCash)}</p>
            </article>
            <article className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Total Received</p>
              <p className="mt-1 text-2xl font-semibold">{formatCurrency(cafeTotals.totalReceived)}</p>
            </article>
            <article className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Variance</p>
              <p className={`mt-1 text-2xl font-semibold ${cafeTotals.variance === 0 ? '' : cafeTotals.variance > 0 ? 'text-green-700' : 'text-red-700'}`}>
                {formatCurrency(cafeTotals.variance)}
              </p>
            </article>
            <article className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Gross Completed Sales</p>
              <p className="mt-1 text-2xl font-semibold">{formatCurrency(cafeTotals.grossCompletedSales)}</p>
            </article>
            <article className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Credit Outstanding</p>
              <p className="mt-1 text-2xl font-semibold">{formatCurrency(cafeTotals.creditValue)}</p>
            </article>
            <article className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Complimentary Value</p>
              <p className="mt-1 text-2xl font-semibold">{formatCurrency(cafeTotals.complimentaryValue)}</p>
            </article>
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <article className="rounded-2xl border border-[var(--color-border)] bg-white p-4 space-y-4">
              <header>
                <h3 className="text-lg font-semibold">Payment Entry</h3>
                <p className="text-xs text-[var(--color-text-muted)]">Enter actual receipts captured for this business date.</p>
              </header>
              {cafeReconciliation && !cafeReconciliation.cashControl && (
                <p className="text-xs text-amber-700">Legacy record: cash-control fields were not captured on this historical day.</p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-sm">
                  <span className="block text-[var(--color-text-muted)] mb-1">Cash Received</span>
                  <input
                    type="number"
                    min={0}
                    value={cafeDraft.cashReceived}
                    onChange={(event) => updateCafeDraftNumber('cashReceived', event.target.value)}
                    disabled={!canEditCafe || cafeStatusClosed}
                    className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 disabled:bg-gray-100"
                  />
                </label>
                <label className="text-sm">
                  <span className="block text-[var(--color-text-muted)] mb-1">Mobile Money</span>
                  <input
                    type="number"
                    min={0}
                    value={cafeDraft.mobileMoneyReceived}
                    onChange={(event) => updateCafeDraftNumber('mobileMoneyReceived', event.target.value)}
                    disabled={!canEditCafe || cafeStatusClosed}
                    className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 disabled:bg-gray-100"
                  />
                </label>
                <label className="text-sm">
                  <span className="block text-[var(--color-text-muted)] mb-1">Bank / Transfer</span>
                  <input
                    type="number"
                    min={0}
                    value={cafeDraft.bankReceived}
                    onChange={(event) => updateCafeDraftNumber('bankReceived', event.target.value)}
                    disabled={!canEditCafe || cafeStatusClosed}
                    className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 disabled:bg-gray-100"
                  />
                </label>
                <label className="text-sm">
                  <span className="block text-[var(--color-text-muted)] mb-1">Other</span>
                  <input
                    type="number"
                    min={0}
                    value={cafeDraft.otherReceived}
                    onChange={(event) => updateCafeDraftNumber('otherReceived', event.target.value)}
                    disabled={!canEditCafe || cafeStatusClosed}
                    className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 disabled:bg-gray-100"
                  />
                </label>
              </div>
              <label className="text-sm block">
                <span className="block text-[var(--color-text-muted)] mb-1">Notes</span>
                <textarea
                  rows={3}
                  value={cafeDraft.notes}
                  onChange={(event) => setCafeDraft((prev) => ({ ...prev, notes: event.target.value }))}
                  disabled={!canEditCafe || cafeStatusClosed}
                  className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 disabled:bg-gray-100"
                />
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="text-sm">
                  <span className="block text-[var(--color-text-muted)] mb-1">Opening Cash Float</span>
                  <input
                    type="number"
                    min={0}
                    value={cafeCashDraft.openingCashFloat}
                    onChange={(event) => updateCashDraftNumber('cafe', 'openingCashFloat', event.target.value)}
                    disabled={!canEditCafe || cafeStatusClosed}
                    className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 disabled:bg-gray-100"
                  />
                </label>
                <label className="text-sm">
                  <span className="block text-[var(--color-text-muted)] mb-1">Cash Removed</span>
                  <input
                    type="number"
                    min={0}
                    value={cafeCashDraft.cashRemoved}
                    onChange={(event) => updateCashDraftNumber('cafe', 'cashRemoved', event.target.value)}
                    disabled={!canEditCafe || cafeStatusClosed}
                    className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 disabled:bg-gray-100"
                  />
                </label>
                <label className="text-sm">
                  <span className="block text-[var(--color-text-muted)] mb-1">Actual Counted Cash</span>
                  <input
                    type="number"
                    min={0}
                    value={cafeCashDraft.actualCountedCash}
                    onChange={(event) => updateCashDraftNumber('cafe', 'actualCountedCash', event.target.value)}
                    disabled={!canEditCafe || cafeStatusClosed}
                    className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 disabled:bg-gray-100"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-[var(--color-text-muted)]">Expected Drawer Cash</p><p className="font-semibold">{formatCurrency(cafeCashControl.expectedDrawerCash)}</p></div>
                <div><p className="text-[var(--color-text-muted)]">Cash Over/Short</p><p className={`font-semibold ${cafeCashControl.cashOverShort === 0 ? '' : cafeCashControl.cashOverShort > 0 ? 'text-green-700' : 'text-red-700'}`}>{formatCurrency(cafeCashControl.cashOverShort)}</p></div>
              </div>
              <label className="text-sm block">
                <span className="block text-[var(--color-text-muted)] mb-1">Handover Notes</span>
                <textarea
                  rows={2}
                  value={cafeCashDraft.handoverNotes}
                  onChange={(event) => updateCashDraftText('cafe', event.target.value)}
                  disabled={!canEditCafe || cafeStatusClosed}
                  className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 disabled:bg-gray-100"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => updateHandoverStatusDraft('cafe', 'handed_over')}
                  disabled={!canEditCafe || cafeStatusClosed}
                  className="rounded border border-[var(--color-border)] px-3 py-1 text-xs font-semibold disabled:opacity-50"
                >
                  Mark Handed Over
                </button>
                <button
                  type="button"
                  onClick={() => updateHandoverStatusDraft('cafe', 'received')}
                  disabled={!canEditCafe || cafeStatusClosed}
                  className="rounded border border-[var(--color-border)] px-3 py-1 text-xs font-semibold disabled:opacity-50"
                >
                  Mark Received
                </button>
                <p className="text-xs text-[var(--color-text-muted)] self-center">Handover Status: <strong>{cafeCashDraft.handoverStatus}</strong></p>
              </div>
            </article>

            <article className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
              <header className="mb-3">
                <h3 className="text-lg font-semibold">Settlement / Treatment Summary</h3>
                <p className="text-xs text-[var(--color-text-muted)]">Use treatment classifications to convert gross sales into collectible expected cash.</p>
              </header>
              <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                <div><p className="text-[var(--color-text-muted)]">Status</p><p className="font-semibold">{cafeReconciliation?.status || 'not_opened'}</p></div>
                <div><p className="text-[var(--color-text-muted)]">Last Updated</p><p className="font-semibold">{cafeReconciliation ? formatDateTime(cafeReconciliation.updatedAt) : 'Not yet'}</p></div>
                <div><p className="text-[var(--color-text-muted)]">Cancelled</p><p className="font-semibold">{cafeTotals.cancelledOrders}</p></div>
                <div><p className="text-[var(--color-text-muted)]">Pending</p><p className="font-semibold">{cafeTotals.pendingOrders}</p></div>
                <div><p className="text-[var(--color-text-muted)]">Completed</p><p className="font-semibold">{cafeTotals.completedOrders}</p></div>
                <div><p className="text-[var(--color-text-muted)]">Total Orders</p><p className="font-semibold">{cafeTotals.totalOrders}</p></div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                <div><p className="text-[var(--color-text-muted)]">Gross Completed Sales</p><p className="font-semibold">{formatCurrency(cafeTotals.grossCompletedSales)}</p></div>
                <div><p className="text-[var(--color-text-muted)]">Complimentary Value</p><p className="font-semibold">{formatCurrency(cafeTotals.complimentaryValue)}</p></div>
                <div><p className="text-[var(--color-text-muted)]">Credit Outstanding</p><p className="font-semibold">{formatCurrency(cafeTotals.creditValue)}</p></div>
                <div><p className="text-[var(--color-text-muted)]">Mixed Review Value</p><p className="font-semibold">{formatCurrency(cafeTotals.mixedReviewValue)}</p></div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm mt-3">
                <div><p className="text-[var(--color-text-muted)]">Handed Over By</p><p className="font-semibold">{cafeCashDraft.handedOverBy?.displayName || '—'}</p></div>
                <div><p className="text-[var(--color-text-muted)]">Handed Over At</p><p className="font-semibold">{cafeCashDraft.handedOverAt ? formatDateTime(cafeCashDraft.handedOverAt) : '—'}</p></div>
                <div><p className="text-[var(--color-text-muted)]">Received By</p><p className="font-semibold">{cafeCashDraft.receivedBy?.displayName || '—'}</p></div>
                <div><p className="text-[var(--color-text-muted)]">Received At</p><p className="font-semibold">{cafeCashDraft.receivedAt ? formatDateTime(cafeCashDraft.receivedAt) : '—'}</p></div>
              </div>

            </article>
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <article className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
              <header className="mb-3">
                <h3 className="text-lg font-semibold">Service Mode Breakdown</h3>
              </header>
              <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
                <table className="min-w-[520px] w-full text-sm">
                  <thead className="bg-[var(--color-bg-secondary)] text-left">
                    <tr>
                      <th className="px-3 py-2">Service Mode</th>
                      <th className="px-3 py-2">Count</th>
                      <th className="px-3 py-2">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-[var(--color-border)]">
                      <td className="px-3 py-2 font-medium">Dine-in</td>
                      <td className="px-3 py-2">{cafeTotals.dineInOrders}</td>
                      <td className="px-3 py-2">{formatCurrency(cafeTotals.dineInValue)}</td>
                    </tr>
                    <tr className="border-t border-[var(--color-border)]">
                      <td className="px-3 py-2 font-medium">Pickup</td>
                      <td className="px-3 py-2">{cafeTotals.pickupOrders}</td>
                      <td className="px-3 py-2">{formatCurrency(cafeTotals.pickupValue)}</td>
                    </tr>
                    <tr className="border-t border-[var(--color-border)]">
                      <td className="px-3 py-2 font-medium">Delivery</td>
                      <td className="px-3 py-2">{cafeTotals.deliveryOrders}</td>
                      <td className="px-3 py-2">{formatCurrency(cafeTotals.deliveryValue)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </article>

            <article className="rounded-2xl border border-[var(--color-border)] bg-white p-4 space-y-2">
              <h3 className="text-lg font-semibold">Non-Collectible / Exclusions</h3>
              <p className="text-xs text-[var(--color-text-muted)]">
                Mixed bakery+cafe orders are excluded from cafe reconciliation until split allocation is implemented.
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-[var(--color-text-muted)]">Mixed Unresolved</p><p className="font-semibold">{cafeTotals.excludedMixedOrders}</p></div>
                <div><p className="text-[var(--color-text-muted)]">Pending Excluded</p><p className="font-semibold">{cafeTotals.excludedPendingOrders}</p></div>
                <div><p className="text-[var(--color-text-muted)]">Cancelled Excluded</p><p className="font-semibold">{cafeTotals.excludedCancelledOrders}</p></div>
                <div><p className="text-[var(--color-text-muted)]">Completed Orders</p><p className="font-semibold">{cafeTotals.completedOrders}</p></div>
              </div>
            </article>
          </section>

          <section className="rounded-2xl border border-[var(--color-border)] bg-white overflow-hidden">
            <header className="px-4 py-3 border-b border-[var(--color-border)]">
              <h3 className="text-lg font-semibold">Included-Order Audit</h3>
              <p className="text-xs text-[var(--color-text-muted)]">Shows exactly which orders are collectible today and which are excluded by treatment or status.</p>
            </header>
            <div className="overflow-x-auto">
              <table className="min-w-[1250px] w-full text-sm">
                <thead className="bg-[var(--color-bg-secondary)] text-left">
                  <tr>
                    <th className="px-3 py-2">Order ID</th>
                    <th className="px-3 py-2">Date/Time</th>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Service Area</th>
                    <th className="px-3 py-2">Service Mode</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Total</th>
                    <th className="px-3 py-2">Treatment</th>
                    <th className="px-3 py-2">Collectible?</th>
                    <th className="px-3 py-2">Action</th>
                    <th className="px-3 py-2">Exclusion Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {cafeDisplayAuditRows.length === 0 && (
                    <tr><td colSpan={10} className="px-3 py-6 text-center text-[var(--color-text-muted)]">No orders found for this business date.</td></tr>
                  )}
                  {cafeDisplayAuditRows.map((row) => (
                    <tr key={row.orderId} className="border-t border-[var(--color-border)]">
                      <td className="px-3 py-2 font-medium">{row.orderId}</td>
                      <td className="px-3 py-2">{row.date ? formatDateTime(row.date) : 'Unknown'}</td>
                      <td className="px-3 py-2">{row.customerName || 'Walk-in'}</td>
                      <td className="px-3 py-2 uppercase text-xs">{row.serviceArea}</td>
                      <td className="px-3 py-2">{row.serviceMode}</td>
                      <td className="px-3 py-2">{row.status}</td>
                      <td className="px-3 py-2">{formatCurrency(row.total)}</td>
                      <td className="px-3 py-2 capitalize">{row.treatment.replace('_', ' ')}</td>
                      <td className={`px-3 py-2 font-semibold ${row.includedInCollectibleCash ? 'text-green-700' : 'text-[var(--color-text-muted)]'}`}>
                        {row.includedInCollectibleCash ? 'Yes' : 'No'}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setSelectedAccountingOrderId(row.orderId)}
                          disabled={row.serviceArea !== 'cafe'}
                          className="rounded border border-[var(--color-border)] px-2 py-1 text-xs font-semibold disabled:opacity-50"
                        >
                          Edit Treatment
                        </button>
                      </td>
                      <td className="px-3 py-2 text-[var(--color-text-muted)]">{row.exclusionReason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {renderAccountingEditorPanel('cafe', cafeDisplayAuditRows)}

          <section className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleOpenCafeDay}
              disabled={!canEditCafe || busy || !!cafeReconciliation}
              className="rounded-xl bg-[var(--color-primary)] text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin inline" /> : null} Open Day
            </button>
            <button
              type="button"
              onClick={handleSaveCafeDraft}
              disabled={!canEditCafe || busy || cafeStatusClosed}
              className="rounded-xl border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              <Save className="w-4 h-4 inline mr-1" /> Save Draft
            </button>
            <button
              type="button"
              onClick={handleCloseCafeDay}
              disabled={!canEditCafe || busy || cafeStatusClosed}
              className="rounded-xl bg-emerald-600 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              <ClipboardCheck className="w-4 h-4 inline mr-1" /> Close Day
            </button>
          </section>
        </>
      )}
    </div>
  );
};
