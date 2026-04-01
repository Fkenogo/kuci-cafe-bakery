import { CafeDailyReconciliationTotals, PersistedOrder } from '../types';
import {
  buildReconciliationAuditRows,
  computeSettlementTotals,
  PaymentDraftInput,
  ReconciliationAuditRow,
  ReconciliationOrderSummary,
  summarizeAuditRows,
} from './accountingTreatment';

export type CafeOrderMetrics = ReconciliationOrderSummary;
export type CafeOrderAuditRow = ReconciliationAuditRow;

export function computeCafeOrderMetrics(orders: PersistedOrder[], businessDate: string): CafeOrderMetrics {
  return summarizeAuditRows(buildCafeOrderAuditRows(orders, businessDate), 'cafe');
}

export function buildCafeOrderAuditRows(orders: PersistedOrder[], businessDate: string): CafeOrderAuditRow[] {
  return buildReconciliationAuditRows(orders, businessDate, 'cafe');
}

export function buildCafeTotals(
  metrics: CafeOrderMetrics,
  payments: PaymentDraftInput
): CafeDailyReconciliationTotals {
  const settlement = computeSettlementTotals(metrics, payments);

  return {
    totalOrders: metrics.totalOrders,
    completedOrders: metrics.completedOrders,
    cancelledOrders: metrics.cancelledOrders,
    pendingOrders: metrics.pendingOrders,
    expectedSalesValue: settlement.collectibleExpectedCash,
    grossCompletedSales: settlement.grossCompletedSales,
    complimentaryValue: settlement.complimentaryValue,
    creditValue: settlement.creditValue,
    mixedReviewValue: settlement.mixedReviewValue,
    collectibleExpectedCash: settlement.collectibleExpectedCash,
    dineInValue: metrics.dineInValue,
    pickupValue: metrics.pickupValue,
    deliveryValue: metrics.deliveryValue,
    cashReceived: settlement.cashReceived,
    mobileMoneyReceived: settlement.mobileMoneyReceived,
    bankReceived: settlement.bankReceived,
    otherReceived: settlement.otherReceived,
    totalReceived: settlement.totalReceived,
    variance: settlement.variance,
    dineInOrders: metrics.dineInOrders,
    pickupOrders: metrics.pickupOrders,
    deliveryOrders: metrics.deliveryOrders,
    excludedBakeryOrders: metrics.excludedOtherAreaOrders,
    excludedMixedOrders: metrics.excludedMixedOrders,
    excludedPendingOrders: metrics.excludedPendingOrders,
    excludedCancelledOrders: metrics.excludedCancelledOrders,
  };
}
