import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { AlertCircle, ChevronDown, ChevronUp, Clock3, Loader2, PackageCheck, Phone, Search, ShoppingBag, UserRound } from 'lucide-react';
import { db } from '../lib/firebase';
import {
  buildFrontServiceAcceptUpdate,
  buildOptimisticCompletionState,
  buildOptimisticFrontServiceAcceptState,
  canCompleteOrder,
  deriveInvolvedStations,
  formatOrderStatus,
  formatStationStatus,
  getPrepStationLabel,
  getStationRecord,
  getStationRejectionReason,
  LiveOrder,
  normalizeLiveOrder,
  toStaffIdentity,
} from '../lib/orderRouting';
import { getStaleAgeDays, isStaleOrder, resolveOrderBusinessDate } from '../lib/orderDayLifecycle';
import { formatBusinessDateDisplay, parseBusinessDateInput, toBusinessDate } from '../lib/businessDate';
import { AppUserRecord, MenuItem, OrderServiceMode, OrderStatus, PrepStation } from '../types';
import { useRestaurantData } from '../hooks/useFirestore';

interface AdminOrdersViewProps {
  isAdmin: boolean;
  currentStaff: AppUserRecord | null;
}

interface AdminSection {
  key: OrderStatus;
  title: string;
  description: string;
  orders: LiveOrder[];
}

type QueueDateRange = 'today' | 'yesterday' | 'last_7_days' | 'all';

interface AdminFilters {
  status: 'all' | OrderStatus;
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

function getSectionStorageKey(): string {
  return 'staff-queue-sections:admin';
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

  if (range === 'today') return date >= startOfToday && date < startOfTomorrow;
  if (range === 'yesterday') return date >= startOfYesterday && date < startOfToday;
  return date >= last7DaysStart && date < startOfTomorrow;
}

function hasStationQueueVisibility(order: LiveOrder, station: PrepStation, menuItems: MenuItem[]): boolean {
  if (!deriveInvolvedStations(order, menuItems).includes(station)) return false;
  const stationRecord = getStationRecord(order, station);
  if (!stationRecord) return false;
  return stationRecord.status === 'queued' ||
    stationRecord.status === 'accepted' ||
    stationRecord.status === 'preparing' ||
    stationRecord.status === 'ready' ||
    stationRecord.status === 'rejected';
}

function groupOrders(orders: LiveOrder[]): AdminSection[] {
  const sections: Array<{ key: OrderStatus; title: string; description: string }> = [
    { key: 'pending', title: 'Pending Acceptance', description: 'New orders waiting for front review.' },
    { key: 'front_accepted', title: 'Waiting On Stations', description: 'Accepted by front and dispatched, but stations have not started prep.' },
    { key: 'in_progress', title: 'In Progress', description: 'At least one station is actively handling the order.' },
    { key: 'ready_for_handover', title: 'Ready For Handover', description: 'All required stations are ready and front can complete.' },
    { key: 'rejected', title: 'Rejected', description: 'A required station rejected the order and needs attention.' },
    { key: 'completed', title: 'Completed', description: 'Finished orders kept visible for operational reference.' },
  ];

  return sections
    .map((section) => ({
      ...section,
      orders: orders.filter((order) => order.status === section.key),
    }))
    .filter((section) => section.orders.length > 0);
}

export const AdminOrdersView: React.FC<AdminOrdersViewProps> = ({ isAdmin, currentStaff }) => {
  const [orders, setOrders] = useState<LiveOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedOrderIds, setExpandedOrderIds] = useState<Record<string, boolean>>({});
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const stored = window.sessionStorage.getItem(getSectionStorageKey());
      return stored ? JSON.parse(stored) as Record<string, boolean> : {};
    } catch {
      return {};
    }
  });
  const [filters, setFilters] = useState<AdminFilters>({
    status: 'all',
    dateRange: 'all',
    serviceMode: 'all',
    station: 'all',
    search: '',
    activeOnly: true,
  });
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [showPilotPanel, setShowPilotPanel] = useState(false);
  const [pilotBusinessDate, setPilotBusinessDate] = useState<string>(() => toBusinessDate());
  const [pilotBakeryReconciliationExists, setPilotBakeryReconciliationExists] = useState(false);
  const [pilotCafeReconciliationExists, setPilotCafeReconciliationExists] = useState(false);
  const { menuItems } = useRestaurantData();
  const actingStaff = useMemo(() => toStaffIdentity(currentStaff), [currentStaff]);
  const activeBusinessDate = toBusinessDate();
  const activeBusinessDateLabel = formatBusinessDateDisplay(activeBusinessDate);
  const pilotBusinessDateLabel = formatBusinessDateDisplay(pilotBusinessDate);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(getSectionStorageKey(), JSON.stringify(collapsedSections));
  }, [collapsedSections]);

  useEffect(() => {
    if (!isAdmin) {
      setOrders([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
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
        console.error('Failed to subscribe to orders:', snapshotError);
        setError('Could not load orders right now.');
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      setPilotBakeryReconciliationExists(false);
      setPilotCafeReconciliationExists(false);
      return;
    }

    const unsubBakery = onSnapshot(doc(db, 'bakeryDailyReconciliation', pilotBusinessDate), (snapshot) => {
      setPilotBakeryReconciliationExists(snapshot.exists());
    });
    const unsubCafe = onSnapshot(doc(db, 'cafeDailyReconciliation', pilotBusinessDate), (snapshot) => {
      setPilotCafeReconciliationExists(snapshot.exists());
    });

    return () => {
      unsubBakery();
      unsubCafe();
    };
  }, [isAdmin, pilotBusinessDate]);

  const staleOrders = useMemo(
    () => orders.filter((order) => isStaleOrder(order, activeBusinessDate)),
    [orders, activeBusinessDate]
  );

  const pilotDayOrders = useMemo(
    () => orders.filter((order) => resolveOrderBusinessDate(order) === pilotBusinessDate),
    [orders, pilotBusinessDate]
  );

  const activeDayOrders = useMemo(
    () => orders.filter((order) => resolveOrderBusinessDate(order) === activeBusinessDate),
    [orders, activeBusinessDate]
  );

  const pilotSummary = useMemo(() => {
    const statusCounts = pilotDayOrders.reduce(
      (acc, order) => {
        acc[order.status] = (acc[order.status] || 0) + 1;
        return acc;
      },
      {} as Record<OrderStatus, number>
    );

    const totalKitchenVisible = pilotDayOrders.filter((order) => hasStationQueueVisibility(order, 'kitchen', menuItems)).length;
    const totalBaristaVisible = pilotDayOrders.filter((order) => hasStationQueueVisibility(order, 'barista', menuItems)).length;
    const totalFrontVisible = pilotDayOrders.filter((order) => order.frontLane !== 'bakery_front' && order.status !== 'completed' && order.status !== 'rejected').length;
    const totalBakeryFrontVisible = pilotDayOrders.filter((order) => order.frontLane === 'bakery_front' && order.status !== 'completed' && order.status !== 'rejected').length;

    return {
      totalCafeOrders: pilotDayOrders.filter((order) => order.serviceArea === 'cafe').length,
      totalBakeryOrders: pilotDayOrders.filter((order) => order.serviceArea === 'bakery').length,
      totalCompleted: statusCounts.completed || 0,
      totalPending: statusCounts.pending || 0,
      totalReadyForHandover: statusCounts.ready_for_handover || 0,
      totalRejected: statusCounts.rejected || 0,
      totalStaleUnresolved: orders.filter((order) => isStaleOrder(order, pilotBusinessDate)).length,
      totalKitchenVisible,
      totalBaristaVisible,
      totalFrontVisible,
      totalBakeryFrontVisible,
    };
  }, [menuItems, orders, pilotBusinessDate, pilotDayOrders]);

  const queueIntegrity = useMemo(() => {
    const terminalVisibleInStationQueue = orders.some((order) =>
      (order.status === 'completed' || order.status === 'rejected') &&
      (hasStationQueueVisibility(order, 'kitchen', menuItems) || hasStationQueueVisibility(order, 'barista', menuItems))
    );

    const staleIds = new Set(staleOrders.map((order) => order.id));
    const staleVisibleInActiveDayQueue = activeDayOrders.some((order) => staleIds.has(order.id));

    const terminalWithLingeringStationState = orders.some((order) =>
      (order.status === 'completed' || order.status === 'rejected') &&
      (
        (order.involvedStations?.length || 0) > 0 ||
        Object.keys(order.stationStatus || {}).length > 0
      )
    );

    const reconciliationMissingForOpenedDate = !pilotBakeryReconciliationExists || !pilotCafeReconciliationExists;

    return {
      terminalVisibleInStationQueue,
      staleVisibleInActiveDayQueue,
      terminalWithLingeringStationState,
      reconciliationMissingForOpenedDate,
    };
  }, [
    activeDayOrders,
    menuItems,
    orders,
    pilotBakeryReconciliationExists,
    pilotCafeReconciliationExists,
    staleOrders,
  ]);

  const filteredOrders = useMemo(() => {
    const searchTerm = filters.search.trim().toLowerCase();

    return activeDayOrders.filter((order) => {
      if (filters.status !== 'all' && order.status !== filters.status) return false;
      if (filters.serviceMode !== 'all' && order.serviceMode !== filters.serviceMode) return false;
      if (!isDateInRange(order.createdAt, filters.dateRange)) return false;

      if (filters.station !== 'all' && !deriveInvolvedStations(order, menuItems).includes(filters.station)) {
        return false;
      }

      if (filters.activeOnly) {
        if (order.status === 'completed') return false;
        if (order.status === 'rejected' && filters.status !== 'rejected') return false;
      }

      if (searchTerm) {
        const searchHaystack = [order.id, order.customer.name, order.customer.phone].join(' ').toLowerCase();
        if (!searchHaystack.includes(searchTerm)) return false;
      }

      return true;
    });
  }, [activeDayOrders, filters, menuItems]);

  const sections = useMemo(() => groupOrders(filteredOrders), [filteredOrders]);
  const orderCountLabel = useMemo(() => `${filteredOrders.length} ${filteredOrders.length === 1 ? 'order' : 'orders'}`, [filteredOrders.length]);

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

  const handleFrontAccept = async (order: LiveOrder) => {
    if (!isAdmin || updatingOrderId) return;

    try {
      setUpdatingOrderId(order.id);
      setError(null);
      patchOrderLocally(order.id, buildOptimisticFrontServiceAcceptState(order, menuItems, actingStaff));
      await updateDoc(doc(db, 'orders', order.id), buildFrontServiceAcceptUpdate(order, menuItems, actingStaff));
    } catch (updateError) {
      console.error('Failed to accept order:', updateError);
      setError('Order update failed. Please try again.');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleComplete = async (order: LiveOrder) => {
    if (!isAdmin || updatingOrderId) return;

    try {
      setUpdatingOrderId(order.id);
      setError(null);
      patchOrderLocally(order.id, buildOptimisticCompletionState(actingStaff));
      await updateDoc(doc(db, 'orders', order.id), {
        status: 'completed',
        completedBy: actingStaff,
        updatedAt: serverTimestamp(),
      });
    } catch (updateError) {
      console.error('Failed to complete order:', updateError);
      setError('Order update failed. Please try again.');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleRecoverComplete = async (order: LiveOrder) => {
    if (!isAdmin || updatingOrderId) return;
    if (!canCompleteOrder(order, menuItems) || order.status !== 'ready_for_handover') {
      setError('Stale order can only be completed when all required stations are ready for handover.');
      return;
    }

    const originalBusinessDate = resolveOrderBusinessDate(order);

    try {
      setUpdatingOrderId(order.id);
      setError(null);
      patchOrderLocally(order.id, buildOptimisticCompletionState(actingStaff));
      await updateDoc(doc(db, 'orders', order.id), {
        status: 'completed',
        completedBy: actingStaff,
        involvedStations: [],
        stationStatus: {},
        recoveryAction: 'stale_complete',
        recoveryReason: 'stale_recovery_complete',
        recoveryUpdatedAt: serverTimestamp(),
        recoveryUpdatedBy: actingStaff,
        ...(originalBusinessDate ? { originalBusinessDate } : {}),
        updatedAt: serverTimestamp(),
      });
    } catch (updateError) {
      console.error('Failed to complete stale order:', updateError);
      setError('Stale recovery completion failed. Please try again.');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleRecoverCancel = async (order: LiveOrder) => {
    if (!isAdmin || updatingOrderId) return;
    const originalBusinessDate = resolveOrderBusinessDate(order);

    try {
      setUpdatingOrderId(order.id);
      setError(null);
      patchOrderLocally(order.id, {
        status: 'rejected',
        updatedAt: new Date(),
      });
      await updateDoc(doc(db, 'orders', order.id), {
        status: 'rejected',
        accountingTreatment: 'cancelled',
        accountingReasonCode: 'other',
        accountingReasonNote: 'Cancelled from stale recovery queue.',
        involvedStations: [],
        stationStatus: {},
        accountingUpdatedAt: serverTimestamp(),
        accountingUpdatedBy: actingStaff,
        resolution: 'forced_close',
        resolutionReason: 'stale_recovery_cancel',
        resolutionUpdatedAt: serverTimestamp(),
        resolutionUpdatedBy: actingStaff,
        recoveryAction: 'stale_cancel',
        recoveryReason: 'stale_recovery_cancel',
        recoveryUpdatedAt: serverTimestamp(),
        recoveryUpdatedBy: actingStaff,
        ...(originalBusinessDate ? { originalBusinessDate } : {}),
        updatedAt: serverTimestamp(),
      });
    } catch (updateError) {
      console.error('Failed to cancel stale order:', updateError);
      setError('Stale recovery cancel failed. Please try again.');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="px-4 py-12 space-y-6 text-center">
        <div className="w-16 h-16 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl font-serif">Admin Only</h2>
          <p className="text-sm text-[var(--color-text-muted)]">You do not have permission to view live orders.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-8 space-y-6 pb-28">
      <header className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-serif">Admin Orders</h2>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-primary)]">{orderCountLabel}</span>
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">All orders grouped by operational status.</p>
      </header>

      <section className="rounded-[24px] border border-[var(--color-border)] bg-white px-4 py-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest">Pilot Smoke-Test Support</h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              Admin-only stabilization checks for {pilotBusinessDateLabel} (active day: {activeBusinessDateLabel}).
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPilotPanel((prev) => !prev)}
            className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-bold uppercase tracking-wider"
          >
            {showPilotPanel ? 'Hide' : 'Show'} Pilot Panel
          </button>
        </div>

        {showPilotPanel && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]" htmlFor="pilot-business-date">Pilot Date</label>
              <input
                id="pilot-business-date"
                type="date"
                value={pilotBusinessDate}
                onChange={(event) => setPilotBusinessDate(parseBusinessDateInput(event.target.value, pilotBusinessDate))}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
              />
              <span className="text-xs font-semibold text-[var(--color-text-muted)]">{pilotBusinessDateLabel}</span>
            </div>

            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4 text-xs">
              <div className="rounded-xl border border-[var(--color-border)] px-3 py-2">Cafe reconciliation: <strong>{pilotCafeReconciliationExists ? 'Available' : 'Missing for date'}</strong></div>
              <div className="rounded-xl border border-[var(--color-border)] px-3 py-2">Bakery reconciliation: <strong>{pilotBakeryReconciliationExists ? 'Available' : 'Missing for date'}</strong></div>
              <div className="rounded-xl border border-[var(--color-border)] px-3 py-2">Stale recovery queue: <strong>{isAdmin ? 'Available' : 'Unavailable'}</strong></div>
              <div className="rounded-xl border border-[var(--color-border)] px-3 py-2">Front board: <strong>{isAdmin ? 'Active' : 'Unavailable'}</strong></div>
              <div className="rounded-xl border border-[var(--color-border)] px-3 py-2">Bakery front board: <strong>{isAdmin ? 'Active' : 'Unavailable'}</strong></div>
              <div className="rounded-xl border border-[var(--color-border)] px-3 py-2">Kitchen board: <strong>{isAdmin ? 'Active' : 'Unavailable'}</strong></div>
              <div className="rounded-xl border border-[var(--color-border)] px-3 py-2">Barista board: <strong>{isAdmin ? 'Active' : 'Unavailable'}</strong></div>
            </div>

            <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6 text-xs">
              <div className="rounded-xl border border-[var(--color-border)] px-3 py-2">Cafe orders: <strong>{pilotSummary.totalCafeOrders}</strong></div>
              <div className="rounded-xl border border-[var(--color-border)] px-3 py-2">Bakery orders: <strong>{pilotSummary.totalBakeryOrders}</strong></div>
              <div className="rounded-xl border border-[var(--color-border)] px-3 py-2">Completed: <strong>{pilotSummary.totalCompleted}</strong></div>
              <div className="rounded-xl border border-[var(--color-border)] px-3 py-2">Pending: <strong>{pilotSummary.totalPending}</strong></div>
              <div className="rounded-xl border border-[var(--color-border)] px-3 py-2">Ready for handover: <strong>{pilotSummary.totalReadyForHandover}</strong></div>
              <div className="rounded-xl border border-[var(--color-border)] px-3 py-2">Rejected: <strong>{pilotSummary.totalRejected}</strong></div>
              <div className="rounded-xl border border-[var(--color-border)] px-3 py-2">Stale unresolved: <strong>{pilotSummary.totalStaleUnresolved}</strong></div>
              <div className="rounded-xl border border-[var(--color-border)] px-3 py-2">Kitchen visible: <strong>{pilotSummary.totalKitchenVisible}</strong></div>
              <div className="rounded-xl border border-[var(--color-border)] px-3 py-2">Barista visible: <strong>{pilotSummary.totalBaristaVisible}</strong></div>
              <div className="rounded-xl border border-[var(--color-border)] px-3 py-2">Front visible: <strong>{pilotSummary.totalFrontVisible}</strong></div>
              <div className="rounded-xl border border-[var(--color-border)] px-3 py-2">Bakery front visible: <strong>{pilotSummary.totalBakeryFrontVisible}</strong></div>
            </div>

            <div className="rounded-xl border border-[var(--color-border)] px-3 py-3 text-xs space-y-1">
              <p className="font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Queue Integrity Checks</p>
              <p>Terminal order still visible in station queue: <strong>{queueIntegrity.terminalVisibleInStationQueue ? 'Issue' : 'OK'}</strong></p>
              <p>Stale order visible in active-day queue: <strong>{queueIntegrity.staleVisibleInActiveDayQueue ? 'Issue' : 'OK'}</strong></p>
              <p>Completed/rejected order with lingering station state: <strong>{queueIntegrity.terminalWithLingeringStationState ? 'Issue' : 'OK'}</strong></p>
              <p>Reconciliation doc missing for pilot date: <strong>{queueIntegrity.reconciliationMissingForOpenedDate ? 'Issue' : 'OK'}</strong></p>
            </div>

            <div className="rounded-xl border border-[var(--color-border)] px-3 py-3 text-xs space-y-1">
              <p className="font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Pilot Smoke-Test Notes</p>
              <p>1. Create cafe dine-in order.</p>
              <p>2. Create cafe pickup order.</p>
              <p>3. Create bakery ready-item order.</p>
              <p>4. Create kitchen-prep order.</p>
              <p>5. Move kitchen/barista to ready.</p>
              <p>6. Complete from front.</p>
              <p>7. Verify queues clear.</p>
              <p>8. Verify bakery reconciliation.</p>
              <p>9. Verify cafe reconciliation.</p>
              <p>10. Verify one credit/pay-later treatment.</p>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-[28px] border border-[var(--color-border)] bg-white px-4 py-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setFilters((prev) => ({ ...prev, activeOnly: !prev.activeOnly }))}
            className={`px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-widest border ${
              filters.activeOnly
                ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                : 'bg-white text-[var(--color-text)] border-[var(--color-border)]'
            }`}
          >
            {filters.activeOnly ? 'Active Only' : 'All Orders'}
          </button>
          <p className="text-xs text-[var(--color-text-muted)]">
            Future-ready hook: filter state reserves `assigneeId` for accepted-by filtering later.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Section</span>
            <select
              value={filters.status}
              onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value as AdminFilters['status'] }))}
              className="w-full rounded-[18px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3 text-sm"
            >
              <option value="all">All sections</option>
              <option value="pending">Pending</option>
              <option value="front_accepted">Front accepted</option>
              <option value="in_progress">In progress</option>
              <option value="ready_for_handover">Ready for handover</option>
              <option value="rejected">Rejected</option>
              <option value="completed">Completed</option>
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
              onChange={(event) => setFilters((prev) => ({ ...prev, serviceMode: event.target.value as AdminFilters['serviceMode'] }))}
              className="w-full rounded-[18px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3 text-sm"
            >
              <option value="all">All</option>
              <option value="pickup">Pickup</option>
              <option value="dine_in">Dine-In</option>
              <option value="delivery">Delivery</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Station</span>
            <select
              value={filters.station}
              onChange={(event) => setFilters((prev) => ({ ...prev, station: event.target.value as AdminFilters['station'] }))}
              className="w-full rounded-[18px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3 text-sm"
            >
              <option value="all">All</option>
              <option value="kitchen">Kitchen</option>
              <option value="barista">Barista</option>
            </select>
          </label>

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

      {error && (
        <div className="rounded-[28px] border border-red-200 bg-red-50 px-5 py-4 text-[11px] text-red-700 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {staleOrders.length > 0 && (
        <div className="rounded-[24px] border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-900 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">{staleOrders.length} stale order(s) require recovery.</p>
            <p className="text-xs">Active queues remain strict to {activeBusinessDateLabel}. Recover stale items from the dedicated queue.</p>
          </div>
          <a href="#stale-recovery-queue" className="rounded-full border border-amber-400 px-3 py-1 text-xs font-bold uppercase tracking-wider">
            Open Recovery Queue
          </a>
        </div>
      )}

      {loading ? (
        <div className="py-16 flex flex-col items-center gap-4 text-[var(--color-text-muted)]">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
          <p className="text-sm">Loading live orders...</p>
        </div>
      ) : (
        <div className="space-y-8">
          {sections.length === 0 ? (
            <div className="bg-[var(--color-bg)] border-2 border-dashed border-[var(--color-border)] rounded-[40px] p-10 text-center space-y-3">
              <ShoppingBag className="w-8 h-8 mx-auto text-[var(--color-primary)]" />
              <h3 className="text-xl font-serif">No active-day orders</h3>
              <p className="text-sm text-[var(--color-text-muted)]">No current-day orders match the active queue filters.</p>
            </div>
          ) : sections.map((section) => {
            const isCollapsed = section.key in collapsedSections ? collapsedSections[section.key] : getDefaultSectionCollapsed(section.key);

            return (
              <section key={section.key} className="space-y-4">
                <button
                  onClick={() => toggleSection(section.key)}
                  className="w-full rounded-[24px] border border-[var(--color-border)] bg-white px-4 py-4 text-left"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-serif">{section.title}</h3>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-primary)]">
                          {section.orders.length} {section.orders.length === 1 ? 'order' : 'orders'}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)]">{section.description}</p>
                    </div>
                    <div className="text-[var(--color-text-muted)]">
                      {isCollapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                    </div>
                  </div>
                </button>

                {!isCollapsed && (
                  <div className="space-y-4">
                    {section.orders.map((order) => {
                      const isExpanded = !!expandedOrderIds[order.id];
                      const isUpdatingThisOrder = updatingOrderId === order.id;
                      const involvedStations = deriveInvolvedStations(order, menuItems);
                      const stationRejections = involvedStations
                        .map((station) => ({
                          station,
                          reason: getStationRejectionReason(order, station),
                        }))
                        .filter((entry): entry is { station: PrepStation; reason: string } => !!entry.reason);
                      const isPendingFrontAcceptance = order.status === 'pending';

                      return (
                        <article key={order.id} className="bg-white rounded-[32px] border border-[var(--color-border)] shadow-sm overflow-hidden">
                          <button onClick={() => toggleExpanded(order.id)} className="w-full text-left p-6 space-y-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="space-y-2 min-w-0">
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] break-all">Order #{order.id}</p>
                                <p className="text-sm font-medium text-[var(--color-text-muted)] flex items-center gap-2">
                                  <Clock3 className="w-4 h-4 text-[var(--color-primary)]" />
                                  {formatDate(order.createdAt)}
                                </p>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="px-3 py-1 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] text-[10px] font-black uppercase tracking-widest">
                                  {formatOrderStatus(order.status)}
                                </span>
                                {isExpanded ? <ChevronUp className="w-5 h-5 text-[var(--color-text-muted)]" /> : <ChevronDown className="w-5 h-5 text-[var(--color-text-muted)]" />}
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div className="space-y-1 min-w-0">
                                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Customer</p>
                                <p className="font-semibold flex items-center gap-2 truncate">
                                  <UserRound className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
                                  <span className="truncate">{order.customer.name}</span>
                                </p>
                                <p className="text-[var(--color-text-muted)] flex items-center gap-2 truncate">
                                  <Phone className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
                                  <span className="truncate">{order.customer.phone}</span>
                                </p>
                              </div>
                              <div className="space-y-1 text-right">
                                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Service</p>
                                <p className="font-semibold capitalize">{formatServiceMode(order.serviceMode)}</p>
                                <p className="text-xl font-serif text-[var(--color-primary)]">{formatCurrency(order.total)}</p>
                              </div>
                            </div>
                          </button>

                          {isExpanded && (
                            <div className="border-t border-[var(--color-border)] px-6 py-5 space-y-5 bg-[var(--color-bg)]/60">
                              {isPendingFrontAcceptance ? (
                                <section className="rounded-[24px] border border-[var(--color-border)] bg-white px-4 py-4 space-y-2">
                                  <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Dispatch</p>
                                  <p className="font-semibold">Awaiting front acceptance</p>
                                  <p className="text-sm text-[var(--color-text-muted)]">
                                    Prep stations have not been dispatched yet. Station cards appear only after front acceptance.
                                  </p>
                                </section>
                              ) : (
                                <section className="space-y-3">
                                  {(order.frontAcceptedBy || order.completedBy) && (
                                    <div className="rounded-[24px] border border-[var(--color-border)] bg-white px-4 py-3 space-y-1">
                                      <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Staff handling</p>
                                      {order.frontAcceptedBy && (
                                        <p className="text-sm text-[var(--color-text-muted)]">Accepted by {order.frontAcceptedBy.displayName}</p>
                                      )}
                                      {order.completedBy && (
                                        <p className="text-sm text-[var(--color-text-muted)]">Completed by {order.completedBy.displayName}</p>
                                      )}
                                    </div>
                                  )}
                                  <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Station progress</p>
                                  {involvedStations.length > 0 ? (
                                    <div className="grid gap-3">
                                      {involvedStations.map((station) => {
                                        const stationRecord = getStationRecord(order, station);
                                        return (
                                          <div key={station} className="rounded-[24px] border border-[var(--color-border)] bg-white px-4 py-3 space-y-2">
                                            <div className="flex items-center justify-between gap-3">
                                              <p className="font-semibold">{getPrepStationLabel(station)}</p>
                                              <span className="px-3 py-1 rounded-full bg-[var(--color-primary)]/5 text-[10px] font-black uppercase tracking-widest border border-[var(--color-primary)]/10">
                                                {stationRecord ? formatStationStatus(stationRecord.status) : 'Awaiting dispatch'}
                                              </span>
                                            </div>
                                            {(stationRecord?.acceptedBy || stationRecord?.preparingBy || stationRecord?.readyBy || stationRecord?.rejectedBy) && (
                                              <div className="space-y-1 text-xs text-[var(--color-text-muted)]">
                                                {stationRecord?.acceptedBy && <p>Accepted by {stationRecord.acceptedBy.displayName}</p>}
                                                {stationRecord?.preparingBy && <p>Preparing by {stationRecord.preparingBy.displayName}</p>}
                                                {stationRecord?.readyBy && <p>Ready by {stationRecord.readyBy.displayName}</p>}
                                                {stationRecord?.rejectedBy && <p>Rejected by {stationRecord.rejectedBy.displayName}</p>}
                                              </div>
                                            )}
                                            {getStationRejectionReason(order, station) && (
                                              <p className="text-sm text-red-700">
                                                <span className="font-semibold">Reason:</span> {getStationRejectionReason(order, station)}
                                              </p>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <span className="text-sm text-[var(--color-text-muted)]">No prep stations assigned.</span>
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
                                <div className="flex items-center gap-2">
                                  <PackageCheck className="w-4 h-4 text-[var(--color-primary)]" />
                                  <h3 className="text-sm font-black uppercase tracking-widest">Items</h3>
                                </div>
                                <div className="space-y-3">
                                  {order.items.map((item, index) => (
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
                                  ))}
                                </div>
                              </section>

                              <section className="rounded-[24px] bg-white border border-[var(--color-border)] px-4 py-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] mb-1">Notes</p>
                                <p className="text-[var(--color-text)]">{order.notes || 'No notes'}</p>
                              </section>

                              <section className="space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                  <button
                                    onClick={() => handleFrontAccept(order)}
                                    disabled={order.status !== 'pending' || isUpdatingThisOrder}
                                    className="px-4 py-3 rounded-[20px] text-[11px] font-black uppercase tracking-widest border bg-white text-[var(--color-text)] border-[var(--color-border)] disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    Front Accept
                                  </button>
                                  <button
                                    onClick={() => handleComplete(order)}
                                    disabled={!canCompleteOrder(order, menuItems) || order.status !== 'ready_for_handover' || isUpdatingThisOrder}
                                    className="px-4 py-3 rounded-[20px] text-[11px] font-black uppercase tracking-widest border bg-[var(--color-primary)] text-white border-[var(--color-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    Complete
                                  </button>
                                </div>
                                {order.status === 'pending' && (
                                  <p className="text-xs text-[var(--color-text-muted)]">
                                    Accept this order to dispatch prep work to the required stations.
                                  </p>
                                )}
                                {order.status !== 'pending' && order.status !== 'completed' && !canCompleteOrder(order, menuItems) && (
                                  <p className="text-xs text-[var(--color-text-muted)]">
                                    Completion stays locked until every required station is ready for handover.
                                  </p>
                                )}
                              </section>
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

          {staleOrders.length > 0 && (
            <section id="stale-recovery-queue" className="space-y-4">
              <div className="rounded-[24px] border border-amber-300 bg-amber-50 px-4 py-4">
                <h3 className="text-lg font-serif">Stale Orders Recovery Queue</h3>
                <p className="text-xs text-amber-900 mt-1">
                  STALE ORDER • PREVIOUS BUSINESS DATE • RECOVERY REQUIRED
                </p>
              </div>
              <div className="space-y-4">
                {staleOrders.map((order) => {
                  const involvedStations = deriveInvolvedStations(order, menuItems);
                  const orderBusinessDate = resolveOrderBusinessDate(order);
                  const staleAgeDays = getStaleAgeDays(order, activeBusinessDate);
                  const canRecoverComplete = canCompleteOrder(order, menuItems) && order.status === 'ready_for_handover';
                  const isUpdating = updatingOrderId === order.id;
                  return (
                    <article key={`stale-${order.id}`} className="rounded-[28px] border border-amber-300 bg-white shadow-sm p-5 space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700">Stale Order #{order.id}</p>
                          <p className="text-sm text-[var(--color-text-muted)]">
                            Previous business date: <strong>{orderBusinessDate ? formatBusinessDateDisplay(orderBusinessDate) : 'Unknown'}</strong>
                            {typeof staleAgeDays === 'number' ? ` • ${staleAgeDays} day(s) old` : ''}
                          </p>
                        </div>
                        <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-widest">
                          {formatOrderStatus(order.status)}
                        </span>
                      </div>

                      <div className="grid gap-3 md:grid-cols-3 text-sm">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Customer</p>
                          <p className="font-semibold">{order.customer.name}</p>
                          <p className="text-[var(--color-text-muted)]">{order.customer.phone}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Service</p>
                          <p className="font-semibold capitalize">{formatServiceMode(order.serviceMode)}</p>
                          <p className="text-[var(--color-text-muted)]">{formatCurrency(order.total)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Stations</p>
                          <p className="font-semibold">{involvedStations.length > 0 ? involvedStations.map((station) => getPrepStationLabel(station)).join(', ') : 'No prep stations'}</p>
                          <p className="text-[var(--color-text-muted)]">
                            {involvedStations.length > 0
                              ? involvedStations.map((station) => {
                                  const stationRecord = getStationRecord(order, station);
                                  return `${getPrepStationLabel(station)}: ${stationRecord ? formatStationStatus(stationRecord.status) : 'awaiting dispatch'}`;
                                }).join(' | ')
                              : 'Front-only order'}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <button
                          onClick={() => handleRecoverComplete(order)}
                          disabled={!canRecoverComplete || isUpdating}
                          className="px-4 py-3 rounded-[18px] text-[11px] font-black uppercase tracking-widest border bg-[var(--color-primary)] text-white border-[var(--color-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Complete Stale Order
                        </button>
                        <button
                          onClick={() => handleRecoverCancel(order)}
                          disabled={isUpdating}
                          className="px-4 py-3 rounded-[18px] text-[11px] font-black uppercase tracking-widest border bg-white text-red-700 border-red-300 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Cancel Stale Order
                        </button>
                      </div>
                      {!canRecoverComplete && (
                        <p className="text-xs text-[var(--color-text-muted)]">
                          Complete is available only when all required stations are ready for handover.
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};
