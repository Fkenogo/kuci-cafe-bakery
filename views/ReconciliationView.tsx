import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, ClipboardCheck, Loader2, Save } from 'lucide-react';
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
  aggregateCapturedPayments,
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
    ...(record.lastUpdatedAt ? { lastUpdatedAt: record.lastUpdatedAt } : {}),
    ...(record.closedBy ? { closedBy: record.closedBy as BakeryDailyReconciliation['closedBy'] } : {}),
    ...(record.closedAt ? { closedAt: record.closedAt } : {}),
    ...(record.reopenedBy ? { reopenedBy: record.reopenedBy as BakeryDailyReconciliation['reopenedBy'] } : {}),
    ...(record.reopenedAt ? { reopenedAt: record.reopenedAt } : {}),
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
    ...(record.lastUpdatedAt ? { lastUpdatedAt: record.lastUpdatedAt } : {}),
    ...(record.closedBy ? { closedBy: record.closedBy as CafeDailyReconciliation['closedBy'] } : {}),
    ...(record.closedAt ? { closedAt: record.closedAt } : {}),
    ...(record.reopenedBy ? { reopenedBy: record.reopenedBy as CafeDailyReconciliation['reopenedBy'] } : {}),
    ...(record.reopenedAt ? { reopenedAt: record.reopenedAt } : {}),
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
    paymentStatus:
      record.paymentStatus === 'paid' || record.paymentStatus === 'complimentary' || record.paymentStatus === 'credit'
        ? record.paymentStatus
        : 'pending',
    ...(record.payment && typeof record.payment === 'object'
      ? {
          payment: {
            method:
              (record.payment as Record<string, unknown>).method === 'cash' ||
              (record.payment as Record<string, unknown>).method === 'mobile_money' ||
              (record.payment as Record<string, unknown>).method === 'bank_transfer' ||
              (record.payment as Record<string, unknown>).method === 'other'
                ? ((record.payment as Record<string, unknown>).method as 'cash' | 'mobile_money' | 'bank_transfer' | 'other')
                : null,
            amountReceived:
              typeof (record.payment as Record<string, unknown>).amountReceived === 'number'
                ? Math.max(0, (record.payment as Record<string, unknown>).amountReceived as number)
                : 0,
            currency:
              typeof (record.payment as Record<string, unknown>).currency === 'string'
                ? ((record.payment as Record<string, unknown>).currency as string)
                : 'RWF',
            isComplimentary: (record.payment as Record<string, unknown>).isComplimentary === true,
            isCredit: (record.payment as Record<string, unknown>).isCredit === true,
            recordedBy:
              (record.payment as Record<string, unknown>).recordedBy &&
              typeof (record.payment as Record<string, unknown>).recordedBy === 'object'
                ? ((record.payment as Record<string, unknown>).recordedBy as PersistedOrder['accountingUpdatedBy'])
                : null,
            recordedAt: (record.payment as Record<string, unknown>).recordedAt || null,
          },
        }
      : {}),
    ...(record.financialStatus === 'unpaid' || record.financialStatus === 'paid' || record.financialStatus === 'complimentary' || record.financialStatus === 'credit'
      ? { financialStatus: record.financialStatus }
      : {}),
    ...(record.receipt && typeof record.receipt === 'object'
      ? {
          receipt: {
            receiptNumber:
              typeof (record.receipt as Record<string, unknown>).receiptNumber === 'string'
                ? (record.receipt as Record<string, unknown>).receiptNumber as string
                : '',
            generatedAt: (record.receipt as Record<string, unknown>).generatedAt || null,
            visibleToCustomer: (record.receipt as Record<string, unknown>).visibleToCustomer === true,
          },
        }
      : {}),
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
  const [cafeItemSearch, setCafeItemSearch] = useState('');
  const [cafeItemServiceModeFilter, setCafeItemServiceModeFilter] = useState<'all' | 'pickup' | 'dine_in' | 'delivery'>('all');
  const [cafeItemPaymentFilter, setCafeItemPaymentFilter] = useState<'all' | 'cash' | 'mobile_money' | 'pay_later'>('all');
  const businessDateLabel = formatBusinessDateDisplay(businessDate);

  const isAdminReconciliationManager = currentUser?.role === 'admin';
  const canEditBakery = isAdminReconciliationManager || currentUser?.role === 'bakery_account_reconciliation';
  const canEditCafe = isAdminReconciliationManager || currentUser?.role === 'cafe_account_reconciliation';
  const canEditBakeryAccounting = currentUser?.role === 'admin' || currentUser?.role === 'bakery_account_reconciliation';
  const canEditCafeAccounting = currentUser?.role === 'admin' || currentUser?.role === 'cafe_account_reconciliation';
  const canManageBakeryLifecycle = isAdminReconciliationManager;
  const canManageCafeLifecycle = isAdminReconciliationManager;
  const canReadBakeryInventory = isAdminReconciliationManager || currentUser?.role === 'bakery_account_reconciliation';
  const availableModes = useMemo(() => {
    const next: Array<'bakery' | 'cafe'> = [];
    if (currentUser?.role === 'admin' || currentUser?.role === 'bakery_account_reconciliation') next.push('bakery');
    if (currentUser?.role === 'admin' || currentUser?.role === 'cafe_account_reconciliation') next.push('cafe');
    if (next.length === 0) {
      next.push('cafe');
    }
    return next;
  }, [currentUser?.role]);
  const actor = useMemo(
    () =>
      currentUser && currentUser.role !== 'user'
        ? { uid: currentUser.uid, displayName: currentUser.displayName, role: currentUser.role }
        : null,
    [currentUser]
  );

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

    const unsubItems = canReadBakeryInventory
      ? onSnapshot(
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
        )
      : () => {
          setBakeryItems([]);
          setLoading(false);
        };

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

    const unsubSnapshots = canReadBakeryInventory
      ? onSnapshot(
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
        )
      : () => {
          setSnapshots([]);
        };

    return () => {
      unsubItems();
      unsubOrders();
      unsubSnapshots();
    };
  }, [isAllowed, canReadBakeryInventory]);

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
  const bakeryCapturedPayments = useMemo(
    () => aggregateCapturedPayments(orders, businessDate, 'bakery'),
    [orders, businessDate]
  );
  const cafeCapturedPayments = useMemo(
    () => aggregateCapturedPayments(orders, businessDate, 'cafe'),
    [orders, businessDate]
  );

  const bakerySettlementTotals = useMemo(
    () =>
      computeSettlementTotals(bakeryOrderSummary, bakeryCapturedPayments),
    [bakeryOrderSummary, bakeryCapturedPayments]
  );
  const bakeryCashControl = useMemo(
    () => computeCashControl(bakerySettlementTotals, bakeryCashDraft),
    [bakerySettlementTotals, bakeryCashDraft]
  );

  const cafeTotals = useMemo(
    () =>
      buildCafeTotals(cafeOrderMetrics, cafeCapturedPayments),
    [cafeOrderMetrics, cafeCapturedPayments]
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

  // Cafe item-level sales: flatten completed cafe order items for the item ledger view
  const cafeItemSalesRows = useMemo(() => {
    type ItemSaleRow = {
      itemName: string;
      orderId: string;
      quantity: number;
      lineTotal: number;
      serviceMode: string;
      paymentChoice: string;
      completedAt: Date | null;
    };
    const rows: ItemSaleRow[] = [];
    orders.forEach((order) => {
      if (resolveOrderBusinessDate(order) !== businessDate) return;
      if (order.status !== 'completed') return;
      if (order.serviceArea !== 'cafe') return;
      if (order.accountingTreatment === 'cancelled') return;
      const completedAt = timestampToDate(order.updatedAt);
      (order.items || []).forEach((item) => {
        rows.push({
          itemName: item.itemName,
          orderId: order.id || '',
          quantity: item.quantity,
          lineTotal: item.lineTotal,
          serviceMode: order.serviceMode,
          paymentChoice: order.checkoutPaymentChoice || 'cash',
          completedAt,
        });
      });
    });
    return rows;
  }, [orders, businessDate]);

  const cafeItemSalesFiltered = useMemo(() => {
    let next = cafeItemSalesRows;
    const term = cafeItemSearch.trim().toLowerCase();
    if (term) {
      next = next.filter((r) => r.itemName.toLowerCase().includes(term) || r.orderId.toLowerCase().includes(term));
    }
    if (cafeItemServiceModeFilter !== 'all') {
      next = next.filter((r) => r.serviceMode === cafeItemServiceModeFilter);
    }
    if (cafeItemPaymentFilter !== 'all') {
      next = next.filter((r) => r.paymentChoice === cafeItemPaymentFilter);
    }
    return next;
  }, [cafeItemSalesRows, cafeItemSearch, cafeItemServiceModeFilter, cafeItemPaymentFilter]);

  const cafeItemSalesSummary = useMemo(() => {
    const map = new Map<string, { qtySold: number; grossValue: number; orderIds: Set<string> }>();
    cafeItemSalesFiltered.forEach((row) => {
      const entry = map.get(row.itemName);
      if (entry) {
        entry.qtySold += row.quantity;
        entry.grossValue += row.lineTotal;
        entry.orderIds.add(row.orderId);
      } else {
        map.set(row.itemName, { qtySold: row.quantity, grossValue: row.lineTotal, orderIds: new Set([row.orderId]) });
      }
    });
    return Array.from(map.entries())
      .map(([itemName, data]) => ({
        itemName,
        qtySold: data.qtySold,
        grossValue: data.grossValue,
        orderCount: data.orderIds.size,
      }))
      .sort((a, b) => b.grossValue - a.grossValue);
  }, [cafeItemSalesFiltered]);

  useEffect(() => {
    if (!cafeReconciliation) {
      setCafeDraft({
        cashReceived: cafeCapturedPayments.cashReceived,
        mobileMoneyReceived: cafeCapturedPayments.mobileMoneyReceived,
        bankReceived: cafeCapturedPayments.bankReceived,
        otherReceived: cafeCapturedPayments.otherReceived,
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
      cashReceived: cafeCapturedPayments.cashReceived,
      mobileMoneyReceived: cafeCapturedPayments.mobileMoneyReceived,
      bankReceived: cafeCapturedPayments.bankReceived,
      otherReceived: cafeCapturedPayments.otherReceived,
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
  }, [cafeReconciliation, businessDate, cafeCapturedPayments]);

  useEffect(() => {
    if (!reconciliation?.settlement) {
      setBakerySettlementDraft({
        cashReceived: bakeryCapturedPayments.cashReceived,
        mobileMoneyReceived: bakeryCapturedPayments.mobileMoneyReceived,
        bankReceived: bakeryCapturedPayments.bankReceived,
        otherReceived: bakeryCapturedPayments.otherReceived,
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
      cashReceived: bakeryCapturedPayments.cashReceived,
      mobileMoneyReceived: bakeryCapturedPayments.mobileMoneyReceived,
      bankReceived: bakeryCapturedPayments.bankReceived,
      otherReceived: bakeryCapturedPayments.otherReceived,
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
  }, [reconciliation, businessDate, bakeryCapturedPayments]);

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
    if (!canManageBakeryLifecycle || busy || isClosed || reconciliation) return;
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
        lastUpdatedAt: serverTimestamp(),
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
        lastUpdatedAt: serverTimestamp(),
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
    if (!canManageBakeryLifecycle || busy || isClosed) return;
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
        lastUpdatedAt: now,
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

  const handleReopenDay = async () => {
    if (!canManageBakeryLifecycle || busy || !isClosed || !reconciliation) return;
    const confirmReopen = typeof window === 'undefined'
      ? false
      : window.confirm(`Reopen bakery reconciliation for ${businessDateLabel}? This will move status back to open.`);
    if (!confirmReopen) return;

    setBusy(true);
    setError(null);
    setNotice(null);
    setWriteSummary(null);
    try {
      await setDoc(doc(db, 'bakeryDailyReconciliation', businessDate), sanitizeWritePayload({
        status: 'open',
        updatedAt: serverTimestamp(),
        lastUpdatedAt: serverTimestamp(),
        ...(actor ? { lastUpdatedBy: actor, reopenedBy: actor } : {}),
        reopenedAt: serverTimestamp(),
      }), { merge: true });
      setNotice(`Reopened bakery reconciliation for ${businessDateLabel}.`);
      setWriteSummary({
        reconciliationDocId: businessDate,
        collection: 'bakeryDailyReconciliation',
        ledgerEntriesWritten: 0,
        snapshotsWritten: 0,
        action: 'save',
      });
    } catch (reopenError) {
      setError(reopenError instanceof Error ? reopenError.message : 'Could not reopen bakery reconciliation day.');
    } finally {
      setBusy(false);
    }
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
    const targetClosed = targetMode === 'bakery' ? isClosed : cafeStatusClosed;
    const canEditClosed = currentUser?.role === 'admin';
    if (!canEdit || !orderId) return;
    if (targetClosed && !canEditClosed) {
      setError('Closed reconciliation is read-only for accountant roles.');
      return;
    }
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
    if (!canManageCafeLifecycle || busy || cafeStatusClosed || cafeReconciliation) return;
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
        lastUpdatedAt: serverTimestamp(),
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
        lastUpdatedAt: serverTimestamp(),
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
    if (!canManageCafeLifecycle || busy || cafeStatusClosed) return;
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
        lastUpdatedAt: serverTimestamp(),
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

  const handleReopenCafeDay = async () => {
    if (!canManageCafeLifecycle || busy || !cafeStatusClosed || !cafeReconciliation) return;
    const confirmReopen = typeof window === 'undefined'
      ? false
      : window.confirm(`Reopen cafe reconciliation for ${businessDateLabel}? This will move status back to open.`);
    if (!confirmReopen) return;

    setBusy(true);
    setError(null);
    setNotice(null);
    setWriteSummary(null);
    try {
      await setDoc(doc(db, 'cafeDailyReconciliation', businessDate), sanitizeWritePayload({
        status: 'open',
        updatedAt: serverTimestamp(),
        lastUpdatedAt: serverTimestamp(),
        ...(actor ? { lastUpdatedBy: actor, reopenedBy: actor } : {}),
        reopenedAt: serverTimestamp(),
      }), { merge: true });
      setNotice(`Reopened cafe reconciliation for ${businessDateLabel}.`);
      setWriteSummary({
        reconciliationDocId: businessDate,
        collection: 'cafeDailyReconciliation',
        ledgerEntriesWritten: 0,
        snapshotsWritten: 0,
        action: 'save',
      });
    } catch (reopenError) {
      setError(reopenError instanceof Error ? reopenError.message : 'Could not reopen cafe reconciliation day.');
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
        <section className="rounded-[20px] border border-dashed border-[var(--color-border)] bg-[var(--color-bg-secondary)]/30 px-5 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-[var(--color-bg-secondary)] flex items-center justify-center shrink-0">
            <Save className="w-4 h-4 text-[var(--color-text-muted)]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">Order Treatment Editor</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Select an order row above and click <strong>Edit</strong> to classify its settlement treatment.</p>
          </div>
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
      <section className="rounded-[24px] border-2 border-[var(--color-primary)] bg-[var(--color-primary)]/5 p-5 space-y-4 animate-in zoom-in-95 duration-300">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-serif">Treatment Editor</h3>
            <p className="text-xs font-semibold text-[var(--color-primary)] mt-0.5">
              Order {row.orderId} · {row.customerName || 'Walk-in'} · {formatCurrency(row.total)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSelectedAccountingOrderId(null)}
            className="rounded-full border border-[var(--color-border)] bg-white px-4 py-1.5 text-xs font-bold hover:bg-[var(--color-bg-secondary)] transition-colors"
          >
            Close
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="space-y-1.5">
            <span className="block text-xs font-semibold text-[var(--color-text-muted)]">Treatment</span>
            <select
              value={draft.treatment}
              onChange={(event) => updateAccountingDraft(row.orderId, 'treatment', event.target.value)}
              disabled={!canEdit || accountingBusyOrderId === row.orderId}
              className="w-full rounded-[16px] border-2 border-[var(--color-border)] bg-white focus:border-[var(--color-primary)] focus:outline-none px-4 py-3 text-sm font-semibold text-[var(--color-text)] transition-all disabled:opacity-50"
            >
              {ACCOUNTING_TREATMENT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="block text-xs font-semibold text-[var(--color-text-muted)]">Reason Code</span>
            <select
              value={draft.reasonCode}
              onChange={(event) => updateAccountingDraft(row.orderId, 'reasonCode', event.target.value)}
              disabled={!canEdit || accountingBusyOrderId === row.orderId}
              className="w-full rounded-[16px] border-2 border-[var(--color-border)] bg-white focus:border-[var(--color-primary)] focus:outline-none px-4 py-3 text-sm font-semibold text-[var(--color-text)] transition-all disabled:opacity-50"
            >
              <option value="">Select reason code</option>
              {ACCOUNTING_REASON_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="block text-xs font-semibold text-[var(--color-text-muted)]">Note</span>
            <input
              value={draft.reasonNote}
              onChange={(event) => updateAccountingDraft(row.orderId, 'reasonNote', event.target.value)}
              placeholder="Required for credit/mixed/cancelled"
              disabled={!canEdit || accountingBusyOrderId === row.orderId}
              className="w-full rounded-[16px] border-2 border-[var(--color-border)] bg-white focus:border-[var(--color-primary)] focus:outline-none px-4 py-3 text-sm font-semibold text-[var(--color-text)] transition-all disabled:opacity-50"
            />
          </label>
        </div>
        {!canEdit && (
          <p className="text-xs font-semibold text-[var(--color-text-muted)]">You cannot edit this order from the current mode/role.</p>
        )}
        <button
          type="button"
          onClick={() => saveAccountingTreatment(row.orderId, targetMode)}
          disabled={!canEdit || accountingBusyOrderId === row.orderId}
          className="bg-[var(--color-primary)] text-white px-6 py-3 rounded-[20px] text-xs font-black uppercase tracking-[0.2em] shadow-lg shadow-[var(--color-primary)]/10 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {accountingBusyOrderId === row.orderId ? 'Saving...' : 'Save Treatment'}
        </button>
      </section>
    );
  };

  if (!isAllowed) {
    return (
      <div className="px-4 py-12 space-y-4 text-center animate-in fade-in duration-500">
        <div className="w-16 h-16 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-3xl font-serif">Access Denied</h2>
        <p className="text-sm text-[var(--color-text-muted)]">You do not have permission to access reconciliation.</p>
      </div>
    );
  }

  // ── Shared style tokens ──────────────────────────────────────────────────────
  // Editable input — white bg, visible border, no spinner (via index.css)
  const inputCls = "w-full rounded-[16px] border-2 border-[var(--color-border)] bg-white focus:border-[var(--color-primary)] focus:outline-none px-4 py-3 text-sm font-semibold text-[var(--color-text)] transition-all placeholder:text-[var(--color-text-muted)]/50 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[var(--color-bg-secondary)]";
  // Compact editable cell for table rows
  const tableInputCls = "w-24 rounded-xl border-2 border-[var(--color-border)] bg-white focus:border-[var(--color-primary)] focus:outline-none px-2 py-1.5 text-sm font-semibold text-[var(--color-text)] transition-all disabled:opacity-50 disabled:bg-[var(--color-bg-secondary)]";
  // Label above a field
  const labelCls = "block text-xs font-semibold text-[var(--color-text-muted)] mb-1.5";

  // ── Computed / auto-calculated display field ─────────────────────────────────
  const renderComputed = (label: string, value: string, highlight?: 'positive' | 'negative') => (
    <div className="space-y-1.5">
      <span className={labelCls}>{label}</span>
      <div className="w-full rounded-[16px] bg-[var(--color-primary)]/8 border border-[var(--color-primary)]/25 px-4 py-3 flex items-center justify-between gap-2">
        <span className={`text-sm font-bold ${highlight === 'positive' ? 'text-emerald-700' : highlight === 'negative' ? 'text-red-700' : 'text-[var(--color-text)]'}`}>
          {value}
        </span>
        <span className="text-[8px] font-black uppercase tracking-widest text-[var(--color-primary)] bg-white border border-[var(--color-primary)]/30 px-2 py-0.5 rounded-full shrink-0">
          AUTO
        </span>
      </div>
    </div>
  );

  // ── KPI card ─────────────────────────────────────────────────────────────────
  const renderKpiCard = (label: string, value: string, variant?: 'primary' | 'positive' | 'negative') => (
    <article className={`rounded-[24px] p-5 ${variant === 'primary' ? 'border-2 border-[var(--color-primary)] bg-[var(--color-primary)]/5' : 'border border-[var(--color-border)] bg-white'}`}>
      <p className="text-xs font-semibold text-[var(--color-text-muted)] leading-tight">{label}</p>
      <p className={`mt-2 text-2xl font-serif ${variant === 'primary' ? 'text-[var(--color-primary)]' : variant === 'positive' ? 'text-emerald-700' : variant === 'negative' ? 'text-red-700' : 'text-[var(--color-text)]'}`}>
        {value}
      </p>
    </article>
  );

  // ── Stat chip (read-only summary grid item) ───────────────────────────────────
  const renderStatChip = (label: string, value: string) => (
    <div key={label} className="bg-[var(--color-bg-secondary)] rounded-[14px] p-3 border border-[var(--color-border)]">
      <p className="text-xs font-semibold text-[var(--color-text-muted)] mb-1">{label}</p>
      <p className="text-sm font-serif font-bold text-[var(--color-text)]">{value}</p>
    </div>
  );

  return (
    <div className="px-4 py-6 pb-28 space-y-5 animate-in fade-in duration-500">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-primary)] mb-1">Daily Operations</p>
          <h2 className="text-3xl font-serif">
            {mode === 'bakery' ? 'Bakery Reconciliation' : 'Cafe Reconciliation'}
          </h2>
          <p className="text-xs text-[var(--color-text-muted)] mt-1 max-w-lg">
            {mode === 'bakery'
              ? 'Open day, capture stock movement, and close with variance by bakery SKU.'
              : 'Open day, reconcile completed cafe orders to received payments, and close with order-to-cash variance.'}
          </p>
          <p className="text-xs font-semibold text-[var(--color-text-muted)]/70 mt-1">
            Role mode: {mode === 'bakery' ? (canEditBakery ? 'Editable' : 'View only') : (canEditCafe ? 'Editable' : 'View only')}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-[var(--color-bg-secondary)] rounded-[20px] border border-[var(--color-border)] px-5 py-3 self-start shrink-0">
          <label className="text-xs font-semibold text-[var(--color-text-muted)] whitespace-nowrap" htmlFor="business-date">
            Business Date
          </label>
          <input
            id="business-date"
            type="date"
            value={businessDate}
            onChange={(event) => setBusinessDate(parseBusinessDateInput(event.target.value, businessDate))}
            className="bg-transparent outline-none text-sm font-black text-[var(--color-text)]"
          />
          <span className="text-xs font-black text-[var(--color-primary)] whitespace-nowrap">{businessDateLabel}</span>
        </div>
      </header>

      {/* ── Mode tab nav ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <nav className="flex gap-1 rounded-[20px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/40 p-1">
          {(['bakery', 'cafe'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              disabled={!availableModes.includes(m)}
              className={`rounded-[16px] px-6 py-2.5 text-xs font-black uppercase tracking-wider transition-all disabled:opacity-40 ${
                mode === m
                  ? 'bg-[var(--color-primary)] text-white shadow-sm'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              {m === 'bakery' ? 'Bakery Mode' : 'Cafe Mode'}
            </button>
          ))}
        </nav>
        <div className={`inline-flex items-center gap-2 rounded-[16px] border px-4 py-2 text-xs font-bold ${
          activeStatusClosed
            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
            : 'border-amber-300 bg-amber-50 text-amber-700'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${activeStatusClosed ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          {activeReconciliation?.status ?? 'not_opened'}
        </div>
      </div>

      {/* ── Inline feedback ────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-[20px] border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-700">{notice}</div>
      )}
      {writeSummary && (
        <div className="rounded-[20px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-5 py-3 text-xs text-[var(--color-text-muted)]">
          <strong className="text-[var(--color-text)] uppercase tracking-wide mr-2">{writeSummary.action}</strong>
          wrote <code>{writeSummary.collection}/{writeSummary.reconciliationDocId}</code> · ledger entries: <strong>{writeSummary.ledgerEntriesWritten}</strong> · snapshots: <strong>{writeSummary.snapshotsWritten}</strong>
        </div>
      )}

      {/* ── Day-close guard ────────────────────────────────────────────────── */}
      {(unresolvedOrdersForBusinessDate.length > 0 || staleOpenOrders.length > 0) && (
        <section className="rounded-[20px] border-2 border-amber-300 bg-amber-50 px-5 py-4 space-y-1.5">
          {unresolvedOrdersForBusinessDate.length > 0 && (
            <p className="text-sm text-amber-900"><span className="font-black">Day-close guard:</span> {unresolvedOrdersForBusinessDate.length} active order(s) exist for {businessDateLabel}. Close Day will block unless you confirm forced resolution.</p>
          )}
          {staleOpenOrders.length > 0 && (
            <p className="text-sm text-amber-900"><span className="font-black">Stale recovery pending:</span> {staleOpenOrders.length} unresolved order(s) from previous business dates will be auto-resolved on close.</p>
          )}
        </section>
      )}

      {/* ── Open / closed status banner ───────────────────────────────────── */}
      <section className={`rounded-[20px] border px-5 py-3.5 text-sm font-medium flex items-center gap-2 ${
        activeStatusClosed
          ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
          : 'border-amber-300 bg-amber-50 text-amber-800'
      }`}>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${activeStatusClosed ? 'bg-emerald-500' : 'bg-amber-500'}`} />
        {activeStatusClosed
          ? 'Finalized reconciliation: this business date is read-only and closed.'
          : 'Active reconciliation: this business date is open for updates until you close the day.'}
      </section>

      {activeReconciliation && legacyMissingFields.length > 0 && (
        <section className="rounded-[20px] border border-amber-300 bg-amber-50 px-5 py-3 text-xs text-amber-900">
          Legacy record compatibility: missing fields <code className="font-mono">{legacyMissingFields.join(', ')}</code> are shown as not available.
        </section>
      )}

      {/* ── Audit Trail ───────────────────────────────────────────────────── */}
      <section className="rounded-[24px] border border-[var(--color-border)] bg-white p-5">
        <p className="text-xs font-black uppercase tracking-widest text-[var(--color-text-muted)] mb-4">Audit Trail</p>
        <div className="grid grid-cols-2 md:grid-cols-7 gap-4">
          {[
            { label: 'Opened By',       value: renderAuditActor(activeReconciliation?.openedBy, 'Not available') },
            { label: 'Last Updated By', value: renderAuditActor(activeReconciliation?.lastUpdatedBy, 'Not available') },
            { label: 'Last Updated At', value: activeReconciliation?.lastUpdatedAt ? formatDateTime(activeReconciliation.lastUpdatedAt) : activeReconciliation?.updatedAt ? formatDateTime(activeReconciliation.updatedAt) : (activeReconciliation ? 'Not available (legacy)' : '—') },
            { label: 'Closed By',       value: renderAuditActor(activeReconciliation?.closedBy, 'Not available') },
            { label: 'Closed At',       value: activeReconciliation?.closedAt ? formatDateTime(activeReconciliation.closedAt) : (activeStatusClosed ? 'Not available (legacy)' : '—') },
            { label: 'Reopened By',     value: renderAuditActor(activeReconciliation?.reopenedBy, activeReconciliation ? 'Not reopened' : '—') },
            { label: 'Reopened At',     value: activeReconciliation?.reopenedAt ? formatDateTime(activeReconciliation.reopenedAt) : (activeReconciliation ? '—' : '—') },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-xs font-semibold text-[var(--color-text-muted)] mb-1">{label}</p>
              <p className="text-sm font-bold text-[var(--color-text)] leading-snug">{value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          BAKERY MODE
      ══════════════════════════════════════════════════════════════════════ */}
      {mode === 'bakery' ? (
        <>
          {/* Status strip */}
          <section className="rounded-[24px] border border-[var(--color-border)] bg-white px-5 py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Status',       value: reconciliation?.status ?? 'not_opened' },
                { label: 'SKU Count',    value: String(workingLines.length) },
                { label: 'Last Updated', value: reconciliation ? formatDateTime(reconciliation.updatedAt) : 'Not yet' },
                { label: 'Closed At',    value: reconciliation?.closedAt ? formatDateTime(reconciliation.closedAt) : 'Open' },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs font-semibold text-[var(--color-text-muted)] mb-1">{label}</p>
                  <p className="text-sm font-bold text-[var(--color-text)]">{value}</p>
                </div>
              ))}
            </div>
          </section>

          {/* KPIs */}
          <section className="grid grid-cols-2 xl:grid-cols-3 gap-3">
            {renderKpiCard('Collectible Expected Cash', formatCurrency(bakerySettlementTotals.collectibleExpectedCash), 'primary')}
            {renderKpiCard('Total Received', formatCurrency(bakerySettlementTotals.totalReceived))}
            {renderKpiCard('Variance', formatCurrency(bakerySettlementTotals.variance),
              bakerySettlementTotals.variance === 0 ? undefined : bakerySettlementTotals.variance > 0 ? 'positive' : 'negative')}
            {renderKpiCard('Gross Completed Sales', formatCurrency(bakerySettlementTotals.grossCompletedSales))}
            {renderKpiCard('Credit Outstanding', formatCurrency(bakerySettlementTotals.creditValue))}
            {renderKpiCard('Complimentary Value', formatCurrency(bakerySettlementTotals.complimentaryValue))}
          </section>

          {/* Receipts + Settlement 2-col */}
          <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">

            {/* Actual Receipts — editable inputs */}
            <article className="rounded-[24px] border border-[var(--color-border)] bg-white p-6 space-y-5">
              <div className="pb-4 border-b border-[var(--color-border)]">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="text-xl font-serif">Actual Receipts</h3>
                  <span className="text-[9px] font-black uppercase tracking-widest bg-[var(--color-text)] text-white px-2 py-0.5 rounded-full">Enter values</span>
                </div>
                <p className="text-xs font-semibold text-[var(--color-text-muted)]">Auto-captured from completed bakery orders with recorded payments</p>
              </div>
              {reconciliation && !reconciliation.cashControl && (
                <p className="text-xs text-amber-700 bg-amber-50 rounded-[12px] px-3 py-2">Legacy record: cash-control fields were not captured on this historical day.</p>
              )}

              {/* Payment method inputs */}
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-[var(--color-text-muted)] mb-3">Payment Methods Received</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="space-y-1.5">
                    <span className={labelCls}>Cash Received</span>
                    <input type="number" min={0} value={bakerySettlementDraft.cashReceived} readOnly disabled className={inputCls} />
                  </label>
                  <label className="space-y-1.5">
                    <span className={labelCls}>Mobile Money</span>
                    <input type="number" min={0} value={bakerySettlementDraft.mobileMoneyReceived} readOnly disabled className={inputCls} />
                  </label>
                  <label className="space-y-1.5">
                    <span className={labelCls}>Bank / Transfer</span>
                    <input type="number" min={0} value={bakerySettlementDraft.bankReceived} readOnly disabled className={inputCls} />
                  </label>
                  <label className="space-y-1.5">
                    <span className={labelCls}>Other</span>
                    <input type="number" min={0} value={bakerySettlementDraft.otherReceived} readOnly disabled className={inputCls} />
                  </label>
                </div>
              </div>

              {/* Cash control inputs */}
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-[var(--color-text-muted)] mb-3">Cash Control</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="space-y-1.5">
                    <span className={labelCls}>Opening Cash Float</span>
                    <input type="number" min={0} value={bakeryCashDraft.openingCashFloat} onChange={(e) => updateCashDraftNumber('bakery', 'openingCashFloat', e.target.value)} disabled={!canEditBakery || isClosed} className={inputCls} />
                  </label>
                  <label className="space-y-1.5">
                    <span className={labelCls}>Cash Removed</span>
                    <input type="number" min={0} value={bakeryCashDraft.cashRemoved} onChange={(e) => updateCashDraftNumber('bakery', 'cashRemoved', e.target.value)} disabled={!canEditBakery || isClosed} className={inputCls} />
                  </label>
                  <label className="space-y-1.5 md:col-span-2">
                    <span className={labelCls}>Actual Counted Cash</span>
                    <input type="number" min={0} value={bakeryCashDraft.actualCountedCash} onChange={(e) => updateCashDraftNumber('bakery', 'actualCountedCash', e.target.value)} disabled={!canEditBakery || isClosed} className={inputCls} />
                  </label>
                </div>
              </div>

              {/* Auto-calculated outputs — clearly distinct */}
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-[var(--color-text-muted)] mb-3">Calculated Results</p>
                <div className="grid grid-cols-2 gap-3">
                  {renderComputed('Expected Drawer Cash', formatCurrency(bakeryCashControl.expectedDrawerCash))}
                  {renderComputed('Cash Over / Short', formatCurrency(bakeryCashControl.cashOverShort),
                    bakeryCashControl.cashOverShort > 0 ? 'positive' : bakeryCashControl.cashOverShort < 0 ? 'negative' : undefined)}
                </div>
              </div>

              <label className="space-y-1.5 block">
                <span className={labelCls}>Handover Notes</span>
                <textarea rows={2} value={bakeryCashDraft.handoverNotes} onChange={(e) => updateCashDraftText('bakery', e.target.value)} disabled={!canEditBakery || isClosed} className={`${inputCls} resize-none`} />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => updateHandoverStatusDraft('bakery', 'handed_over')} disabled={!canEditBakery || isClosed} className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-2 text-xs font-bold disabled:opacity-50 hover:bg-[var(--color-border)] transition-colors">
                  Mark Handed Over
                </button>
                <button type="button" onClick={() => updateHandoverStatusDraft('bakery', 'received')} disabled={!canEditBakery || isClosed} className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-2 text-xs font-bold disabled:opacity-50 hover:bg-[var(--color-border)] transition-colors">
                  Mark Received
                </button>
                <span className="text-xs font-semibold text-[var(--color-text-muted)]">
                  Status: <strong className="text-[var(--color-text)]">{bakeryCashDraft.handoverStatus}</strong>
                </span>
              </div>
            </article>

            {/* Settlement Summary — all read-only */}
            <article className="rounded-[24px] border border-[var(--color-border)] bg-white p-6 space-y-5">
              <div className="pb-4 border-b border-[var(--color-border)]">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="text-xl font-serif">Settlement Summary</h3>
                  <span className="text-[9px] font-black uppercase tracking-widest bg-[var(--color-primary)]/10 text-[var(--color-primary)] px-2 py-0.5 rounded-full">Read-only</span>
                </div>
                <p className="text-xs font-semibold text-[var(--color-text-muted)]">Classify completed orders as paid, comp, credit, or mixed</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {renderStatChip('Complimentary Value', formatCurrency(bakerySettlementTotals.complimentaryValue))}
                {renderStatChip('Credit Outstanding', formatCurrency(bakerySettlementTotals.creditValue))}
                {renderStatChip('Mixed Review Value', formatCurrency(bakerySettlementTotals.mixedReviewValue))}
                {renderStatChip('Collectible Cash', formatCurrency(bakerySettlementTotals.collectibleExpectedCash))}
                {renderStatChip('Completed Orders', String(bakeryOrderSummary.completedOrders))}
                {renderStatChip('Pending Orders', String(bakeryOrderSummary.pendingOrders))}
              </div>
              <div className="border-t border-[var(--color-border)] pt-4 space-y-3">
                <p className="text-xs font-black uppercase tracking-widest text-[var(--color-text-muted)]">Handover Record</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Handed Over By', value: bakeryCashDraft.handedOverBy?.displayName || '—' },
                    { label: 'Handed Over At', value: bakeryCashDraft.handedOverAt ? formatDateTime(bakeryCashDraft.handedOverAt) : '—' },
                    { label: 'Received By',    value: bakeryCashDraft.receivedBy?.displayName || '—' },
                    { label: 'Received At',    value: bakeryCashDraft.receivedAt ? formatDateTime(bakeryCashDraft.receivedAt) : '—' },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-xs font-semibold text-[var(--color-text-muted)] mb-0.5">{label}</p>
                      <p className="text-sm font-bold text-[var(--color-text)]">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          </section>

          {/* Exclusions */}
          <section className="rounded-[24px] border border-[var(--color-border)] bg-white p-5 space-y-4">
            <div>
              <h3 className="text-lg font-serif">Non-Collectible / Exclusions</h3>
              <p className="text-xs font-semibold text-[var(--color-text-muted)] mt-0.5">Mixed bakery+cafe orders excluded until split allocation is implemented</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {renderStatChip('Mixed Unresolved',   String(bakeryOrderSummary.excludedMixedOrders))}
              {renderStatChip('Pending Excluded',   String(bakeryOrderSummary.excludedPendingOrders))}
              {renderStatChip('Cancelled Excluded', String(bakeryOrderSummary.excludedCancelledOrders))}
              {renderStatChip('Completed Orders',   String(bakeryOrderSummary.completedOrders))}
            </div>
          </section>

          {/* Bakery Order Accounting Audit — collapsible */}
          <details className="group rounded-[24px] border border-[var(--color-border)] bg-white overflow-hidden">
            <summary className="px-5 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]/40 cursor-pointer list-none flex items-center justify-between hover:bg-[var(--color-bg-secondary)] transition-colors">
              <div>
                <h3 className="text-lg font-serif">Order Accounting Audit</h3>
                <p className="text-xs font-semibold text-[var(--color-text-muted)] mt-0.5">Update treatment/reason to control collectible cash logic for bakery orders</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-bold text-[var(--color-text-muted)] bg-[var(--color-border)] px-2.5 py-1 rounded-full">{bakeryDisplayAuditRows.length} orders</span>
                <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)] group-open:rotate-180 transition-transform duration-200" />
              </div>
            </summary>
            <div className="overflow-x-auto">
              <table className="min-w-[1250px] w-full text-sm">
                <thead className="bg-[var(--color-bg-secondary)] text-left">
                  <tr>
                    {['Order ID','Date/Time','Customer','Service Area','Service Mode','Status','Total','Treatment','Collectible?','Action','Exclusion Reason'].map(col => (
                      <th key={col} className="px-3 py-3 text-xs font-semibold text-[var(--color-text-muted)] whitespace-nowrap">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bakeryDisplayAuditRows.length === 0 && (
                    <tr><td colSpan={11} className="px-3 py-8 text-center text-[var(--color-text-muted)] italic text-sm">No bakery-mode orders found for this date.</td></tr>
                  )}
                  {bakeryDisplayAuditRows.map((row) => (
                    <tr key={`bakery-${row.orderId}`} className="border-t border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)]/30 transition-colors">
                      <td className="px-3 py-2.5 font-black text-xs">{row.orderId}</td>
                      <td className="px-3 py-2.5 text-xs">{row.date ? formatDateTime(row.date) : 'Unknown'}</td>
                      <td className="px-3 py-2.5 font-medium text-xs">
                        <span>{row.customerName || 'Walk-in'}</span>
                        {row.orderEntryMode === 'staff_assisted' && row.createdByStaffName && (
                          <p className="text-[9px] text-[var(--color-primary)]/70 font-black uppercase tracking-wider mt-0.5">via {row.createdByStaffName}</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5"><span className="text-[9px] font-black uppercase tracking-widest bg-[var(--color-bg-secondary)] border border-[var(--color-border)] px-2 py-0.5 rounded-full">{row.serviceArea}</span></td>
                      <td className="px-3 py-2.5 text-xs capitalize">{row.serviceMode}</td>
                      <td className="px-3 py-2.5 text-xs">{row.status}</td>
                      <td className="px-3 py-2.5 font-black text-xs">{formatCurrency(row.total)}</td>
                      <td className="px-3 py-2.5 capitalize text-xs">{row.treatment.replace('_', ' ')}</td>
                      <td className={`px-3 py-2.5 text-xs font-black ${row.includedInCollectibleCash ? 'text-emerald-700' : 'text-[var(--color-text-muted)]'}`}>
                        {row.includedInCollectibleCash ? '✓ Yes' : 'No'}
                      </td>
                      <td className="px-3 py-2.5">
                        <button type="button" onClick={() => setSelectedAccountingOrderId(row.orderId)} disabled={row.serviceArea !== 'bakery' || (isClosed && currentUser?.role !== 'admin')}
                          className="rounded-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] px-3 py-1 text-xs font-bold disabled:opacity-40 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors">
                          Edit
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-[var(--color-text-muted)]">{row.exclusionReason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          {renderAccountingEditorPanel('bakery', bakeryDisplayAuditRows)}

          {/* Stock Movement — collapsible */}
          <details className="group rounded-[24px] border border-[var(--color-border)] bg-white overflow-hidden" open>
            <summary className="px-5 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]/40 cursor-pointer list-none flex items-center justify-between hover:bg-[var(--color-bg-secondary)] transition-colors">
              <div>
                <h3 className="text-lg font-serif">Stock Movement</h3>
                <p className="text-xs font-semibold text-[var(--color-text-muted)] mt-0.5">
                  Enter values in <span className="font-black text-[var(--color-text)]">white cells</span> · orange <span className="font-black text-[var(--color-primary)]">AUTO</span> cells are calculated
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-bold text-[var(--color-text-muted)] bg-[var(--color-border)] px-2.5 py-1 rounded-full">{workingLines.length} SKUs</span>
                <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)] group-open:rotate-180 transition-transform duration-200" />
              </div>
            </summary>
            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full text-sm">
                <thead className="text-left">
                  <tr>
                    {/* Read-only columns */}
                    <th className="px-3 py-3 text-xs font-semibold text-[var(--color-text-muted)] bg-[var(--color-bg-secondary)]">Item</th>
                    <th className="px-3 py-3 text-xs font-semibold text-[var(--color-text-muted)] bg-[var(--color-bg-secondary)]">SKU</th>
                    <th className="px-3 py-3 text-xs font-semibold text-[var(--color-text-muted)] bg-[var(--color-bg-secondary)]">Opening</th>
                    <th className="px-3 py-3 text-xs font-semibold text-[var(--color-text-muted)] bg-[var(--color-bg-secondary)]">Unit Price</th>
                    {/* Editable columns — white header */}
                    <th className="px-3 py-3 text-xs font-black text-[var(--color-text)] bg-white border-l-2 border-[var(--color-primary)]/20">Received ✏</th>
                    <th className="px-3 py-3 text-xs font-semibold text-[var(--color-text-muted)] bg-[var(--color-bg-secondary)]">Sold</th>
                    {/* Auto column */}
                    <th className="px-3 py-3 text-xs font-black text-[var(--color-primary)] bg-[var(--color-primary)]/5">Expected Sales</th>
                    {/* Editable */}
                    <th className="px-3 py-3 text-xs font-black text-[var(--color-text)] bg-white border-l-2 border-[var(--color-primary)]/20">Waste ✏</th>
                    <th className="px-3 py-3 text-xs font-black text-[var(--color-text)] bg-white">Adjustment ✏</th>
                    {/* Auto */}
                    <th className="px-3 py-3 text-xs font-black text-[var(--color-primary)] bg-[var(--color-primary)]/5">Expected Closing</th>
                    {/* Editable */}
                    <th className="px-3 py-3 text-xs font-black text-[var(--color-text)] bg-white border-l-2 border-[var(--color-primary)]/20">Actual Closing ✏</th>
                    {/* Auto */}
                    <th className="px-3 py-3 text-xs font-black text-[var(--color-primary)] bg-[var(--color-primary)]/5">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr><td colSpan={12} className="px-3 py-8 text-center text-[var(--color-text-muted)] italic">Loading bakery reconciliation data...</td></tr>
                  )}
                  {!loading && workingLines.length === 0 && (
                    <tr><td colSpan={12} className="px-3 py-8 text-center text-[var(--color-text-muted)] italic">No active bakery SKUs found.</td></tr>
                  )}
                  {!loading && workingLines.map((line) => (
                    <tr key={line.sku} className="border-t border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)]/20 transition-colors">
                      <td className="px-3 py-2.5 font-bold text-sm bg-[var(--color-bg-secondary)]/30">{line.itemName}</td>
                      <td className="px-3 py-2.5 text-xs font-semibold text-[var(--color-text-muted)] bg-[var(--color-bg-secondary)]/30">{line.sku}</td>
                      <td className="px-3 py-2.5 font-semibold bg-[var(--color-bg-secondary)]/30">{line.openingStock}</td>
                      <td className="px-3 py-2.5 text-xs bg-[var(--color-bg-secondary)]/30">{formatCurrency(line.unitPrice)}</td>
                      <td className="px-3 py-2.5 border-l-2 border-[var(--color-primary)]/10">
                        <input type="number" min={0} value={draftBySku[line.sku]?.receivedStock ?? 0} onChange={(e) => updateDraftField(line.sku, 'receivedStock', e.target.value)} disabled={!canEditBakery || isClosed} className={tableInputCls} />
                      </td>
                      <td className="px-3 py-2.5 font-semibold bg-[var(--color-bg-secondary)]/30">{line.soldStock}</td>
                      <td className="px-3 py-2.5 font-bold text-[var(--color-primary)] bg-[var(--color-primary)]/5">{formatCurrency(line.expectedSalesValue)}</td>
                      <td className="px-3 py-2.5 border-l-2 border-[var(--color-primary)]/10">
                        <input type="number" min={0} value={draftBySku[line.sku]?.waste ?? 0} onChange={(e) => updateDraftField(line.sku, 'waste', e.target.value)} disabled={!canEditBakery || isClosed} className={tableInputCls} />
                      </td>
                      <td className="px-3 py-2.5">
                        <input type="number" value={draftBySku[line.sku]?.adjustment ?? 0} onChange={(e) => updateDraftField(line.sku, 'adjustment', e.target.value)} disabled={!canEditBakery || isClosed} className={tableInputCls} />
                      </td>
                      <td className="px-3 py-2.5 font-bold text-[var(--color-primary)] bg-[var(--color-primary)]/5">{line.closingExpected}</td>
                      <td className="px-3 py-2.5 border-l-2 border-[var(--color-primary)]/10">
                        <input type="number" min={0} value={draftBySku[line.sku]?.closingActualInput ?? ''} onChange={(e) => updateDraftField(line.sku, 'closingActualInput', e.target.value)} disabled={!canEditBakery || isClosed} className={tableInputCls} />
                      </td>
                      <td className={`px-3 py-2.5 font-black bg-[var(--color-primary)]/5 ${(line.variance || 0) === 0 ? 'text-[var(--color-text)]' : (line.variance || 0) > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {typeof line.variance === 'number' ? line.variance : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-[var(--color-border)]">
                  <tr className="font-black text-sm">
                    <td className="px-3 py-3 text-xs uppercase tracking-widest text-[var(--color-text-muted)] bg-[var(--color-bg-secondary)]">Totals</td>
                    <td className="px-3 py-3 bg-[var(--color-bg-secondary)]">—</td>
                    <td className="px-3 py-3 bg-[var(--color-bg-secondary)]">{totals.openingStock}</td>
                    <td className="px-3 py-3 bg-[var(--color-bg-secondary)]">—</td>
                    <td className="px-3 py-3">{totals.receivedStock}</td>
                    <td className="px-3 py-3 bg-[var(--color-bg-secondary)]">{totals.soldStock}</td>
                    <td className="px-3 py-3 text-[var(--color-primary)] bg-[var(--color-primary)]/5">{formatCurrency(totals.expectedSalesValue)}</td>
                    <td className="px-3 py-3">{totals.waste}</td>
                    <td className="px-3 py-3">{totals.adjustment}</td>
                    <td className="px-3 py-3 text-[var(--color-primary)] bg-[var(--color-primary)]/5">{totals.closingExpected}</td>
                    <td className="px-3 py-3">{totals.closingActual}</td>
                    <td className={`px-3 py-3 bg-[var(--color-primary)]/5 ${totals.variance === 0 ? '' : totals.variance > 0 ? 'text-emerald-700' : 'text-red-700'}`}>{totals.variance}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </details>

          {/* Action bar */}
          <section className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/40 p-4 flex flex-wrap gap-3 items-center">
            {canManageBakeryLifecycle && (
              <button type="button" onClick={handleOpenDay} disabled={busy || !!reconciliation || workingLines.length === 0}
                className="flex items-center gap-2 rounded-[20px] bg-[var(--color-primary)] text-white px-6 py-3 text-xs font-black uppercase tracking-[0.2em] shadow-lg shadow-[var(--color-primary)]/10 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Open Day
              </button>
            )}
            <button type="button" onClick={handleSaveDraft} disabled={!canEditBakery || busy || isClosed || workingLines.length === 0 || !reconciliation}
              className="flex items-center gap-2 rounded-[20px] border-2 border-[var(--color-border)] bg-white px-6 py-3 text-xs font-black uppercase tracking-[0.2em] active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
              <Save className="w-4 h-4" /> Save Draft
            </button>
            {canManageBakeryLifecycle && (
              <>
                <button type="button" onClick={handleCloseDay} disabled={busy || isClosed || workingLines.length === 0 || !reconciliation}
                  className="flex items-center gap-2 rounded-[20px] bg-emerald-600 text-white px-6 py-3 text-xs font-black uppercase tracking-[0.2em] shadow-lg shadow-emerald-200 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                  <ClipboardCheck className="w-4 h-4" /> Close Day
                </button>
                {isClosed && (
                  <button type="button" onClick={handleReopenDay} disabled={busy || !reconciliation}
                    className="flex items-center gap-2 rounded-[20px] bg-amber-600 text-white px-6 py-3 text-xs font-black uppercase tracking-[0.2em] shadow-lg shadow-amber-200 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                    Reopen Day
                  </button>
                )}
              </>
            )}
            {!canManageBakeryLifecycle && (
              <p className="text-xs font-semibold text-[var(--color-text-muted)]">Accountant mode: value updates only. Day open/close/reopen is admin-managed.</p>
            )}
          </section>
        </>

      ) : (

        /* ══════════════════════════════════════════════════════════════════
           CAFE MODE
        ══════════════════════════════════════════════════════════════════ */
        <>
          {/* KPIs */}
          <section className="grid grid-cols-2 xl:grid-cols-3 gap-3">
            {renderKpiCard('Collectible Expected Cash', formatCurrency(cafeTotals.collectibleExpectedCash), 'primary')}
            {renderKpiCard('Total Received', formatCurrency(cafeTotals.totalReceived))}
            {renderKpiCard('Variance', formatCurrency(cafeTotals.variance),
              cafeTotals.variance === 0 ? undefined : cafeTotals.variance > 0 ? 'positive' : 'negative')}
            {renderKpiCard('Gross Completed Sales', formatCurrency(cafeTotals.grossCompletedSales))}
            {renderKpiCard('Credit Outstanding', formatCurrency(cafeTotals.creditValue))}
            {renderKpiCard('Complimentary Value', formatCurrency(cafeTotals.complimentaryValue))}
          </section>

          {/* Payment Entry + Settlement 2-col */}
          <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">

            {/* Payment Entry — editable inputs */}
            <article className="rounded-[24px] border border-[var(--color-border)] bg-white p-6 space-y-5">
              <div className="pb-4 border-b border-[var(--color-border)]">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="text-xl font-serif">Payment Entry</h3>
                  <span className="text-[9px] font-black uppercase tracking-widest bg-[var(--color-text)] text-white px-2 py-0.5 rounded-full">Enter values</span>
                </div>
                <p className="text-xs font-semibold text-[var(--color-text-muted)]">Auto-captured from completed cafe orders with recorded payments</p>
              </div>
              {cafeReconciliation && !cafeReconciliation.cashControl && (
                <p className="text-xs text-amber-700 bg-amber-50 rounded-[12px] px-3 py-2">Legacy record: cash-control fields were not captured on this historical day.</p>
              )}

              <div>
                <p className="text-xs font-black uppercase tracking-widest text-[var(--color-text-muted)] mb-3">Payment Methods Received</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="space-y-1.5">
                    <span className={labelCls}>Cash Received</span>
                    <input type="number" min={0} value={cafeDraft.cashReceived} readOnly disabled className={inputCls} />
                  </label>
                  <label className="space-y-1.5">
                    <span className={labelCls}>Mobile Money</span>
                    <input type="number" min={0} value={cafeDraft.mobileMoneyReceived} readOnly disabled className={inputCls} />
                  </label>
                  <label className="space-y-1.5">
                    <span className={labelCls}>Bank / Transfer</span>
                    <input type="number" min={0} value={cafeDraft.bankReceived} readOnly disabled className={inputCls} />
                  </label>
                  <label className="space-y-1.5">
                    <span className={labelCls}>Other</span>
                    <input type="number" min={0} value={cafeDraft.otherReceived} readOnly disabled className={inputCls} />
                  </label>
                </div>
              </div>

              <label className="space-y-1.5 block">
                <span className={labelCls}>Notes</span>
                <textarea rows={3} value={cafeDraft.notes} onChange={(e) => setCafeDraft((prev) => ({ ...prev, notes: e.target.value }))} disabled={!canEditCafe || cafeStatusClosed} className={`${inputCls} resize-none`} />
              </label>

              <div>
                <p className="text-xs font-black uppercase tracking-widest text-[var(--color-text-muted)] mb-3">Cash Control</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <label className="space-y-1.5">
                    <span className={labelCls}>Opening Cash Float</span>
                    <input type="number" min={0} value={cafeCashDraft.openingCashFloat} onChange={(e) => updateCashDraftNumber('cafe', 'openingCashFloat', e.target.value)} disabled={!canEditCafe || cafeStatusClosed} className={inputCls} />
                  </label>
                  <label className="space-y-1.5">
                    <span className={labelCls}>Cash Removed</span>
                    <input type="number" min={0} value={cafeCashDraft.cashRemoved} onChange={(e) => updateCashDraftNumber('cafe', 'cashRemoved', e.target.value)} disabled={!canEditCafe || cafeStatusClosed} className={inputCls} />
                  </label>
                  <label className="space-y-1.5">
                    <span className={labelCls}>Actual Counted Cash</span>
                    <input type="number" min={0} value={cafeCashDraft.actualCountedCash} onChange={(e) => updateCashDraftNumber('cafe', 'actualCountedCash', e.target.value)} disabled={!canEditCafe || cafeStatusClosed} className={inputCls} />
                  </label>
                </div>
              </div>

              {/* Calculated outputs */}
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-[var(--color-text-muted)] mb-3">Calculated Results</p>
                <div className="grid grid-cols-2 gap-3">
                  {renderComputed('Expected Drawer Cash', formatCurrency(cafeCashControl.expectedDrawerCash))}
                  {renderComputed('Cash Over / Short', formatCurrency(cafeCashControl.cashOverShort),
                    cafeCashControl.cashOverShort > 0 ? 'positive' : cafeCashControl.cashOverShort < 0 ? 'negative' : undefined)}
                </div>
              </div>

              <label className="space-y-1.5 block">
                <span className={labelCls}>Handover Notes</span>
                <textarea rows={2} value={cafeCashDraft.handoverNotes} onChange={(e) => updateCashDraftText('cafe', e.target.value)} disabled={!canEditCafe || cafeStatusClosed} className={`${inputCls} resize-none`} />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => updateHandoverStatusDraft('cafe', 'handed_over')} disabled={!canEditCafe || cafeStatusClosed} className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-2 text-xs font-bold disabled:opacity-50 hover:bg-[var(--color-border)] transition-colors">
                  Mark Handed Over
                </button>
                <button type="button" onClick={() => updateHandoverStatusDraft('cafe', 'received')} disabled={!canEditCafe || cafeStatusClosed} className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-2 text-xs font-bold disabled:opacity-50 hover:bg-[var(--color-border)] transition-colors">
                  Mark Received
                </button>
                <span className="text-xs font-semibold text-[var(--color-text-muted)]">
                  Status: <strong className="text-[var(--color-text)]">{cafeCashDraft.handoverStatus}</strong>
                </span>
              </div>
            </article>

            {/* Settlement Summary — all read-only */}
            <article className="rounded-[24px] border border-[var(--color-border)] bg-white p-6 space-y-5">
              <div className="pb-4 border-b border-[var(--color-border)]">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="text-xl font-serif">Settlement Summary</h3>
                  <span className="text-[9px] font-black uppercase tracking-widest bg-[var(--color-primary)]/10 text-[var(--color-primary)] px-2 py-0.5 rounded-full">Read-only</span>
                </div>
                <p className="text-xs font-semibold text-[var(--color-text-muted)]">Classify gross sales into collectible expected cash</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {renderStatChip('Status',       cafeReconciliation?.status ?? 'not_opened')}
                {renderStatChip('Last Updated', cafeReconciliation ? formatDateTime(cafeReconciliation.updatedAt) : 'Not yet')}
                {renderStatChip('Cancelled',    String(cafeTotals.cancelledOrders))}
                {renderStatChip('Pending',      String(cafeTotals.pendingOrders))}
                {renderStatChip('Completed',    String(cafeTotals.completedOrders))}
                {renderStatChip('Total Orders', String(cafeTotals.totalOrders))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {renderStatChip('Gross Completed Sales', formatCurrency(cafeTotals.grossCompletedSales))}
                {renderStatChip('Complimentary Value',   formatCurrency(cafeTotals.complimentaryValue))}
                {renderStatChip('Credit Outstanding',    formatCurrency(cafeTotals.creditValue))}
                {renderStatChip('Mixed Review Value',    formatCurrency(cafeTotals.mixedReviewValue))}
              </div>
              <div className="border-t border-[var(--color-border)] pt-4 space-y-3">
                <p className="text-xs font-black uppercase tracking-widest text-[var(--color-text-muted)]">Handover Record</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Handed Over By', value: cafeCashDraft.handedOverBy?.displayName || '—' },
                    { label: 'Handed Over At', value: cafeCashDraft.handedOverAt ? formatDateTime(cafeCashDraft.handedOverAt) : '—' },
                    { label: 'Received By',    value: cafeCashDraft.receivedBy?.displayName || '—' },
                    { label: 'Received At',    value: cafeCashDraft.receivedAt ? formatDateTime(cafeCashDraft.receivedAt) : '—' },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-xs font-semibold text-[var(--color-text-muted)] mb-0.5">{label}</p>
                      <p className="text-sm font-bold text-[var(--color-text)]">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          </section>

          {/* Service Mode Breakdown + Exclusions */}
          <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <article className="rounded-[24px] border border-[var(--color-border)] bg-white p-5 space-y-4">
              <h3 className="text-lg font-serif">Service Mode Breakdown</h3>
              <div className="rounded-[16px] border border-[var(--color-border)] overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--color-bg-secondary)]">
                    <tr>
                      {['Service Mode','Count','Value'].map(col => (
                        <th key={col} className="px-4 py-3 text-left text-xs font-semibold text-[var(--color-text-muted)]">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: 'Dine-in',  count: cafeTotals.dineInOrders,   value: formatCurrency(cafeTotals.dineInValue) },
                      { label: 'Pickup',   count: cafeTotals.pickupOrders,   value: formatCurrency(cafeTotals.pickupValue) },
                      { label: 'Delivery', count: cafeTotals.deliveryOrders, value: formatCurrency(cafeTotals.deliveryValue) },
                    ].map(({ label, count, value }) => (
                      <tr key={label} className="border-t border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)]/30 transition-colors">
                        <td className="px-4 py-3 font-bold">{label}</td>
                        <td className="px-4 py-3 font-semibold">{count}</td>
                        <td className="px-4 py-3 font-bold text-[var(--color-primary)]">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="rounded-[24px] border border-[var(--color-border)] bg-white p-5 space-y-4">
              <div>
                <h3 className="text-lg font-serif">Non-Collectible / Exclusions</h3>
                <p className="text-xs font-semibold text-[var(--color-text-muted)] mt-0.5">Mixed bakery+cafe orders excluded until split allocation is implemented</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {renderStatChip('Mixed Unresolved',   String(cafeTotals.excludedMixedOrders))}
                {renderStatChip('Pending Excluded',   String(cafeTotals.excludedPendingOrders))}
                {renderStatChip('Cancelled Excluded', String(cafeTotals.excludedCancelledOrders))}
                {renderStatChip('Completed Orders',   String(cafeTotals.completedOrders))}
              </div>
            </article>
          </section>

          {/* Cafe Item Sales — collapsible */}
          <details className="group rounded-[24px] border border-[var(--color-border)] bg-white overflow-hidden">
            <summary className="px-5 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]/40 cursor-pointer list-none flex items-center justify-between hover:bg-[var(--color-bg-secondary)] transition-colors">
              <div>
                <h3 className="text-lg font-serif">Item Sales Ledger</h3>
                <p className="text-xs font-semibold text-[var(--color-text-muted)] mt-0.5">Item-level completed cafe sales for this business date</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-bold text-[var(--color-text-muted)] bg-[var(--color-border)] px-2.5 py-1 rounded-full">{cafeItemSalesSummary.length} items</span>
                <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)] group-open:rotate-180 transition-transform duration-200" />
              </div>
            </summary>
            <div className="p-5 space-y-4">
              {/* Filters */}
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/30 px-3 flex-1 min-w-[160px]">
                  <svg className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  <input
                    value={cafeItemSearch}
                    onChange={(e) => setCafeItemSearch(e.target.value)}
                    placeholder="Search item or order ID"
                    className="w-full bg-transparent py-2 text-xs outline-none"
                  />
                </div>
                <select
                  value={cafeItemServiceModeFilter}
                  onChange={(e) => setCafeItemServiceModeFilter(e.target.value as typeof cafeItemServiceModeFilter)}
                  className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/30 px-3 py-2 text-xs font-semibold"
                >
                  <option value="all">All modes</option>
                  <option value="pickup">Pickup</option>
                  <option value="dine_in">Dine-in</option>
                  <option value="delivery">Delivery</option>
                </select>
                <select
                  value={cafeItemPaymentFilter}
                  onChange={(e) => setCafeItemPaymentFilter(e.target.value as typeof cafeItemPaymentFilter)}
                  className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/30 px-3 py-2 text-xs font-semibold"
                >
                  <option value="all">All payments</option>
                  <option value="cash">Cash</option>
                  <option value="mobile_money">Mobile money</option>
                  <option value="pay_later">Pay later</option>
                </select>
              </div>

              {/* Summary table */}
              {cafeItemSalesSummary.length === 0 ? (
                <p className="text-center text-sm text-[var(--color-text-muted)] italic py-6">No completed cafe sales match these filters.</p>
              ) : (
                <div className="rounded-[16px] border border-[var(--color-border)] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--color-bg-secondary)] text-left">
                      <tr>
                        {['Item', 'Qty Sold', 'Gross Value', 'Orders'].map((col) => (
                          <th key={col} className="px-4 py-3 text-xs font-semibold text-[var(--color-text-muted)] whitespace-nowrap">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cafeItemSalesSummary.map((row) => (
                        <tr key={row.itemName} className="border-t border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)]/30 transition-colors">
                          <td className="px-4 py-3 font-semibold">{row.itemName}</td>
                          <td className="px-4 py-3 font-bold">{row.qtySold}</td>
                          <td className="px-4 py-3 font-bold text-[var(--color-primary)]">{formatCurrency(row.grossValue)}</td>
                          <td className="px-4 py-3 text-[var(--color-text-muted)]">{row.orderCount}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-bg-secondary)]/50 font-black">
                        <td className="px-4 py-3 text-xs uppercase tracking-widest">Total</td>
                        <td className="px-4 py-3">{cafeItemSalesSummary.reduce((s, r) => s + r.qtySold, 0)}</td>
                        <td className="px-4 py-3 text-[var(--color-primary)]">{formatCurrency(cafeItemSalesSummary.reduce((s, r) => s + r.grossValue, 0))}</td>
                        <td className="px-4 py-3 text-[var(--color-text-muted)]">{new Set(cafeItemSalesFiltered.map((r) => r.orderId)).size}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* Detail rows */}
              {cafeItemSalesFiltered.length > 0 && (
                <details className="group/detail">
                  <summary className="cursor-pointer list-none flex items-center gap-2 text-xs font-black uppercase tracking-widest text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors py-1">
                    <ChevronDown className="w-3.5 h-3.5 group-open/detail:rotate-180 transition-transform" />
                    Order line detail ({cafeItemSalesFiltered.length} rows)
                  </summary>
                  <div className="mt-3 overflow-x-auto rounded-[16px] border border-[var(--color-border)]">
                    <table className="min-w-[700px] w-full text-xs">
                      <thead className="bg-[var(--color-bg-secondary)] text-left">
                        <tr>
                          {['Order ID', 'Item', 'Qty', 'Line Total', 'Service Mode', 'Payment', 'Completed At'].map((col) => (
                            <th key={col} className="px-3 py-2.5 font-semibold text-[var(--color-text-muted)] whitespace-nowrap">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {cafeItemSalesFiltered.map((row, idx) => (
                          <tr key={`${row.orderId}-${idx}`} className="border-t border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)]/30 transition-colors">
                            <td className="px-3 py-2 font-black">{row.orderId.slice(-8).toUpperCase()}</td>
                            <td className="px-3 py-2 font-medium">{row.itemName}</td>
                            <td className="px-3 py-2">{row.quantity}</td>
                            <td className="px-3 py-2 font-bold text-[var(--color-primary)]">{formatCurrency(row.lineTotal)}</td>
                            <td className="px-3 py-2 capitalize">{row.serviceMode.replace('_', ' ')}</td>
                            <td className="px-3 py-2 capitalize">{row.paymentChoice.replace('_', ' ')}</td>
                            <td className="px-3 py-2 text-[var(--color-text-muted)]">{row.completedAt ? formatDateTime(row.completedAt) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </div>
          </details>

          {/* Cafe Order Audit — collapsible */}
          <details className="group rounded-[24px] border border-[var(--color-border)] bg-white overflow-hidden">
            <summary className="px-5 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]/40 cursor-pointer list-none flex items-center justify-between hover:bg-[var(--color-bg-secondary)] transition-colors">
              <div>
                <h3 className="text-lg font-serif">Included-Order Audit</h3>
                <p className="text-xs font-semibold text-[var(--color-text-muted)] mt-0.5">Shows exactly which orders are collectible today and which are excluded</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-bold text-[var(--color-text-muted)] bg-[var(--color-border)] px-2.5 py-1 rounded-full">{cafeDisplayAuditRows.length} orders</span>
                <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)] group-open:rotate-180 transition-transform duration-200" />
              </div>
            </summary>
            <div className="overflow-x-auto">
              <table className="min-w-[1250px] w-full text-sm">
                <thead className="bg-[var(--color-bg-secondary)] text-left">
                  <tr>
                    {['Order ID','Date/Time','Customer','Service Area','Service Mode','Status','Total','Treatment','Collectible?','Action','Exclusion Reason'].map(col => (
                      <th key={col} className="px-3 py-3 text-xs font-semibold text-[var(--color-text-muted)] whitespace-nowrap">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cafeDisplayAuditRows.length === 0 && (
                    <tr><td colSpan={11} className="px-3 py-8 text-center text-[var(--color-text-muted)] italic text-sm">No orders found for this business date.</td></tr>
                  )}
                  {cafeDisplayAuditRows.map((row) => (
                    <tr key={row.orderId} className="border-t border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)]/30 transition-colors">
                      <td className="px-3 py-2.5 font-black text-xs">{row.orderId}</td>
                      <td className="px-3 py-2.5 text-xs">{row.date ? formatDateTime(row.date) : 'Unknown'}</td>
                      <td className="px-3 py-2.5 font-medium text-xs">
                        <span>{row.customerName || 'Walk-in'}</span>
                        {row.orderEntryMode === 'staff_assisted' && row.createdByStaffName && (
                          <p className="text-[9px] text-[var(--color-primary)]/70 font-black uppercase tracking-wider mt-0.5">via {row.createdByStaffName}</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5"><span className="text-[9px] font-black uppercase tracking-widest bg-[var(--color-bg-secondary)] border border-[var(--color-border)] px-2 py-0.5 rounded-full">{row.serviceArea}</span></td>
                      <td className="px-3 py-2.5 text-xs capitalize">{row.serviceMode}</td>
                      <td className="px-3 py-2.5 text-xs">{row.status}</td>
                      <td className="px-3 py-2.5 font-black text-xs">{formatCurrency(row.total)}</td>
                      <td className="px-3 py-2.5 capitalize text-xs">{row.treatment.replace('_', ' ')}</td>
                      <td className={`px-3 py-2.5 text-xs font-black ${row.includedInCollectibleCash ? 'text-emerald-700' : 'text-[var(--color-text-muted)]'}`}>
                        {row.includedInCollectibleCash ? '✓ Yes' : 'No'}
                      </td>
                      <td className="px-3 py-2.5">
                        <button type="button" onClick={() => setSelectedAccountingOrderId(row.orderId)} disabled={row.serviceArea !== 'cafe' || (cafeStatusClosed && currentUser?.role !== 'admin')}
                          className="rounded-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] px-3 py-1 text-xs font-bold disabled:opacity-40 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors">
                          Edit
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-[var(--color-text-muted)]">{row.exclusionReason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          {renderAccountingEditorPanel('cafe', cafeDisplayAuditRows)}

          {/* Cafe action bar */}
          <section className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/40 p-4 flex flex-wrap gap-3 items-center">
            {canManageCafeLifecycle && (
              <button type="button" onClick={handleOpenCafeDay} disabled={busy || !!cafeReconciliation}
                className="flex items-center gap-2 rounded-[20px] bg-[var(--color-primary)] text-white px-6 py-3 text-xs font-black uppercase tracking-[0.2em] shadow-lg shadow-[var(--color-primary)]/10 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Open Day
              </button>
            )}
            <button type="button" onClick={handleSaveCafeDraft} disabled={!canEditCafe || busy || cafeStatusClosed || !cafeReconciliation}
              className="flex items-center gap-2 rounded-[20px] border-2 border-[var(--color-border)] bg-white px-6 py-3 text-xs font-black uppercase tracking-[0.2em] active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
              <Save className="w-4 h-4" /> Save Draft
            </button>
            {canManageCafeLifecycle && (
              <>
                <button type="button" onClick={handleCloseCafeDay} disabled={busy || cafeStatusClosed || !cafeReconciliation}
                  className="flex items-center gap-2 rounded-[20px] bg-emerald-600 text-white px-6 py-3 text-xs font-black uppercase tracking-[0.2em] shadow-lg shadow-emerald-200 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                  <ClipboardCheck className="w-4 h-4" /> Close Day
                </button>
                {cafeStatusClosed && (
                  <button type="button" onClick={handleReopenCafeDay} disabled={busy || !cafeReconciliation}
                    className="flex items-center gap-2 rounded-[20px] bg-amber-600 text-white px-6 py-3 text-xs font-black uppercase tracking-[0.2em] shadow-lg shadow-amber-200 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                    Reopen Day
                  </button>
                )}
              </>
            )}
            {!canManageCafeLifecycle && (
              <p className="text-xs font-semibold text-[var(--color-text-muted)]">Accountant mode: value updates only. Day open/close/reopen is admin-managed.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
};
