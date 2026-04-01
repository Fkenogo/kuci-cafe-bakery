import { OrderStatus } from '../types';
import { toBusinessDate, toDateFromUnknown } from './businessDate';

export interface DayBoundOrderLike {
  businessDate?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  status: OrderStatus;
  resolution?: 'normal' | 'forced_close';
  resolutionReason?: 'day_close' | 'stale_recovery_cancel';
  recoveryReason?: 'stale_recovery_complete' | 'stale_recovery_cancel' | 'stale_recovery_carry_forward';
}

export function resolveOrderBusinessDate(order: DayBoundOrderLike): string | null {
  if (typeof order.businessDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(order.businessDate)) {
    return order.businessDate;
  }

  const createdAt =
    order.createdAt instanceof Date
      ? order.createdAt
      : toDateFromUnknown(order.createdAt);
  if (createdAt) {
    return toBusinessDate(createdAt);
  }

  return null;
}

export function isTerminalOrderStatus(status: OrderStatus): boolean {
  return status === 'completed' || status === 'rejected';
}

export function isOrderOperationallyTerminal(order: DayBoundOrderLike): boolean {
  if (isTerminalOrderStatus(order.status)) return true;
  if (order.resolution === 'forced_close') return true;
  if (order.resolutionReason === 'stale_recovery_cancel') return true;
  if (order.recoveryReason === 'stale_recovery_complete' || order.recoveryReason === 'stale_recovery_cancel') return true;
  return false;
}

export function isStaleOrder(order: DayBoundOrderLike, activeBusinessDate: string): boolean {
  const orderDate = resolveOrderBusinessDate(order);
  if (!orderDate) return false;
  return orderDate !== activeBusinessDate && !isTerminalOrderStatus(order.status);
}

export function getStaleAgeDays(order: DayBoundOrderLike, activeBusinessDate: string): number | null {
  const orderDate = resolveOrderBusinessDate(order);
  if (!orderDate) return null;
  const orderStart = Date.parse(`${orderDate}T00:00:00.000Z`);
  const activeStart = Date.parse(`${activeBusinessDate}T00:00:00.000Z`);
  if (!Number.isFinite(orderStart) || !Number.isFinite(activeStart) || activeStart < orderStart) return 0;
  return Math.floor((activeStart - orderStart) / (1000 * 60 * 60 * 24));
}
