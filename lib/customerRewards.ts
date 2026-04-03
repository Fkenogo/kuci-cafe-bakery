import { collection, doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { StaffIdentity } from '../types';

export interface CustomerRewardSnapshot {
  phone: string;
  totalEarned: number;
  totalRedeemed: number;
  balance: number;
  updatedAt: unknown;
  lastOrderId?: string;
}

export interface LoyaltyAccrualResult {
  rewardKey: string;
  rewardEarned: number;
  rewardRedeemed: number;
  balanceAfter: number;
}

function toSafeNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

export function normalizePhoneForRewardKey(phone: string): string {
  const normalized = phone.replace(/[^\d+]/g, '');
  if (!normalized) return '';
  if (normalized.startsWith('+')) return normalized;
  return normalized;
}

export function resolveRewardEarnedFromOrderTotal(total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.floor(total / 100));
}

export async function loadCustomerRewardBalanceByPhone(phone: string): Promise<number> {
  const rewardKey = normalizePhoneForRewardKey(phone);
  if (!rewardKey) return 0;

  const rewardSnapshot = await getDoc(doc(db, 'customerRewards', rewardKey));
  if (!rewardSnapshot.exists()) return 0;

  const data = rewardSnapshot.data() as Record<string, unknown>;
  return toSafeNumber(data.balance);
}

export async function accrueCustomerRewardForCompletedPaidOrder(input: {
  orderId: string;
  customerPhone: string;
  orderTotal: number;
  loyaltyRedeemedAmount?: number;
  recordedBy: StaffIdentity | null;
}): Promise<LoyaltyAccrualResult | null> {
  const rewardKey = normalizePhoneForRewardKey(input.customerPhone);
  if (!rewardKey) return null;

  const rewardEarned = resolveRewardEarnedFromOrderTotal(input.orderTotal);
  const requestedRedeemed = Number.isFinite(input.loyaltyRedeemedAmount) ? Math.max(0, input.loyaltyRedeemedAmount || 0) : 0;
  const normalizedRequestedRedeemed = Math.floor(requestedRedeemed / 1000) * 1000;
  if (rewardEarned <= 0 && normalizedRequestedRedeemed <= 0) {
    return {
      rewardKey,
      rewardEarned: 0,
      rewardRedeemed: 0,
      balanceAfter: 0,
    };
  }

  const rewardRef = doc(db, 'customerRewards', rewardKey);
  const rewardTxnRef = doc(collection(rewardRef, 'transactions'), input.orderId);

  return runTransaction(db, async (transaction) => {
    const existingTxn = await transaction.get(rewardTxnRef);
    const rewardSnapshot = await transaction.get(rewardRef);
    const rewardData = rewardSnapshot.exists() ? (rewardSnapshot.data() as Record<string, unknown>) : null;

    const currentTotalEarned = toSafeNumber(rewardData?.totalEarned);
    const currentTotalRedeemed = toSafeNumber(rewardData?.totalRedeemed);
    const currentBalance = toSafeNumber(rewardData?.balance);

    if (existingTxn.exists()) {
      return {
        rewardKey,
        rewardEarned: 0,
        rewardRedeemed: 0,
        balanceAfter: currentBalance,
      };
    }

    const appliedRedeemed = Math.min(normalizedRequestedRedeemed, Math.floor(currentBalance / 1000) * 1000);
    const nextTotalEarned = currentTotalEarned + rewardEarned;
    const nextTotalRedeemed = currentTotalRedeemed + appliedRedeemed;
    const nextBalance = Math.max(0, currentBalance - appliedRedeemed + rewardEarned);

    transaction.set(rewardRef, {
      phone: rewardKey,
      totalEarned: nextTotalEarned,
      totalRedeemed: nextTotalRedeemed,
      balance: nextBalance,
      updatedAt: serverTimestamp(),
      lastOrderId: input.orderId,
    }, { merge: true });

    transaction.set(rewardTxnRef, {
      orderId: input.orderId,
      phone: rewardKey,
      type: appliedRedeemed > 0 ? 'adjustment' : 'earn',
      amount: rewardEarned,
      redeemedAmount: appliedRedeemed,
      createdAt: serverTimestamp(),
      recordedBy: input.recordedBy,
    }, { merge: false });

    return {
      rewardKey,
      rewardEarned,
      rewardRedeemed: appliedRedeemed,
      balanceAfter: nextBalance,
    };
  });
}
