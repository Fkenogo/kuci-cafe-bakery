import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { AlertCircle, ChevronDown, ChevronUp, Loader2, Phone, Search, ShoppingBag, UserRound } from 'lucide-react';
import { db } from '../../lib/firebase';
import { toBusinessDate } from '../../lib/businessDate';
import { isOrderOperationallyTerminal, resolveOrderBusinessDate } from '../../lib/orderDayLifecycle';
import {
  buildCompletionPaymentUpdate,
  buildOptimisticCompletionWithPayment,
  createInitialPaymentCaptureDraft,
  PaymentCaptureDraft,
  resolveOrderAmountDue,
  validatePaymentCapture,
} from '../../lib/orderPayments';
import { accrueCustomerRewardForCompletedPaidOrder } from '../../lib/customerRewards';
import {
  buildFrontServiceAcceptUpdate,
  buildOptimisticFrontServiceAcceptState,
  buildOptimisticStationProgressState,
  buildStationProgressUpdate,
  canCompleteOrder,
  deriveInvolvedStations,
  formatOrderStatus,
  formatStationStatus,
  getPrepStationLabel,
  getRelevantOrderTasks,
  getStationRecord,
  getStationRejectionReason,
  LiveOrder,
  normalizeLiveOrder,
  toStaffIdentity,
} from '../../lib/orderRouting';
import { AppUserRecord, MenuItem, OrderStatus, OrderServiceMode, PrepStation, StationOrderStatus } from '../../types';

interface OperationalOrdersBoardProps {
  isAllowed: boolean;
  menuItems: MenuItem[];
  currentStaff: AppUserRecord | null;
  scope: 'front_service' | 'bakery_front_service' | PrepStation;
  title: string;
  subtitle: string;
}

interface BoardSection {
  key: string;
  title: string;
  description: string;
  orders: LiveOrder[];
}

type QueueDateRange = 'today' | 'yesterday' | 'last_7_days' | 'all';
type QueueStatusFilter = 'all' | OrderStatus | StationOrderStatus;

interface QueueFilters {
  status: QueueStatusFilter;
  dateRange: QueueDateRange;
  serviceMode: 'all' | OrderServiceMode;
  station: 'all' | PrepStation;
  search: string;
  activeOnly: boolean;
  assigneeId?: string;
}

function formatCurrency(amount: number): string {
  return `${amount.toLocaleString()} RWF`;
}

function formatDate(value?: Date | null): string {
  if (!value) return 'Just now';
  return new Intl.DateTimeFormat('en-RW', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

function formatServiceMode(mode: LiveOrder['serviceMode']): string {
  return mode.replace('_', ' ');
}

function getVisibleStationStatus(order: LiveOrder, station: PrepStation): StationOrderStatus | null {
  return getStationRecord(order, station)?.status || null;
}

function getRejectingKey(orderId: string, station: PrepStation): string {
  return `${orderId}:${station}`;
}

function isFrontScope(scope: OperationalOrdersBoardProps['scope']): scope is 'front_service' | 'bakery_front_service' {
  return scope === 'front_service' || scope === 'bakery_front_service';
}

function getFrontLaneForScope(scope: 'front_service' | 'bakery_front_service') {
  return scope === 'bakery_front_service' ? 'bakery_front' : 'cafe_front';
}

function getSectionStorageKey(scope: 'front_service' | 'bakery_front_service' | PrepStation): string {
  return `staff-queue-sections:${scope}`;
}

function getDefaultSectionCollapsed(sectionKey: string): boolean {
  return sectionKey === 'completed' || sectionKey === 'rejected';
}

function isDateInRange(date: Date | null | undefined, range: QueueDateRange): boolean {
  if (range === 'all' || !date) return range === 'all';

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const last7DaysStart = new Date(startOfToday);
  last7DaysStart.setDate(last7DaysStart.getDate() - 6);

  if (range === 'today') {
    return date >= startOfToday && date < startOfTomorrow;
  }

  if (range === 'yesterday') {
    return date >= startOfYesterday && date < startOfToday;
  }

  return date >= last7DaysStart && date < startOfTomorrow;
}

function groupFrontOrders(orders: LiveOrder[]): BoardSection[] {
  const sectionOrder: Array<{ key: OrderStatus; title: string; description: string }> = [
    { key: 'pending', title: 'Pending Acceptance', description: 'New customer orders waiting for front service review.' },
    { key: 'front_accepted', title: 'Waiting On Stations', description: 'Accepted by front service and dispatched, but prep has not started yet.' },
    { key: 'in_progress', title: 'In Progress', description: 'At least one station is actively working this order.' },
    { key: 'ready_for_handover', title: 'Ready For Handover', description: 'All required stations are ready. Front service can hand over and complete.' },
    { key: 'rejected', title: 'Rejected', description: 'A required station rejected this order and needs follow-up.' },
    { key: 'completed', title: 'Completed', description: 'Finished orders kept visible for reference.' },
  ];

  return sectionOrder
    .map((section) => ({
      ...section,
      orders: orders.filter((order) => order.status === section.key),
    }))
    .filter((section) => section.orders.length > 0);
}

function groupStationOrders(orders: LiveOrder[], station: PrepStation): BoardSection[] {
  const sectionOrder: Array<{ key: StationOrderStatus; title: string; description: string }> = [
    { key: 'queued', title: 'Queued', description: 'New work waiting for this station to accept.' },
    { key: 'accepted', title: 'Accepted', description: 'Accepted work that is ready to move into prep.' },
    { key: 'preparing', title: 'Preparing', description: 'Orders actively being prepared right now.' },
    { key: 'ready', title: 'Ready', description: 'Finished station work waiting for front handover.' },
    { key: 'rejected', title: 'Rejected', description: 'Rejected work kept visible for review and follow-up.' },
  ];

  return sectionOrder
    .map((section) => ({
      ...section,
      orders: orders.filter((order) => getVisibleStationStatus(order, station) === section.key),
    }))
    .filter((section) => section.orders.length > 0);
}

export const OperationalOrdersBoard: React.FC<OperationalOrdersBoardProps> = ({ isAllowed, menuItems, currentStaff, scope, title, subtitle }) => {
  const [orders, setOrders] = useState<LiveOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expandedOrderIds, setExpandedOrderIds] = useState<Record<string, boolean>>({});
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const stored = window.sessionStorage.getItem(getSectionStorageKey(scope));
      return stored ? JSON.parse(stored) as Record<string, boolean> : {};
    } catch {
      return {};
    }
  });
  const [filters, setFilters] = useState<QueueFilters>({
    status: 'all',
    dateRange: 'all',
    serviceMode: 'all',
    station: 'all',
    search: '',
    activeOnly: true,
  });
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [rejectingKey, setRejectingKey] = useState<string | null>(null);
  const [rejectionDrafts, setRejectionDrafts] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [paymentModalOrder, setPaymentModalOrder] = useState<LiveOrder | null>(null);
  const [paymentDraft, setPaymentDraft] = useState<PaymentCaptureDraft>({
    method: '',
    amountReceived: '',
    isComplimentary: false,
    isCredit: false,
  });
  const actingStaff = useMemo(() => toStaffIdentity(currentStaff), [currentStaff]);
  const activeBusinessDate = toBusinessDate();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(getSectionStorageKey(scope), JSON.stringify(collapsedSections));
  }, [collapsedSections, scope]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 2500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!isAllowed) {
      setOrders([]);
      setLoading(false);
      return;
    }

    const ordersQuery = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      ordersQuery,
      (snapshot) => {
        const nextOrders = snapshot.docs.flatMap((orderDoc) => {
          const normalized = normalizeLiveOrder(orderDoc.id, orderDoc.data());
          return normalized ? [normalized] : [];
        });
        setOrders(nextOrders);
        setLoading(false);
        setError(null);
      },
      (snapshotError) => {
        console.error(`[${scope}] Failed to subscribe to orders:`, snapshotError);
        setError('Could not load orders right now.');
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [isAllowed, scope]);

  const baseOrders = useMemo(() => {
    const activeDayOrders = orders.filter((order) => resolveOrderBusinessDate(order) === activeBusinessDate);

    if (isFrontScope(scope)) {
      const frontLane = getFrontLaneForScope(scope);
      return activeDayOrders.filter((order) => frontLane === 'cafe_front'
        ? order.frontLane !== 'bakery_front'
        : order.frontLane === 'bakery_front');
    }

    return activeDayOrders.filter((order) => {
      if (isOrderOperationallyTerminal(order)) return false;
      if (!deriveInvolvedStations(order, menuItems).includes(scope)) return false;
      const stationStatus = getVisibleStationStatus(order, scope);
      return stationStatus === 'queued' || stationStatus === 'accepted' || stationStatus === 'preparing' || stationStatus === 'ready' || stationStatus === 'rejected';
    });
  }, [activeBusinessDate, menuItems, orders, scope]);

  const filteredOrders = useMemo(() => {
    const searchTerm = filters.search.trim().toLowerCase();

    return baseOrders.filter((order) => {
      if (filters.status !== 'all') {
        const statusMatch = isFrontScope(scope)
          ? order.status === filters.status
          : getVisibleStationStatus(order, scope) === filters.status;
        if (!statusMatch) return false;
      }

      if (filters.serviceMode !== 'all' && order.serviceMode !== filters.serviceMode) {
        return false;
      }

      if (!isDateInRange(order.createdAt, filters.dateRange)) {
        return false;
      }

      if (isFrontScope(scope) && scope === 'front_service' && filters.station !== 'all') {
        if (!deriveInvolvedStations(order, menuItems).includes(filters.station)) {
          return false;
        }
      }

      if (filters.activeOnly) {
        if (isFrontScope(scope)) {
          if (order.status === 'completed') return false;
          if (order.status === 'rejected' && filters.status !== 'rejected') return false;
        } else {
          const stationStatus = getVisibleStationStatus(order, scope);
          if (stationStatus === 'rejected' && filters.status !== 'rejected') return false;
        }
      }

      if (searchTerm) {
        const searchHaystack = [
          order.id,
          order.customer.name,
          order.customer.phone,
        ].join(' ').toLowerCase();

        if (!searchHaystack.includes(searchTerm)) return false;
      }

      return true;
    });
  }, [baseOrders, filters, menuItems, scope]);

  const sections = useMemo(() => {
    if (isFrontScope(scope)) {
      return groupFrontOrders(filteredOrders);
    }

    return groupStationOrders(filteredOrders, scope);
  }, [filteredOrders, scope]);

  const toggleExpanded = (orderId: string) => {
    setExpandedOrderIds((prev) => ({ ...prev, [orderId]: !prev[orderId] }));
  };

  const toggleSection = (sectionKey: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionKey]: !(sectionKey in prev ? prev[sectionKey] : getDefaultSectionCollapsed(sectionKey)),
    }));
  };

  const patchOrderLocally = (orderId: string, patch: Partial<LiveOrder>) => {
    setOrders((prev) => prev.map((order) => (order.id === orderId ? { ...order, ...patch } : order)));
  };

  const getElapsedMeta = (createdAt?: Date | null): { label: string; tone: 'green' | 'amber' | 'red' } => {
    if (!createdAt) return { label: '0m', tone: 'green' };
    const elapsedMs = Math.max(0, nowMs - createdAt.getTime());
    const totalMins = Math.floor(elapsedMs / 60000);
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    const label = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    if (totalMins > 10) return { label, tone: 'red' };
    if (totalMins >= 5) return { label, tone: 'amber' };
    return { label, tone: 'green' };
  };

  const getUrgencyClasses = (tone: 'green' | 'amber' | 'red'): string => {
    if (tone === 'red') return 'bg-red-600 text-white';
    if (tone === 'amber') return 'bg-amber-500 text-white';
    return 'bg-emerald-600 text-white';
  };

  const getOrderActionHint = (order: LiveOrder, orderStations: PrepStation[]): string => {
    if (order.status === 'pending') return 'Waiting for front acceptance';
    if (order.status === 'front_accepted') {
      if (orderStations.includes('kitchen')) return 'Waiting for kitchen';
      if (orderStations.includes('barista')) return 'Waiting for barista';
      return 'Ready for handover';
    }
    if (order.status === 'in_progress') {
      if (orderStations.includes('kitchen') && orderStations.includes('barista')) return 'Kitchen and barista in progress';
      if (orderStations.includes('kitchen')) return 'Kitchen in progress';
      if (orderStations.includes('barista')) return 'Barista in progress';
      return 'In progress';
    }
    if (order.status === 'ready_for_handover') return 'Ready for handover';
    if (order.status === 'completed') return 'Order completed';
    if (order.status === 'rejected') return 'Needs follow-up';
    return 'Waiting for update';
  };

  function formatTimeOnly(value?: Date | null): string {
    if (!value) return '';
    return new Intl.DateTimeFormat('en-RW', { timeStyle: 'short' }).format(value);
  }

  function getStationActionHint(status: StationOrderStatus | null | undefined): string {
    if (!status) return 'Waiting for dispatch';
    if (status === 'queued') return 'Waiting to accept';
    if (status === 'accepted') return 'Ready to start prep';
    if (status === 'preparing') return 'In preparation';
    if (status === 'ready') return 'Ready for handover';
    if (status === 'rejected') return 'Needs follow-up';
    return 'Waiting for update';
  }

  function getEmptyStateContent(): { title: string; description: string } {
    if (scope === 'barista') return { title: 'No drink orders waiting', description: 'New drink tasks appear here automatically when front service accepts an order.' };
    if (scope === 'kitchen') return { title: 'No food prep tasks', description: 'Kitchen tasks appear here when front service accepts an order.' };
    if (scope === 'bakery_front_service') return { title: 'No bakery orders', description: 'New bakery orders will appear here as they come in.' };
    return { title: 'No pending orders', description: 'New customer orders will appear here as they come in.' };
  }

  const openRejectReason = (orderId: string, station: PrepStation) => {
    const key = getRejectingKey(orderId, station);
    setRejectingKey(key);
    setRejectionDrafts((prev) => ({ ...prev, [key]: prev[key] || '' }));
  };

  const cancelRejectReason = (orderId: string, station: PrepStation) => {
    const key = getRejectingKey(orderId, station);
    setRejectingKey((current) => (current === key ? null : current));
    setRejectionDrafts((prev) => ({ ...prev, [key]: '' }));
  };

  const updateRejectReason = (orderId: string, station: PrepStation, value: string) => {
    const key = getRejectingKey(orderId, station);
    setRejectionDrafts((prev) => ({ ...prev, [key]: value }));
  };

  const handleFrontServiceAccept = async (order: LiveOrder) => {
    if (updatingOrderId) return;

    const optimisticPatch = buildOptimisticFrontServiceAcceptState(order, menuItems, actingStaff);

    try {
      setUpdatingOrderId(order.id);
      setError(null);
      setNotice(null);
      patchOrderLocally(order.id, optimisticPatch);
      await updateDoc(doc(db, 'orders', order.id), buildFrontServiceAcceptUpdate(order, menuItems, actingStaff));
      setNotice('Accepted order.');
    } catch (updateError) {
      console.error('[front_service] Failed to accept order:', updateError);
      setError('Could not accept this order.');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleFrontServiceComplete = async (order: LiveOrder) => {
    setError(null);
    setNotice(null);
    setPaymentModalOrder(order);
    setPaymentDraft(createInitialPaymentCaptureDraft(order));
  };

  const closePaymentModal = () => {
    if (updatingOrderId) return;
    setPaymentModalOrder(null);
  };

  const handleConfirmPaymentAndComplete = async () => {
    if (!paymentModalOrder || updatingOrderId) return;
    const validation = validatePaymentCapture(paymentModalOrder.total, paymentDraft, resolveOrderAmountDue(paymentModalOrder));
    if (validation.ok === false) {
      setError(validation.message);
      return;
    }

    const order = paymentModalOrder;
    if (updatingOrderId) return;

    try {
      setUpdatingOrderId(order.id);
      setError(null);
      setNotice(null);
      patchOrderLocally(order.id, buildOptimisticCompletionWithPayment(actingStaff, validation));
      await updateDoc(doc(db, 'orders', order.id), buildCompletionPaymentUpdate(order, actingStaff, validation));
      if (validation.financialStatus === 'paid' && order.orderEntryMode !== 'staff_assisted') {
        await accrueCustomerRewardForCompletedPaidOrder({
          orderId: order.id,
          customerPhone: order.customer.phone,
          orderTotal: order.total,
          loyaltyRedeemedAmount: order.loyaltyRedemption?.selectedByCustomer ? order.loyaltyRedemption.appliedAmount : 0,
          recordedBy: actingStaff,
        });
      }
      setNotice('Payment captured and order completed.');
      setPaymentModalOrder(null);
    } catch (updateError) {
      console.error('[front_service] Failed to complete order:', updateError);
      setError('Could not complete this order after payment capture.');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleStationAction = async (order: LiveOrder, station: PrepStation, action: 'accept' | 'preparing' | 'ready' | 'reject') => {
    if (updatingOrderId) return;

    const rejectionKey = getRejectingKey(order.id, station);
    const rejectionReason = action === 'reject' ? rejectionDrafts[rejectionKey]?.trim() : undefined;

    if (action === 'reject' && !rejectionReason) {
      setError('A rejection reason is required.');
      return;
    }

    const optimisticPatch = buildOptimisticStationProgressState(order, station, action, menuItems, actingStaff, rejectionReason);

    try {
      setUpdatingOrderId(order.id);
      setError(null);
      setNotice(null);
      patchOrderLocally(order.id, optimisticPatch);
      await updateDoc(doc(db, 'orders', order.id), buildStationProgressUpdate(order, station, action, menuItems, actingStaff, rejectionReason));
      if (action === 'accept') setNotice('Accepted task.');
      if (action === 'preparing') setNotice('Marked in progress.');
      if (action === 'ready') setNotice('Marked ready.');
      if (action === 'reject') setNotice('Rejected task.');

      if (action === 'reject') {
        setRejectingKey((current) => (current === rejectionKey ? null : current));
        setRejectionDrafts((prev) => ({ ...prev, [rejectionKey]: '' }));
      }
    } catch (updateError) {
      console.error(`[${station}] Failed to update order:`, updateError);
      setError('Could not update this station queue item.');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const statusOptions = isFrontScope(scope)
    ? [
        { value: 'all', label: 'All statuses' },
        { value: 'pending', label: 'Pending' },
        { value: 'front_accepted', label: 'Front accepted' },
        { value: 'in_progress', label: 'In progress' },
        { value: 'ready_for_handover', label: 'Ready for handover' },
        { value: 'rejected', label: 'Rejected' },
        { value: 'completed', label: 'Completed' },
      ]
    : [
        { value: 'all', label: 'All statuses' },
        { value: 'queued', label: 'Queued' },
        { value: 'accepted', label: 'Accepted' },
        { value: 'preparing', label: 'Preparing' },
        { value: 'ready', label: 'Ready' },
        { value: 'rejected', label: 'Rejected' },
      ];

  if (!isAllowed) {
    return (
      <div className="px-4 py-12 space-y-4 text-center">
        <div className="w-16 h-16 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-3xl font-serif">Access Denied</h2>
        <p className="text-sm text-[var(--color-text-muted)]">You do not have permission to view this staff queue.</p>
      </div>
    );
  }

  const getSectionColor = (key: string) => {
    if (key === 'pending') return 'border-amber-300 bg-amber-50 text-amber-900';
    if (key === 'front_accepted') return 'border-blue-200 bg-blue-50 text-blue-900';
    if (key === 'in_progress') return 'border-sky-300 bg-sky-50 text-sky-900';
    if (key === 'ready_for_handover' || key === 'ready') return 'border-emerald-300 bg-emerald-50 text-emerald-900';
    if (key === 'rejected') return 'border-red-300 bg-red-50 text-red-900';
    if (key === 'queued') return 'border-amber-200 bg-amber-50 text-amber-800';
    if (key === 'accepted') return 'border-blue-200 bg-blue-50 text-blue-900';
    if (key === 'preparing') return 'border-sky-300 bg-sky-50 text-sky-900';
    if (key === 'completed') return 'border-gray-200 bg-gray-50 text-gray-700';
    return 'border-[var(--color-border)] bg-white';
  };

  const getSectionDot = (key: string) => {
    if (key === 'pending' || key === 'queued') return 'bg-amber-400';
    if (key === 'front_accepted' || key === 'accepted') return 'bg-blue-400';
    if (key === 'in_progress' || key === 'preparing') return 'bg-sky-500';
    if (key === 'ready_for_handover' || key === 'ready') return 'bg-emerald-500';
    if (key === 'rejected') return 'bg-red-500';
    if (key === 'completed') return 'bg-gray-400';
    return 'bg-[var(--color-primary)]';
  };

  return (
    <div className="px-4 py-5 space-y-4 pb-28">
      {paymentModalOrder && (
        <div className="fixed inset-0 z-[130] bg-black/40 flex items-center justify-center px-4">
          <div className="w-full max-w-lg rounded-[24px] border border-[var(--color-border)] bg-white shadow-2xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-serif">Capture Payment</h3>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Order #{paymentModalOrder.id.slice(-6)} • Total {formatCurrency(paymentModalOrder.total)} • Amount Due {formatCurrency(resolveOrderAmountDue(paymentModalOrder))}
                </p>
              </div>
              <button
                onClick={closePaymentModal}
                disabled={!!updatingOrderId}
                className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-black uppercase tracking-wider disabled:opacity-50"
              >
                Close
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 block">
                <span className="text-xs font-semibold text-[var(--color-text-muted)]">Payment Method</span>
                <select
                  value={paymentDraft.method}
                  onChange={(event) => setPaymentDraft((prev) => ({ ...prev, method: event.target.value as PaymentCaptureDraft['method'] }))}
                  disabled={paymentDraft.isComplimentary || !!updatingOrderId}
                  className="w-full rounded-[14px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm disabled:opacity-60"
                >
                  <option value="">Select method</option>
                  <option value="cash">Cash</option>
                  <option value="mobile_money">Mobile money</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label className="space-y-1 block">
                <span className="text-xs font-semibold text-[var(--color-text-muted)]">Amount Received (RWF)</span>
                <input
                  type="number"
                  min={0}
                  value={paymentDraft.amountReceived}
                  onChange={(event) => setPaymentDraft((prev) => ({ ...prev, amountReceived: event.target.value }))}
                  disabled={paymentDraft.isComplimentary || !!updatingOrderId}
                  className="w-full rounded-[14px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm disabled:opacity-60"
                />
              </label>
            </div>

            <div className="grid gap-2">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={paymentDraft.isComplimentary}
                  disabled={!!updatingOrderId}
                  onChange={(event) =>
                    setPaymentDraft((prev) => ({
                      ...prev,
                      isComplimentary: event.target.checked,
                      isCredit: event.target.checked ? false : prev.isCredit,
                      method: event.target.checked ? '' : prev.method,
                      amountReceived: event.target.checked ? '0' : prev.amountReceived,
                    }))
                  }
                />
                Complimentary (no payment expected)
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={paymentDraft.isCredit}
                  disabled={paymentDraft.isComplimentary || !!updatingOrderId}
                  onChange={(event) => setPaymentDraft((prev) => ({ ...prev, isCredit: event.target.checked }))}
                />
                Credit (payment deferred)
              </label>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={closePaymentModal}
                disabled={!!updatingOrderId}
                className="inline-flex items-center rounded-full border border-[var(--color-border)] px-4 py-2 text-xs font-black uppercase tracking-wider disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmPaymentAndComplete}
                disabled={!!updatingOrderId}
                className="inline-flex items-center rounded-full border border-[var(--color-primary)] bg-[var(--color-primary)] text-white px-4 py-2 text-xs font-black uppercase tracking-wider disabled:opacity-50"
              >
                {updatingOrderId === paymentModalOrder.id ? 'Completing…' : 'Capture & Complete'}
              </button>
            </div>
          </div>
        </div>
      )}
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-serif">{title}</h2>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilters((prev) => ({ ...prev, activeOnly: !prev.activeOnly }))}
            className={`px-3 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors ${
              filters.activeOnly
                ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                : 'bg-white text-[var(--color-text)] border-[var(--color-border)]'
            }`}
          >
            {filters.activeOnly ? 'Active' : 'All'}
          </button>
          <button
            onClick={() => setShowFilters(prev => !prev)}
            className={`px-3 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors ${
              showFilters ? 'bg-[var(--color-primary)]/10 border-[var(--color-primary)]/30 text-[var(--color-primary)]' : 'bg-white border-[var(--color-border)]'
            }`}
          >
            <Search className="w-3 h-3" />
          </button>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-primary)]">
            {filteredOrders.length}
          </span>
        </div>
      </header>

      {showFilters && (
      <section className="rounded-[20px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3 space-y-3">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Section</span>
            <select
              value={filters.status}
              onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value as QueueStatusFilter }))}
              className="w-full rounded-[18px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3 text-sm"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Date Range</span>
            <select
              value={filters.dateRange}
              onChange={(event) => setFilters((prev) => ({ ...prev, dateRange: event.target.value as QueueDateRange }))}
              className="w-full rounded-[18px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3 text-sm"
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="last_7_days">Last 7 Days</option>
              <option value="all">All</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Service Mode</span>
            <select
              value={filters.serviceMode}
              onChange={(event) => setFilters((prev) => ({ ...prev, serviceMode: event.target.value as QueueFilters['serviceMode'] }))}
              className="w-full rounded-[18px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3 text-sm"
            >
              <option value="all">All</option>
              <option value="pickup">Pickup</option>
              <option value="dine_in">Dine-In</option>
              <option value="delivery">Delivery</option>
            </select>
          </label>

          {isFrontScope(scope) ? (
            scope === 'front_service' ? (
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Station</span>
                <select
                  value={filters.station}
                  onChange={(event) => setFilters((prev) => ({ ...prev, station: event.target.value as QueueFilters['station'] }))}
                  className="w-full rounded-[18px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3 text-sm"
                >
                  <option value="all">All</option>
                  <option value="kitchen">Kitchen</option>
                  <option value="barista">Barista</option>
                </select>
              </label>
            ) : (
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Lane</span>
                <div className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3 text-sm">
                  Bakery Front
                </div>
              </div>
            )
          ) : (
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Station</span>
              <div className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3 text-sm">
                {getPrepStationLabel(scope)}
              </div>
            </div>
          )}

          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Search</span>
            <div className="flex items-center gap-2 rounded-[18px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3">
              <Search className="w-4 h-4 text-[var(--color-text-muted)]" />
              <input
                value={filters.search}
                onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                placeholder="Customer, phone, or order ID"
                className="w-full bg-transparent py-3 text-sm outline-none"
              />
            </div>
          </label>
        </div>
      </section>
      )}

      {error && (
        <div className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-[11px] text-red-700 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="rounded-[20px] border border-green-200 bg-green-50 px-4 py-3 text-[11px] text-green-700">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="py-16 flex flex-col items-center gap-4 text-[var(--color-text-muted)]">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
          <p className="text-sm">Loading live orders...</p>
        </div>
      ) : sections.length === 0 ? (
        (() => {
          const { title: emptyTitle, description: emptyDesc } = getEmptyStateContent();
          return (
            <div className="bg-[var(--color-bg)] border-2 border-dashed border-[var(--color-border)] rounded-[40px] p-10 text-center space-y-3">
              <ShoppingBag className="w-8 h-8 mx-auto text-[var(--color-primary)]" />
              <h3 className="text-xl font-serif">{emptyTitle}</h3>
              <p className="text-sm text-[var(--color-text-muted)]">{emptyDesc}</p>
            </div>
          );
        })()
      ) : (
        <div className="space-y-8">
          {sections.map((section) => {
            const isCollapsed = section.key in collapsedSections ? collapsedSections[section.key] : getDefaultSectionCollapsed(section.key);

            return (
              <section key={section.key} className="space-y-3">
                <button
                  onClick={() => toggleSection(section.key)}
                  className={`w-full rounded-[20px] border px-4 py-3 text-left transition-colors ${getSectionColor(section.key)}`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${getSectionDot(section.key)}`} />
                      <h3 className="text-base font-black uppercase tracking-wider">{section.title}</h3>
                      <span className="text-[10px] font-black uppercase tracking-widest opacity-70">
                        {section.orders.length}
                      </span>
                    </div>
                    <div className="opacity-60">
                      {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                    </div>
                  </div>
                </button>

                {!isCollapsed && (
                  <div className="space-y-4">
                    {section.orders.map((order) => {
                      const involvedStations = deriveInvolvedStations(order, menuItems);
                      const elapsed = getElapsedMeta(order.createdAt);
                      const relevantTasks = isFrontScope(scope) ? [] : getRelevantOrderTasks(order, scope, menuItems);
                      const isExpanded = !!expandedOrderIds[order.id];
                      const currentStationRecord = isFrontScope(scope) ? null : getStationRecord(order, scope);
                      const canComplete = canCompleteOrder(order, menuItems);
                      const hasStationWorkflow = involvedStations.length > 0;
                      const stationRejections = involvedStations
                        .map((station) => ({
                          station,
                          reason: getStationRejectionReason(order, station),
                        }))
                        .filter((entry): entry is { station: PrepStation; reason: string } => !!entry.reason);
                      const rejectionKey = isFrontScope(scope) ? null : getRejectingKey(order.id, scope);
                      const showRejectForm = rejectionKey !== null && rejectingKey === rejectionKey;
                      const rejectionDraft = rejectionKey ? rejectionDrafts[rejectionKey] || '' : '';
                      const primaryStationAction =
                        currentStationRecord?.status === 'queued'
                          ? { label: 'Accept Task', action: 'accept' as const }
                          : currentStationRecord?.status === 'accepted'
                            ? { label: 'Start Preparing', action: 'preparing' as const }
                            : currentStationRecord?.status === 'preparing'
                              ? { label: 'Mark Ready', action: 'ready' as const }
                              : null;
                      const canRejectStationWork =
                        currentStationRecord?.status === 'queued' ||
                        currentStationRecord?.status === 'accepted' ||
                        currentStationRecord?.status === 'preparing';
                      const isPendingFrontAcceptance = isFrontScope(scope) && order.status === 'pending';
                      const pendingDispatchCopy =
                        scope === 'bakery_front_service'
                          ? 'Accept this bakery order to move it to handover, or to dispatch any future made-to-order station prep.'
                          : 'Prep stations have not been dispatched yet. Station cards appear only after front service accepts the order.';

                      return (
                        <article key={order.id} className="bg-white rounded-[24px] border border-[var(--color-border)] shadow-sm overflow-hidden p-4 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className={`shrink-0 px-4 py-2 rounded-xl text-lg font-black leading-none ${getUrgencyClasses(elapsed.tone)}`}>
                                {elapsed.label}
                              </span>
                              <span className="text-sm font-semibold text-[var(--color-text)] truncate">
                                {isFrontScope(scope)
                                  ? getOrderActionHint(order, involvedStations)
                                  : getStationActionHint(currentStationRecord?.status)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="px-2.5 py-1 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] text-[10px] font-black uppercase tracking-widest">
                                {isFrontScope(scope)
                                  ? formatOrderStatus(order.status)
                                  : (currentStationRecord ? formatStationStatus(currentStationRecord.status) : 'Awaiting dispatch')}
                              </span>
                              <button
                                onClick={() => toggleExpanded(order.id)}
                                className="text-[var(--color-text-muted)]"
                                aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                              >
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>

                          {!isExpanded && isFrontScope(scope) && order.status === 'pending' && (
                            <button
                              onClick={() => handleFrontServiceAccept(order)}
                              disabled={updatingOrderId === order.id}
                              className="w-full px-4 py-3.5 rounded-[16px] text-[11px] font-black uppercase tracking-widest bg-[var(--color-primary)] text-white disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {updatingOrderId === order.id ? 'Accepting…' : 'Accept Order'}
                            </button>
                          )}
                          {!isExpanded && isFrontScope(scope) && order.status === 'ready_for_handover' && (
                            <button
                              onClick={() => handleFrontServiceComplete(order)}
                              disabled={!canComplete || updatingOrderId === order.id}
                              className="w-full px-4 py-3.5 rounded-[16px] text-[11px] font-black uppercase tracking-widest bg-[var(--color-primary)] text-white disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {updatingOrderId === order.id ? 'Completing…' : 'Mark Complete'}
                            </button>
                          )}
                          {!isExpanded && !isFrontScope(scope) && primaryStationAction && (
                            <button
                              onClick={() => handleStationAction(order, scope as PrepStation, primaryStationAction.action)}
                              disabled={updatingOrderId === order.id}
                              className="w-full px-4 py-3.5 rounded-[16px] text-[11px] font-black uppercase tracking-widest bg-[var(--color-primary)] text-white disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {updatingOrderId === order.id ? 'Updating…' : primaryStationAction.label}
                            </button>
                          )}

                          <div className="flex items-end justify-between gap-3">
                            <div className="min-w-0 space-y-0.5">
                              <p className="font-semibold text-[var(--color-text)] flex items-center gap-1.5 min-w-0">
                                <UserRound className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0" />
                                <span className="truncate">{order.customer.name || order.assistedCustomerName || 'Walk-in'}</span>
                              </p>
                              {isFrontScope(scope) && (order.customer.phone || order.assistedCustomerPhoneNormalized) && (
                                <p className="text-xs text-[var(--color-text-muted)] flex items-center gap-1 pl-5 truncate">
                                  <Phone className="w-3 h-3 shrink-0" />
                                  <span className="truncate">{order.customer.phone || order.assistedCustomerPhoneNormalized}</span>
                                </p>
                              )}
                              <p className="text-xs text-[var(--color-text-muted)] capitalize pl-5">
                                {isFrontScope(scope)
                                  ? formatServiceMode(order.serviceMode)
                                  : `${relevantTasks.length} ${relevantTasks.length === 1 ? 'task' : 'tasks'} · ${formatServiceMode(order.serviceMode)}`}
                              </p>
                              {(order.orderEntryMode === 'staff_assisted' || order.createdByStaffUid) && (
                                <div className="pl-5 pt-1 flex flex-wrap gap-1.5">
                                  <span className="rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] px-2 py-0.5 text-[9px] font-black uppercase tracking-wider">
                                    Staff Assisted
                                  </span>
                                  {order.orderSource && (
                                    <span className="rounded-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">
                                      {order.orderSource.replace('_', ' ')}
                                    </span>
                                  )}
                                  {order.checkoutPaymentChoice && (
                                    <span className="rounded-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">
                                      Checkout: {order.checkoutPaymentChoice.replace('_', ' ')}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-base font-serif text-[var(--color-primary)]">{formatCurrency(order.total)}</p>
                              <p className="text-[10px] text-[var(--color-text-muted)]">#{order.id.slice(-5)} · {formatTimeOnly(order.createdAt)}</p>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="border-t border-[var(--color-border)] pt-4 space-y-5 bg-[var(--color-bg)]/60">
                              {isFrontScope(scope) && (
                                isPendingFrontAcceptance ? (
                                  <section className="rounded-[24px] border border-[var(--color-border)] bg-white px-4 py-4 space-y-2">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Dispatch</p>
                                    <p className="font-semibold">Awaiting front acceptance</p>
                                    <p className="text-sm text-[var(--color-text-muted)]">
                                      {pendingDispatchCopy}
                                    </p>
                                  </section>
                                ) : (
                                  <section className="space-y-3">
                                    {(order.frontAcceptedBy || order.completedBy) && (
                                      <div className="rounded-[24px] border border-[var(--color-border)] bg-white px-4 py-3 space-y-1">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Staff handling</p>
                                        {order.createdByStaffName && (
                                          <p className="text-sm text-[var(--color-text-muted)]">Created by {order.createdByStaffName}</p>
                                        )}
                                        {order.frontAcceptedBy && (
                                          <p className="text-sm text-[var(--color-text-muted)]">Accepted by {order.frontAcceptedBy.displayName}</p>
                                        )}
                                        {order.completedBy && (
                                          <p className="text-sm text-[var(--color-text-muted)]">Completed by {order.completedBy.displayName}</p>
                                        )}
                                      </div>
                                    )}
                                    {hasStationWorkflow ? (
                                      <>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Stations involved</p>
                                      <div className="grid gap-3">
                                        {involvedStations.map((station) => {
                                          const stationRecord = getStationRecord(order, station);
                                          const rejectionReason = getStationRejectionReason(order, station);
                                          return (
                                            <div key={station} className="rounded-[24px] border border-[var(--color-border)] bg-white px-4 py-3 space-y-2">
                                              <div className="flex items-center justify-between gap-3">
                                                <p className="font-semibold">{getPrepStationLabel(station)}</p>
                                                <span className="px-3 py-1 rounded-full bg-[var(--color-primary)]/5 text-[10px] font-black uppercase tracking-widest border border-[var(--color-primary)]/10">
                                                  {stationRecord ? formatStationStatus(stationRecord.status) : 'Awaiting dispatch'}
                                                </span>
                                              </div>
                                              <p className="text-xs text-[var(--color-text-muted)]">
                                                {rejectionReason
                                                  ? 'This station rejected the work.'
                                                  : stationRecord?.status === 'ready'
                                                    ? 'This station is ready for handover.'
                                                    : stationRecord?.status === 'preparing'
                                                      ? 'This station is actively preparing the order.'
                                                      : stationRecord?.status === 'accepted'
                                                        ? 'This station has accepted the work and has not started prep yet.'
                                                        : stationRecord?.status === 'queued'
                                                          ? 'This station has not accepted the work yet.'
                                                      : 'Waiting for station update.'}
                                              </p>
                                              {(stationRecord?.acceptedBy || stationRecord?.preparingBy || stationRecord?.readyBy || stationRecord?.rejectedBy) && (
                                                <div className="space-y-1 text-xs text-[var(--color-text-muted)]">
                                                  {stationRecord?.acceptedBy && <p>Accepted by {stationRecord.acceptedBy.displayName}</p>}
                                                  {stationRecord?.preparingBy && <p>Preparing by {stationRecord.preparingBy.displayName}</p>}
                                                  {stationRecord?.readyBy && <p>Ready by {stationRecord.readyBy.displayName}</p>}
                                                  {stationRecord?.rejectedBy && <p>Rejected by {stationRecord.rejectedBy.displayName}</p>}
                                                </div>
                                              )}
                                              {rejectionReason && (
                                                <p className="text-sm text-red-700">
                                                  <span className="font-semibold">Reason:</span> {rejectionReason}
                                                </p>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                      </>
                                    ) : (
                                      <div className="rounded-[24px] border border-[var(--color-border)] bg-white px-4 py-3 space-y-1">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Front-only dispatch</p>
                                        <p className="text-sm text-[var(--color-text-muted)]">
                                          This order does not require kitchen or barista prep and can move directly to handover.
                                        </p>
                                      </div>
                                    )}
                                  </section>
                                )
                              )}

                              {!isFrontScope(scope) && currentStationRecord && (
                                <section className="rounded-[24px] border border-[var(--color-border)] bg-white px-4 py-3 space-y-1">
                                  <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">{getPrepStationLabel(scope)} activity</p>
                                  {currentStationRecord.acceptedBy && (
                                    <p className="text-sm text-[var(--color-text-muted)]">Accepted by {currentStationRecord.acceptedBy.displayName}</p>
                                  )}
                                  {currentStationRecord.preparingBy && (
                                    <p className="text-sm text-[var(--color-text-muted)]">Preparing by {currentStationRecord.preparingBy.displayName}</p>
                                  )}
                                  {currentStationRecord.readyBy && (
                                    <p className="text-sm text-[var(--color-text-muted)]">Ready by {currentStationRecord.readyBy.displayName}</p>
                                  )}
                                  {currentStationRecord.rejectedBy && (
                                    <p className="text-sm text-[var(--color-text-muted)]">Rejected by {currentStationRecord.rejectedBy.displayName}</p>
                                  )}
                                </section>
                              )}

                              {stationRejections.length > 0 && (
                                <section className="rounded-[24px] border border-red-200 bg-red-50 px-4 py-3 space-y-2">
                                  <p className="text-[10px] font-black uppercase tracking-widest text-red-700">Rejection</p>
                                  {stationRejections.map(({ station, reason }) => (
                                    <p key={station} className="text-sm text-red-700">
                                      <span className="font-semibold">{getPrepStationLabel(station)}:</span> {reason}
                                    </p>
                                  ))}
                                </section>
                              )}

                              <section className="space-y-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">
                                  {isFrontScope(scope) ? 'Items' : 'Station work'}
                                </p>
                                <div className="space-y-3">
                                  {isFrontScope(scope)
                                    ? order.items.map((item, index) => (
                                        <div key={`${order.id}-${item.itemId}-${index}`} className="rounded-[24px] border border-[var(--color-border)] bg-white px-4 py-3">
                                          <div className="flex items-start justify-between gap-4">
                                            <div>
                                              <p className="font-semibold">{item.itemName}</p>
                                              <p className="text-[11px] text-[var(--color-text-muted)]">Qty {item.quantity}</p>
                                            </div>
                                            <p className="font-black text-[var(--color-primary)]">{formatCurrency(item.lineTotal)}</p>
                                          </div>
                                          {item.selectedOptions.length > 0 && (
                                            <div className="mt-3 flex flex-wrap gap-2">
                                              {item.selectedOptions.map((option) => (
                                                <span key={option} className="px-2.5 py-1 rounded-full bg-[var(--color-primary)]/5 text-[10px] font-bold text-[var(--color-text)] border border-[var(--color-primary)]/10">
                                                  {option}
                                                </span>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      ))
                                    : relevantTasks.map((task) => (
                                        <div key={task.taskId} className="rounded-[24px] border border-[var(--color-border)] bg-white px-4 py-3">
                                          <div className="flex items-start justify-between gap-4">
                                            <div>
                                              <p className="font-semibold">{task.taskName}</p>
                                              <p className="text-[11px] text-[var(--color-text-muted)]">Qty {task.quantity}</p>
                                            </div>
                                            <p className="text-[11px] font-black uppercase tracking-widest text-[var(--color-primary)]">
                                              {getPrepStationLabel(task.prepStation)}
                                            </p>
                                          </div>
                                          <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
                                            From {task.sourceItemName}
                                          </p>
                                          {task.selectedOptions.length > 0 && (
                                            <div className="mt-3 flex flex-wrap gap-2">
                                              {task.selectedOptions.map((option) => (
                                                <span key={`${task.taskId}-${option}`} className="px-2.5 py-1 rounded-full bg-[var(--color-primary)]/5 text-[10px] font-bold text-[var(--color-text)] border border-[var(--color-primary)]/10">
                                                  {option}
                                                </span>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                </div>
                              </section>

                              <section className="rounded-[24px] bg-white border border-[var(--color-border)] px-4 py-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] mb-1">Notes</p>
                                <p className="text-[var(--color-text)]">{order.notes || 'No notes'}</p>
                              </section>

                              {isFrontScope(scope) ? (
                                <section className="space-y-3">
                                  <div className="grid grid-cols-2 gap-3">
                                    <button
                                      onClick={() => handleFrontServiceAccept(order)}
                                      disabled={order.status !== 'pending' || updatingOrderId === order.id}
                                      className="px-4 py-3 rounded-[20px] text-[11px] font-black uppercase tracking-widest border bg-[var(--color-primary)] text-white border-[var(--color-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                      Accept Order
                                    </button>
                                    <button
                                      onClick={() => handleFrontServiceComplete(order)}
                                      disabled={!canComplete || order.status !== 'ready_for_handover' || updatingOrderId === order.id}
                                      className="px-4 py-3 rounded-[20px] text-[11px] font-black uppercase tracking-widest border bg-[var(--color-primary)] text-white border-[var(--color-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                      Mark Complete
                                    </button>
                                  </div>
                                  {order.status === 'pending' && (
                                    <p className="text-xs text-[var(--color-text-muted)]">
                                      Accept this order to dispatch prep work to the required stations.
                                    </p>
                                  )}
                                  {!canComplete && order.status !== 'completed' && order.status !== 'pending' && (
                                    <p className="text-xs text-[var(--color-text-muted)]">
                                      Complete stays locked until every required station is marked ready and the order reaches ready for handover.
                                    </p>
                                  )}
                                </section>
                              ) : (
                                <section className="space-y-3">
                                  {primaryStationAction || canRejectStationWork ? (
                                    <div className="grid grid-cols-2 gap-3">
                                      <button
                                        onClick={() => primaryStationAction && handleStationAction(order, scope, primaryStationAction.action)}
                                        disabled={!primaryStationAction || updatingOrderId === order.id}
                                        className="px-4 py-3 rounded-[20px] text-[11px] font-black uppercase tracking-widest border bg-[var(--color-primary)] text-white border-[var(--color-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
                                      >
                                        {primaryStationAction?.label || 'No Action'}
                                      </button>
                                      <button
                                        onClick={() => openRejectReason(order.id, scope)}
                                        disabled={!canRejectStationWork || updatingOrderId === order.id}
                                        className="px-4 py-3 rounded-[20px] text-[11px] font-black uppercase tracking-widest border bg-red-50 text-red-700 border-red-200 disabled:opacity-40 disabled:cursor-not-allowed"
                                      >
                                        Reject
                                      </button>
                                    </div>
                                  ) : currentStationRecord?.status === 'ready' ? (
                                    <div className="rounded-[24px] border border-green-200 bg-green-50 px-4 py-3">
                                      <p className="text-sm font-semibold text-green-800">Ready</p>
                                      <p className="text-xs text-green-700">This station is done and waiting for front handover.</p>
                                    </div>
                                  ) : currentStationRecord?.status === 'rejected' ? (
                                    <div className="rounded-[24px] border border-red-200 bg-red-50 px-4 py-3">
                                      <p className="text-sm font-semibold text-red-800">Rejected</p>
                                      <p className="text-xs text-red-700">This rejected work stays visible here for follow-up.</p>
                                    </div>
                                  ) : null}

                                  {showRejectForm && (
                                    <div className="rounded-[24px] border border-red-200 bg-red-50 px-4 py-4 space-y-3">
                                      <label className="block space-y-2">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-red-700">Rejection reason</span>
                                        <textarea
                                          value={rejectionDraft}
                                          onChange={(event) => updateRejectReason(order.id, scope, event.target.value)}
                                          rows={3}
                                          className="w-full rounded-[18px] border border-red-200 bg-white px-4 py-3 text-sm text-[var(--color-text)] outline-none focus:border-red-400"
                                          placeholder={`Why is ${getPrepStationLabel(scope)} rejecting this work?`}
                                        />
                                      </label>
                                      <div className="grid grid-cols-2 gap-3">
                                        <button
                                          onClick={() => handleStationAction(order, scope, 'reject')}
                                          disabled={!rejectionDraft.trim() || updatingOrderId === order.id}
                                          className="px-4 py-3 rounded-[20px] text-[11px] font-black uppercase tracking-widest border bg-red-700 text-white border-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                          Confirm Reject
                                        </button>
                                        <button
                                          onClick={() => cancelRejectReason(order.id, scope)}
                                          disabled={updatingOrderId === order.id}
                                          className="px-4 py-3 rounded-[20px] text-[11px] font-black uppercase tracking-widest border bg-white text-[var(--color-text)] border-[var(--color-border)] disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </section>
                              )}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};
