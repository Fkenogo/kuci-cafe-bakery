import {
  AccountingReasonCode,
  AccountingTreatment,
  OrderServiceArea,
  PersistedOrder,
  ReconciliationSettlementTotals,
} from '../types';
import { timestampToDate } from './bakeryReconciliation';
import { toBusinessDate } from './businessDate';

export type ReconciliationMode = 'bakery' | 'cafe';

export interface ReconciliationAuditRow {
  orderId: string;
  date: Date | null;
  customerName: string;
  serviceArea: OrderServiceArea;
  serviceMode: PersistedOrder['serviceMode'];
  status: PersistedOrder['status'];
  total: number;
  treatment: AccountingTreatment;
  reasonCode: AccountingReasonCode | null;
  reasonNote: string;
  includedInGrossSales: boolean;
  includedInCollectibleCash: boolean;
  includedLabel: 'yes' | 'no';
  exclusionReason: string | null;
}

export interface ReconciliationOrderSummary {
  totalOrders: number;
  completedOrders: number;
  pendingOrders: number;
  cancelledOrders: number;
  dineInOrders: number;
  pickupOrders: number;
  deliveryOrders: number;
  dineInValue: number;
  pickupValue: number;
  deliveryValue: number;
  grossCompletedSales: number;
  complimentaryValue: number;
  creditValue: number;
  mixedReviewValue: number;
  collectibleExpectedCash: number;
  excludedOtherAreaOrders: number;
  excludedMixedOrders: number;
  excludedPendingOrders: number;
  excludedCancelledOrders: number;
}

export interface PaymentDraftInput {
  cashReceived: number;
  mobileMoneyReceived: number;
  bankReceived: number;
  otherReceived: number;
}

export function normalizeAccountingTreatment(order: PersistedOrder): AccountingTreatment {
  if (order.accountingTreatment) return order.accountingTreatment;
  if (order.status === 'rejected') return 'cancelled';
  if (order.serviceArea === 'mixed') return 'mixed_review';
  return 'paid';
}

function normalizeReasonCode(order: PersistedOrder): AccountingReasonCode | null {
  return order.accountingReasonCode || null;
}

function inBusinessDate(order: PersistedOrder, businessDate: string): Date | null {
  if (typeof order.businessDate === 'string' && order.businessDate === businessDate) {
    return timestampToDate(order.updatedAt) || timestampToDate(order.createdAt);
  }
  const orderDate = timestampToDate(order.updatedAt) || timestampToDate(order.createdAt);
  if (!orderDate) return null;
  if (toBusinessDate(orderDate) !== businessDate) return null;
  return orderDate;
}

function modeOwnsServiceArea(mode: ReconciliationMode, serviceArea: OrderServiceArea): boolean {
  if (mode === 'cafe') return serviceArea === 'cafe';
  return serviceArea === 'bakery';
}

export function buildReconciliationAuditRows(
  orders: PersistedOrder[],
  businessDate: string,
  mode: ReconciliationMode
): ReconciliationAuditRow[] {
  return orders
    .flatMap((order, index) => {
      const orderDate = inBusinessDate(order, businessDate);
      if (!orderDate) return [];

      const total = Number.isFinite(order.total) ? order.total : 0;
      const treatment = normalizeAccountingTreatment(order);
      const reasonCode = normalizeReasonCode(order);
      const reasonNote = typeof order.accountingReasonNote === 'string' ? order.accountingReasonNote : '';
      const inOwnedArea = modeOwnsServiceArea(mode, order.serviceArea);
      const row: ReconciliationAuditRow = {
        orderId: order.id || `order-${index + 1}`,
        date: orderDate,
        customerName: order.customer?.name || 'Walk-in',
        serviceArea: order.serviceArea,
        serviceMode: order.serviceMode,
        status: order.status,
        total,
        treatment,
        reasonCode,
        reasonNote,
        includedInGrossSales: false,
        includedInCollectibleCash: false,
        includedLabel: 'no',
        exclusionReason: null,
      };

      if (!inOwnedArea) {
        row.exclusionReason = order.serviceArea === 'mixed'
          ? 'Mixed order excluded pending split settlement.'
          : `${order.serviceArea} order excluded from ${mode} reconciliation.`;
        return [row];
      }

      if (order.status === 'rejected' || treatment === 'cancelled') {
        row.exclusionReason = 'Cancelled/rejected order excluded from collectible cash.';
        return [row];
      }

      if (order.status !== 'completed') {
        row.exclusionReason = 'Order excluded until completed.';
        return [row];
      }

      row.includedInGrossSales = true;

      if (treatment === 'complimentary') {
        row.exclusionReason = 'Complimentary treatment: included in gross, excluded from collectible cash.';
        return [row];
      }
      if (treatment === 'credit') {
        row.exclusionReason = 'Credit/pay-later treatment: included in gross, excluded from collectible cash.';
        return [row];
      }
      if (treatment === 'mixed_review') {
        row.exclusionReason = 'Mixed review treatment: requires manual settlement decision.';
        return [row];
      }

      row.includedInCollectibleCash = true;
      row.includedLabel = 'yes';
      return [row];
    })
    .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
}

export function summarizeAuditRows(
  rows: ReconciliationAuditRow[],
  mode: ReconciliationMode
): ReconciliationOrderSummary {
  return rows.reduce<ReconciliationOrderSummary>((acc, row) => {
    const inOwnedArea = modeOwnsServiceArea(mode, row.serviceArea);
    if (!inOwnedArea) {
      if (row.serviceArea === 'mixed') acc.excludedMixedOrders += 1;
      else acc.excludedOtherAreaOrders += 1;
      return acc;
    }

    acc.totalOrders += 1;
    if (row.serviceMode === 'dine_in') acc.dineInOrders += 1;
    if (row.serviceMode === 'pickup') acc.pickupOrders += 1;
    if (row.serviceMode === 'delivery') acc.deliveryOrders += 1;

    if (row.status === 'rejected' || row.treatment === 'cancelled') {
      acc.cancelledOrders += 1;
      acc.excludedCancelledOrders += 1;
      return acc;
    }

    if (row.status !== 'completed') {
      acc.pendingOrders += 1;
      acc.excludedPendingOrders += 1;
      return acc;
    }

    acc.completedOrders += 1;
    acc.grossCompletedSales += row.total;
    if (row.serviceMode === 'dine_in') acc.dineInValue += row.total;
    if (row.serviceMode === 'pickup') acc.pickupValue += row.total;
    if (row.serviceMode === 'delivery') acc.deliveryValue += row.total;

    if (row.treatment === 'complimentary') {
      acc.complimentaryValue += row.total;
    } else if (row.treatment === 'credit') {
      acc.creditValue += row.total;
    } else if (row.treatment === 'mixed_review') {
      acc.mixedReviewValue += row.total;
    }

    return acc;
  }, {
    totalOrders: 0,
    completedOrders: 0,
    pendingOrders: 0,
    cancelledOrders: 0,
    dineInOrders: 0,
    pickupOrders: 0,
    deliveryOrders: 0,
    dineInValue: 0,
    pickupValue: 0,
    deliveryValue: 0,
    grossCompletedSales: 0,
    complimentaryValue: 0,
    creditValue: 0,
    mixedReviewValue: 0,
    collectibleExpectedCash: 0,
    excludedOtherAreaOrders: 0,
    excludedMixedOrders: 0,
    excludedPendingOrders: 0,
    excludedCancelledOrders: 0,
  });
}

export function computeSettlementTotals(
  summary: ReconciliationOrderSummary,
  payments: PaymentDraftInput
): ReconciliationSettlementTotals {
  const collectibleExpectedCash =
    summary.grossCompletedSales -
    summary.complimentaryValue -
    summary.creditValue;
  const totalReceived =
    payments.cashReceived +
    payments.mobileMoneyReceived +
    payments.bankReceived +
    payments.otherReceived;

  return {
    grossCompletedSales: summary.grossCompletedSales,
    complimentaryValue: summary.complimentaryValue,
    creditValue: summary.creditValue,
    mixedReviewValue: summary.mixedReviewValue,
    collectibleExpectedCash,
    cashReceived: payments.cashReceived,
    mobileMoneyReceived: payments.mobileMoneyReceived,
    bankReceived: payments.bankReceived,
    otherReceived: payments.otherReceived,
    totalReceived,
    variance: totalReceived - collectibleExpectedCash,
  };
}
