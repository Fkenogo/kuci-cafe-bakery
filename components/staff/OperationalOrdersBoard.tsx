import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { AlertCircle, ChevronDown, ChevronUp, Clock3, Loader2, Phone, Search, ShoppingBag, UserRound } from 'lucide-react';
import { db } from '../../lib/firebase';
import { toBusinessDate } from '../../lib/businessDate';
import { isOrderOperationallyTerminal, resolveOrderBusinessDate } from '../../lib/orderDayLifecycle';
import {
  buildFrontServiceAcceptUpdate,
  buildOptimisticCompletionState,
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
  const actingStaff = useMemo(() => toStaffIdentity(currentStaff), [currentStaff]);
  const activeBusinessDate = toBusinessDate();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(getSectionStorageKey(scope), JSON.stringify(collapsedSections));
  }, [collapsedSections, scope]);

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
      patchOrderLocally(order.id, optimisticPatch);
      await updateDoc(doc(db, 'orders', order.id), buildFrontServiceAcceptUpdate(order, menuItems, actingStaff));
    } catch (updateError) {
      console.error('[front_service] Failed to accept order:', updateError);
      setError('Could not accept this order.');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleFrontServiceComplete = async (order: LiveOrder) => {
    if (updatingOrderId) return;

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
      console.error('[front_service] Failed to complete order:', updateError);
      setError('Could not complete this order.');
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
      patchOrderLocally(order.id, optimisticPatch);
      await updateDoc(doc(db, 'orders', order.id), buildStationProgressUpdate(order, station, action, menuItems, actingStaff, rejectionReason));

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
        { value: 'all', label: 'All sections' },
        { value: 'pending', label: 'Pending' },
        { value: 'front_accepted', label: 'Front accepted' },
        { value: 'in_progress', label: 'In progress' },
        { value: 'ready_for_handover', label: 'Ready for handover' },
        { value: 'rejected', label: 'Rejected' },
        { value: 'completed', label: 'Completed' },
      ]
    : [
        { value: 'all', label: 'All sections' },
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

  return (
    <div className="px-4 py-8 space-y-6 pb-28">
      <header className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-serif">{title}</h2>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-primary)]">
            {filteredOrders.length} {filteredOrders.length === 1 ? 'order' : 'orders'}
          </span>
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">{subtitle}</p>
      </header>

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
            Future-ready hook: this filter state reserves `assigneeId` for later accepted-by filtering.
          </p>
        </div>

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

      {error && (
        <div className="rounded-[28px] border border-red-200 bg-red-50 px-5 py-4 text-[11px] text-red-700 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="py-16 flex flex-col items-center gap-4 text-[var(--color-text-muted)]">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
          <p className="text-sm">Loading live orders...</p>
        </div>
      ) : sections.length === 0 ? (
        <div className="bg-[var(--color-bg)] border-2 border-dashed border-[var(--color-border)] rounded-[40px] p-10 text-center space-y-3">
          <ShoppingBag className="w-8 h-8 mx-auto text-[var(--color-primary)]" />
          <h3 className="text-xl font-serif">No queue items</h3>
          <p className="text-sm text-[var(--color-text-muted)]">No orders match the current filters.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {sections.map((section) => {
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
                      const involvedStations = deriveInvolvedStations(order, menuItems);
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
                          ? { label: 'Accept', action: 'accept' as const }
                          : currentStationRecord?.status === 'accepted'
                            ? { label: 'Preparing', action: 'preparing' as const }
                            : currentStationRecord?.status === 'preparing'
                              ? { label: 'Ready', action: 'ready' as const }
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
                                  {isFrontScope(scope) ? formatOrderStatus(order.status) : (currentStationRecord ? formatStationStatus(currentStationRecord.status) : 'Awaiting dispatch')}
                                </span>
                                {isExpanded ? <ChevronUp className="w-5 h-5 text-[var(--color-text-muted)]" /> : <ChevronDown className="w-5 h-5 text-[var(--color-text-muted)]" />}
                              </div>
                            </div>

                            {isFrontScope(scope) ? (
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
                            ) : (
                              <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">
                                  {relevantTasks.length} {relevantTasks.length === 1 ? 'task' : 'tasks'} for {getPrepStationLabel(scope)}
                                </p>
                                <p className="text-sm text-[var(--color-text-muted)] capitalize">{formatServiceMode(order.serviceMode)}</p>
                              </div>
                            )}
                          </button>

                          {isExpanded && (
                            <div className="border-t border-[var(--color-border)] px-6 py-5 space-y-5 bg-[var(--color-bg)]/60">
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
                                      className="px-4 py-3 rounded-[20px] text-[11px] font-black uppercase tracking-widest border bg-white text-[var(--color-text)] border-[var(--color-border)] disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                      Accept
                                    </button>
                                    <button
                                      onClick={() => handleFrontServiceComplete(order)}
                                      disabled={!canComplete || order.status !== 'ready_for_handover' || updatingOrderId === order.id}
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
                                        className="px-4 py-3 rounded-[20px] text-[11px] font-black uppercase tracking-widest border bg-white text-[var(--color-text)] border-[var(--color-border)] disabled:opacity-40 disabled:cursor-not-allowed"
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
