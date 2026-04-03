import { serverTimestamp } from 'firebase/firestore';
import {
  AccountingTreatment,
  FinancialStatus,
  OrderPaymentRecord,
  OrderPaymentStatus,
  PaymentMethod,
  PersistedOrder,
  StaffIdentity,
} from '../types';

export interface PaymentCaptureDraft {
  method: PaymentMethod | '';
  amountReceived: string;
  isComplimentary: boolean;
  isCredit: boolean;
}

export type PaymentCaptureValidation = {
  ok: true;
  payment: OrderPaymentRecord;
  paymentStatus: OrderPaymentStatus;
  financialStatus: FinancialStatus;
  accountingTreatment: AccountingTreatment;
} | {
  ok: false;
  message: string;
};

export function createInitialPaymentCaptureDraft(order: Pick<PersistedOrder, 'payment' | 'financialStatus' | 'total' | 'loyaltyRedemption'>): PaymentCaptureDraft {
  const payment = order.payment;
  const orderAmountDue = resolveOrderAmountDue(order);
  return {
    method: payment?.method || '',
    amountReceived: payment && Number.isFinite(payment.amountReceived) ? String(payment.amountReceived) : String(orderAmountDue || 0),
    isComplimentary: order.financialStatus === 'complimentary' || payment?.isComplimentary === true,
    isCredit: order.financialStatus === 'credit' || payment?.isCredit === true,
  };
}

export function resolveOrderAmountDue(order: Pick<PersistedOrder, 'total' | 'loyaltyRedemption'>): number {
  const grossTotal = Number.isFinite(order.total) ? Math.max(0, order.total) : 0;
  const loyaltyApplied =
    order.loyaltyRedemption?.selectedByCustomer === true &&
    Number.isFinite(order.loyaltyRedemption.appliedAmount)
      ? Math.max(0, order.loyaltyRedemption.appliedAmount)
      : 0;
  return Math.max(0, grossTotal - loyaltyApplied);
}

export function resolveReceiptNumber(orderId: string, now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const shortId = orderId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase();
  return `KUCI-${year}${month}${day}-${shortId}`;
}

function parseAmount(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return NaN;
  return Math.max(0, parsed);
}

export function validatePaymentCapture(orderTotal: number, draft: PaymentCaptureDraft, amountDueOverride?: number): PaymentCaptureValidation {
  const isComplimentary = draft.isComplimentary;
  const isCredit = !isComplimentary && draft.isCredit;
  const amountReceived = isComplimentary ? 0 : parseAmount(draft.amountReceived);
  const amountDue = Number.isFinite(amountDueOverride) ? Math.max(0, amountDueOverride as number) : Math.max(0, orderTotal);

  if (!isComplimentary && Number.isNaN(amountReceived)) {
    return { ok: false, message: 'Enter a valid amount received.' };
  }

  if (!isComplimentary && !isCredit && !draft.method) {
    return { ok: false, message: 'Select a payment method before completing the order.' };
  }

  if (!isComplimentary && !isCredit && amountReceived < amountDue) {
    return { ok: false, message: `Amount received must be at least ${Math.round(amountDue).toLocaleString()} RWF.` };
  }

  const method: PaymentMethod | null = isComplimentary ? null : (draft.method || null);
  const financialStatus: FinancialStatus = isComplimentary
    ? 'complimentary'
    : isCredit
      ? 'credit'
      : 'paid';
  const paymentStatus: OrderPaymentStatus = financialStatus === 'paid'
    ? 'paid'
    : financialStatus;
  const accountingTreatment: AccountingTreatment = financialStatus === 'paid'
    ? 'paid'
    : financialStatus === 'complimentary'
      ? 'complimentary'
      : 'credit';

  return {
    ok: true,
    payment: {
      method,
      amountReceived: isComplimentary ? 0 : amountReceived,
      currency: 'RWF',
      isComplimentary,
      isCredit,
      recordedBy: null,
      recordedAt: null,
    },
    paymentStatus,
    financialStatus,
    accountingTreatment,
  };
}

export function buildCompletionPaymentUpdate(order: { id: string }, actor: StaffIdentity | null, capture: Extract<PaymentCaptureValidation, { ok: true }>) {
  return {
    status: 'completed',
    completedBy: actor,
    paymentStatus: capture.paymentStatus,
    financialStatus: capture.financialStatus,
    payment: {
      ...capture.payment,
      recordedBy: actor,
      recordedAt: serverTimestamp(),
    },
    accountingTreatment: capture.accountingTreatment,
    accountingUpdatedAt: serverTimestamp(),
    accountingUpdatedBy: actor,
    receipt: {
      receiptNumber: resolveReceiptNumber(order.id),
      generatedAt: serverTimestamp(),
      visibleToCustomer: true,
    },
    updatedAt: serverTimestamp(),
  };
}

export function buildOptimisticCompletionWithPayment(actor: StaffIdentity | null, capture: Extract<PaymentCaptureValidation, { ok: true }>) {
  return {
    status: 'completed' as const,
    completedBy: actor,
    paymentStatus: capture.paymentStatus,
    financialStatus: capture.financialStatus,
    payment: {
      ...capture.payment,
      recordedBy: actor,
      recordedAt: new Date(),
    },
    accountingTreatment: capture.accountingTreatment,
    accountingUpdatedAt: new Date(),
    accountingUpdatedBy: actor,
    updatedAt: new Date(),
  };
}
