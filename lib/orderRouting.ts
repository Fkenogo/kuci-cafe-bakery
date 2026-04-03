import { serverTimestamp } from 'firebase/firestore';
import {
  FinancialStatus,
  FulfillmentMode,
  FrontLane,
  MenuItem,
  MenuPrepStation,
  OrderPaymentRecord,
  OrderPaymentStatus,
  OrderStatus,
  OrderServiceArea,
  PaymentMethod,
  PersistedOrder,
  PersistedOrderItem,
  PersistedOrderTask,
  PrepStation,
  StaffIdentity,
  StationOrderStatus,
  StationStatusRecord,
  StationType,
  UserRole,
} from '../types';
import { toBusinessDate } from './businessDate';
import { mapStationTypeToMenuPrepStation, normalizeMenuPrepStation, normalizeStationType } from './catalog';

export interface LiveStationStatusRecord {
  status: StationOrderStatus;
  updatedAt?: Date | null;
  acceptedBy?: StaffIdentity;
  preparingBy?: StaffIdentity;
  readyBy?: StaffIdentity;
  rejectedBy?: StaffIdentity;
  rejectionReason?: string;
}

export interface LiveOrder extends Omit<PersistedOrder, 'createdAt' | 'updatedAt' | 'stationStatus'> {
  id: string;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  stationStatus?: Partial<Record<PrepStation, LiveStationStatusRecord>>;
}

type StationAction = 'accept' | 'preparing' | 'ready' | 'reject';

function normalizeStaffIdentity(value: unknown): StaffIdentity | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;

  if (
    typeof record.uid !== 'string' ||
    typeof record.displayName !== 'string' ||
    !(
      record.role === 'admin' ||
      record.role === 'front_service' ||
      record.role === 'bakery_front_service' ||
      record.role === 'kitchen' ||
      record.role === 'barista'
    )
  ) {
    return null;
  }

  return {
    uid: record.uid,
    displayName: record.displayName,
    role: record.role,
  };
}

export function toStaffIdentity(user: { uid: string; displayName: string; role: UserRole } | null | undefined): StaffIdentity | null {
  if (!user) return null;
  if (user.role === 'user' || user.role === 'bakery_account_reconciliation' || user.role === 'cafe_account_reconciliation') return null;

  return {
    uid: user.uid,
    displayName: user.displayName,
    role: user.role,
  };
}

function normalizeFrontLane(value: unknown): FrontLane {
  return value === 'bakery_front' ? 'bakery_front' : 'cafe_front';
}

function normalizeOrderServiceArea(value: unknown): OrderServiceArea {
  if (value === 'bakery' || value === 'cafe' || value === 'mixed') return value;
  return 'cafe';
}

function normalizeDispatchMode(value: unknown, hasStations: boolean, frontLane: FrontLane): PersistedOrder['dispatchMode'] {
  if (value === 'station_prep' || value === 'front_only' || value === 'bakery_front_only' || value === 'mixed_split') {
    return value;
  }
  if (hasStations) return 'station_prep';
  return frontLane === 'bakery_front' ? 'bakery_front_only' : 'front_only';
}

function normalizeDate(value: unknown): Date | null {
  if (!value || typeof value !== 'object') return null;
  if ('toDate' in value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

function normalizeBusinessDate(value: unknown, fallbackDate: Date | null): string | undefined {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  if (fallbackDate) {
    return toBusinessDate(fallbackDate);
  }
  return undefined;
}

function normalizeLegacyOverallStatus(status: unknown): OrderStatus | null {
  if (status === 'pending' || status === 'front_accepted' || status === 'in_progress' || status === 'ready_for_handover' || status === 'completed' || status === 'rejected') {
    return status;
  }

  if (status === 'accepted') return 'front_accepted';
  if (status === 'preparing') return 'in_progress';
  if (status === 'ready') return 'ready_for_handover';
  return null;
}

function normalizePaymentMethod(value: unknown): PaymentMethod | null {
  if (value === 'cash' || value === 'mobile_money' || value === 'bank_transfer' || value === 'other') {
    return value;
  }
  return null;
}

function normalizeOrderPaymentStatus(value: unknown): OrderPaymentStatus {
  if (value === 'paid' || value === 'complimentary' || value === 'credit' || value === 'pending') {
    return value;
  }
  return 'pending';
}

function normalizeFinancialStatus(value: unknown): FinancialStatus | undefined {
  if (value === 'unpaid' || value === 'paid' || value === 'complimentary' || value === 'credit') {
    return value;
  }
  return undefined;
}

function normalizeOrderPayment(value: unknown): OrderPaymentRecord | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const amountReceived = typeof record.amountReceived === 'number' && Number.isFinite(record.amountReceived)
    ? Math.max(0, record.amountReceived)
    : 0;
  const method = normalizePaymentMethod(record.method);
  const recordedBy = normalizeStaffIdentity(record.recordedBy);

  return {
    method,
    amountReceived,
    currency: typeof record.currency === 'string' && record.currency.trim().length > 0 ? record.currency : 'RWF',
    isComplimentary: record.isComplimentary === true,
    isCredit: record.isCredit === true,
    recordedBy: recordedBy || null,
    recordedAt: normalizeDate(record.recordedAt),
  };
}

function normalizeOrderReceipt(value: unknown): PersistedOrder['receipt'] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.receiptNumber !== 'string' || record.receiptNumber.trim().length === 0) return undefined;
  if (!record.generatedAt) return undefined;
  return {
    receiptNumber: record.receiptNumber.trim(),
    generatedAt: record.generatedAt,
    visibleToCustomer: record.visibleToCustomer === true,
  };
}

function normalizeLegacyStationStatus(status: unknown): StationOrderStatus | null {
  if (status === 'queued' || status === 'accepted' || status === 'preparing' || status === 'ready' || status === 'rejected') {
    return status;
  }

  return null;
}

function normalizeStationStatusRecord(value: unknown): LiveStationStatusRecord | null {
  if (typeof value === 'string') {
    const legacyStatus = normalizeLegacyStationStatus(value);
    return legacyStatus ? { status: legacyStatus, updatedAt: null } : null;
  }

  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const status = normalizeLegacyStationStatus(record.status);
  if (!status) return null;

  return {
    status,
    updatedAt: normalizeDate(record.updatedAt),
    ...(normalizeStaffIdentity(record.acceptedBy) ? { acceptedBy: normalizeStaffIdentity(record.acceptedBy) as StaffIdentity } : {}),
    ...(normalizeStaffIdentity(record.preparingBy) ? { preparingBy: normalizeStaffIdentity(record.preparingBy) as StaffIdentity } : {}),
    ...(normalizeStaffIdentity(record.readyBy) ? { readyBy: normalizeStaffIdentity(record.readyBy) as StaffIdentity } : {}),
    ...(normalizeStaffIdentity(record.rejectedBy) ? { rejectedBy: normalizeStaffIdentity(record.rejectedBy) as StaffIdentity } : {}),
    ...(typeof record.rejectionReason === 'string' && record.rejectionReason.trim()
      ? { rejectionReason: record.rejectionReason.trim() }
      : {}),
  };
}

export function mapMenuStationToPrepStation(station?: StationType | null): PrepStation | null {
  if (!station) return null;
  const prepStation = mapStationTypeToMenuPrepStation(normalizeStationType(station));
  if (prepStation === 'kitchen') return 'kitchen';
  if (prepStation === 'barista') return 'barista';
  return null;
}

export function mapMenuPrepStationToPrepStation(prepStation?: MenuPrepStation | null): PrepStation | null {
  if (!prepStation) return null;
  const normalized = normalizeMenuPrepStation(prepStation);
  if (normalized === 'kitchen') return 'kitchen';
  if (normalized === 'barista') return 'barista';
  return null;
}

export function getPrepStationLabel(station: PrepStation): string {
  return station === 'kitchen' ? 'Kitchen' : 'Barista';
}

export function formatOrderStatus(status: OrderStatus): string {
  return status.replace(/_/g, ' ');
}

export function formatStationStatus(status: StationOrderStatus): string {
  return status.replace(/_/g, ' ');
}

export function getPrepStationForOrderItem(item: Pick<PersistedOrderItem, 'itemId' | 'prepStation'>, menuItems: MenuItem[]): PrepStation | null {
  if (item.prepStation) return item.prepStation;
  const menuItem = menuItems.find((candidate) => candidate.id === item.itemId);
  if (!menuItem) return null;
  const fulfillmentMode: FulfillmentMode = menuItem?.fulfillmentMode || 'made_to_order';
  if (fulfillmentMode === 'ready_to_serve') return null;
  return mapMenuPrepStationToPrepStation(menuItem?.prepStation) || mapMenuStationToPrepStation(menuItem?.station);
}

export function getRelevantOrderItems(order: Pick<LiveOrder, 'items'>, station: PrepStation, menuItems: MenuItem[]): PersistedOrderItem[] {
  return order.items.filter((item) => getPrepStationForOrderItem(item, menuItems) === station);
}

function normalizeOrderTask(task: unknown): PersistedOrderTask | null {
  if (!task || typeof task !== 'object') return null;
  const record = task as PersistedOrderTask;

  if (
    typeof record.taskId !== 'string' ||
    typeof record.sourceItemId !== 'string' ||
    typeof record.sourceItemName !== 'string' ||
    typeof record.taskName !== 'string' ||
    typeof record.quantity !== 'number' ||
    !Array.isArray(record.selectedOptions) ||
    (record.prepStation !== 'kitchen' && record.prepStation !== 'barista')
  ) {
    return null;
  }

  return {
    taskId: record.taskId,
    sourceItemId: record.sourceItemId,
    sourceItemName: record.sourceItemName,
    taskName: record.taskName,
    quantity: record.quantity,
    selectedOptions: record.selectedOptions.filter((option): option is string => typeof option === 'string' && option.trim().length > 0),
    prepStation: record.prepStation,
  };
}

export function getRelevantOrderTasks(
  order: Pick<LiveOrder, 'items' | 'routedTasks'>,
  station: PrepStation,
  menuItems: MenuItem[]
): PersistedOrderTask[] {
  if (order.routedTasks && order.routedTasks.length > 0) {
    return order.routedTasks.filter((task) => task.prepStation === station);
  }

  return getRelevantOrderItems(order, station, menuItems).map((item, index) => ({
    taskId: `${item.itemId}:${station}:${index}`,
    sourceItemId: item.itemId,
    sourceItemName: item.itemName,
    taskName: item.itemName,
    quantity: item.quantity,
    selectedOptions: item.selectedOptions,
    prepStation: station,
  }));
}

export function deriveInvolvedStations(order: Pick<LiveOrder, 'items' | 'involvedStations' | 'routedTasks'>, menuItems: MenuItem[]): PrepStation[] {
  if (order.involvedStations && order.involvedStations.length > 0) {
    return Array.from(new Set(order.involvedStations));
  }

  if (order.routedTasks && order.routedTasks.length > 0) {
    return Array.from(new Set(order.routedTasks.map((task) => task.prepStation)));
  }

  return Array.from(
    new Set(
      order.items
        .map((item) => getPrepStationForOrderItem(item, menuItems))
        .filter((station): station is PrepStation => station !== null)
    )
  );
}

export function normalizeOrderItem(item: unknown): PersistedOrderItem | null {
  if (!item || typeof item !== 'object') return null;
  const record = item as PersistedOrderItem;

  if (
    typeof record.itemId !== 'string' ||
    typeof record.itemName !== 'string' ||
    typeof record.quantity !== 'number' ||
    typeof record.unitPrice !== 'number' ||
    !Array.isArray(record.selectedOptions) ||
    typeof record.lineTotal !== 'number'
  ) {
    return null;
  }

  return {
    itemId: record.itemId,
    itemName: record.itemName,
    quantity: record.quantity,
    unitPrice: record.unitPrice,
    selectedOptions: record.selectedOptions.filter((option): option is string => typeof option === 'string' && option.trim().length > 0),
    lineTotal: record.lineTotal,
    ...(record.serviceArea === 'bakery' || record.serviceArea === 'cafe' ? { serviceArea: record.serviceArea } : {}),
    ...(record.prepStation ? { prepStation: record.prepStation } : {}),
  };
}

export function normalizeLiveOrder(id: string, value: unknown): LiveOrder | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const items = Array.isArray(record.items)
    ? record.items.flatMap((item) => {
        const normalized = normalizeOrderItem(item);
        return normalized ? [normalized] : [];
      })
    : [];
  const routedTasks = Array.isArray(record.routedTasks)
    ? record.routedTasks.flatMap((task) => {
        const normalized = normalizeOrderTask(task);
        return normalized ? [normalized] : [];
      })
    : [];

  const status = normalizeLegacyOverallStatus(record.status);
  if (
    !status ||
    typeof record.paymentStatus !== 'string' ||
    typeof record.serviceMode !== 'string' ||
    typeof record.subtotal !== 'number' ||
    typeof record.deliveryFee !== 'number' ||
    typeof record.total !== 'number' ||
    typeof record.notes !== 'string' ||
    !record.customer ||
    typeof record.customer !== 'object' ||
    items.length === 0
  ) {
    console.warn('[orders] Skipping malformed order', { id, value });
    return null;
  }

  const customer = record.customer as Record<string, unknown>;
  if (typeof customer.name !== 'string' || typeof customer.phone !== 'string') {
    console.warn('[orders] Skipping order with invalid customer', { id, value });
    return null;
  }

  const involvedStations = Array.isArray(record.involvedStations)
    ? record.involvedStations.filter((station): station is PrepStation => station === 'kitchen' || station === 'barista')
    : undefined;

  let stationStatus: Partial<Record<PrepStation, LiveStationStatusRecord>> | undefined;
  if (record.stationStatus && typeof record.stationStatus === 'object') {
    const rawStationStatus = record.stationStatus as Record<string, unknown>;
    const nextStationStatus: Partial<Record<PrepStation, LiveStationStatusRecord>> = {};

    (['kitchen', 'barista'] as PrepStation[]).forEach((station) => {
      const normalized = normalizeStationStatusRecord(rawStationStatus[station]);
      if (normalized) {
        nextStationStatus[station] = normalized;
      }
    });

    if (Object.keys(nextStationStatus).length > 0) {
      stationStatus = nextStationStatus;
    }
  }

  const frontLane = normalizeFrontLane(record.frontLane);
  const serviceArea = normalizeOrderServiceArea(record.serviceArea);
  const dispatchMode = normalizeDispatchMode(record.dispatchMode, involvedStations ? involvedStations.length > 0 : routedTasks.length > 0, frontLane);
  const createdAt = normalizeDate(record.createdAt);
  const updatedAt = normalizeDate(record.updatedAt);
  const businessDate = normalizeBusinessDate(record.businessDate, createdAt || updatedAt);
  const payment = normalizeOrderPayment(record.payment);
  const financialStatus = normalizeFinancialStatus(record.financialStatus);
  const receipt = normalizeOrderReceipt(record.receipt);
  const loyaltyRedemption =
    record.loyaltyRedemption && typeof record.loyaltyRedemption === 'object'
      ? (() => {
          const lr = record.loyaltyRedemption as Record<string, unknown>;
          const requestedAmount = typeof lr.requestedAmount === 'number' && Number.isFinite(lr.requestedAmount) ? Math.max(0, lr.requestedAmount) : 0;
          const appliedAmount = typeof lr.appliedAmount === 'number' && Number.isFinite(lr.appliedAmount) ? Math.max(0, lr.appliedAmount) : 0;
          const blockSize = typeof lr.blockSize === 'number' && Number.isFinite(lr.blockSize) ? Math.max(0, lr.blockSize) : 1000;
          if (blockSize <= 0) return undefined;
          return {
            selectedByCustomer: lr.selectedByCustomer === true,
            requestedAmount,
            appliedAmount,
            blockSize,
          };
        })()
      : undefined;

  return {
    id,
    createdAt,
    updatedAt,
    ...(businessDate ? { businessDate } : {}),
    status,
    paymentStatus: normalizeOrderPaymentStatus(record.paymentStatus),
    ...(payment ? { payment } : {}),
    ...(financialStatus ? { financialStatus } : {}),
    ...(receipt ? { receipt } : {}),
    ...(loyaltyRedemption ? { loyaltyRedemption } : {}),
    serviceMode: record.serviceMode as PersistedOrder['serviceMode'],
    ...(record.orderEntryMode === 'customer_self' || record.orderEntryMode === 'staff_assisted'
      ? { orderEntryMode: record.orderEntryMode }
      : {}),
    ...(record.orderSource === 'walk_in' || record.orderSource === 'phone_call' || record.orderSource === 'whatsapp' || record.orderSource === 'other'
      ? { orderSource: record.orderSource }
      : {}),
    ...(record.checkoutPaymentChoice === 'cash' || record.checkoutPaymentChoice === 'mobile_money' || record.checkoutPaymentChoice === 'whatsapp'
      ? { checkoutPaymentChoice: record.checkoutPaymentChoice }
      : {}),
    serviceArea,
    frontLane,
    dispatchMode,
    ...(typeof record.createdByStaffUid === 'string' && record.createdByStaffUid.trim().length > 0
      ? { createdByStaffUid: record.createdByStaffUid.trim() }
      : {}),
    ...(record.createdByStaffRole === 'admin' || record.createdByStaffRole === 'front_service' || record.createdByStaffRole === 'bakery_front_service'
      ? { createdByStaffRole: record.createdByStaffRole }
      : {}),
    ...(typeof record.createdByStaffName === 'string' && record.createdByStaffName.trim().length > 0
      ? { createdByStaffName: record.createdByStaffName.trim() }
      : {}),
    ...(typeof record.assistedCustomerName === 'string' ? { assistedCustomerName: record.assistedCustomerName } : {}),
    ...(typeof record.assistedCustomerPhoneNormalized === 'string' ? { assistedCustomerPhoneNormalized: record.assistedCustomerPhoneNormalized } : {}),
    customer: {
      name: customer.name,
      phone: customer.phone,
      ...(typeof customer.location === 'string' && customer.location.trim() ? { location: customer.location } : {}),
    },
    items,
    subtotal: record.subtotal,
    deliveryFee: record.deliveryFee,
    total: record.total,
    notes: record.notes,
    ...(routedTasks.length > 0 ? { routedTasks } : {}),
    ...(involvedStations && involvedStations.length > 0 ? { involvedStations } : {}),
    ...(stationStatus ? { stationStatus } : {}),
    ...(normalizeStaffIdentity(record.frontAcceptedBy) ? { frontAcceptedBy: normalizeStaffIdentity(record.frontAcceptedBy) } : {}),
    ...(normalizeStaffIdentity(record.completedBy) ? { completedBy: normalizeStaffIdentity(record.completedBy) } : {}),
    ...(typeof record.userId === 'string' ? { userId: record.userId } : {}),
    ...(record.resolution === 'normal' || record.resolution === 'forced_close' ? { resolution: record.resolution } : {}),
    ...(record.resolutionReason === 'day_close' || record.resolutionReason === 'stale_recovery_cancel'
      ? { resolutionReason: record.resolutionReason }
      : {}),
    ...(record.resolutionUpdatedAt ? { resolutionUpdatedAt: record.resolutionUpdatedAt } : {}),
    ...(normalizeStaffIdentity(record.resolutionUpdatedBy) ? { resolutionUpdatedBy: normalizeStaffIdentity(record.resolutionUpdatedBy) } : {}),
    ...(typeof record.originalBusinessDate === 'string' ? { originalBusinessDate: record.originalBusinessDate } : {}),
    ...(record.recoveryAction === 'stale_complete' || record.recoveryAction === 'stale_cancel' || record.recoveryAction === 'stale_carry_forward'
      ? { recoveryAction: record.recoveryAction }
      : {}),
    ...(record.recoveryReason === 'stale_recovery_complete' || record.recoveryReason === 'stale_recovery_cancel' || record.recoveryReason === 'stale_recovery_carry_forward'
      ? { recoveryReason: record.recoveryReason }
      : {}),
    ...(record.recoveryUpdatedAt ? { recoveryUpdatedAt: record.recoveryUpdatedAt } : {}),
    ...(normalizeStaffIdentity(record.recoveryUpdatedBy) ? { recoveryUpdatedBy: normalizeStaffIdentity(record.recoveryUpdatedBy) } : {}),
  };
}

export function buildInitialStationStatus(stations: PrepStation[]): Partial<Record<PrepStation, StationStatusRecord>> {
  return stations.reduce<Partial<Record<PrepStation, StationStatusRecord>>>((accumulator, station) => {
    accumulator[station] = {
      status: 'queued',
      updatedAt: serverTimestamp(),
    };
    return accumulator;
  }, {});
}

export function getStationRecord(order: Pick<LiveOrder, 'stationStatus'>, station: PrepStation): LiveStationStatusRecord | null {
  return order.stationStatus?.[station] || null;
}

export function getStationRejectionReason(order: Pick<LiveOrder, 'stationStatus'>, station: PrepStation): string | null {
  return order.stationStatus?.[station]?.rejectionReason?.trim() || null;
}

export function canCompleteOrder(order: Pick<LiveOrder, 'status' | 'items' | 'involvedStations' | 'stationStatus' | 'routedTasks'>, menuItems: MenuItem[]): boolean {
  return deriveOverallOrderStatus(order, menuItems) === 'ready_for_handover';
}

export function deriveOverallOrderStatus(
  order: Pick<LiveOrder, 'status' | 'items' | 'involvedStations' | 'stationStatus' | 'routedTasks'>,
  menuItems: MenuItem[]
): OrderStatus {
  if (order.status === 'completed') return 'completed';
  if (order.status === 'rejected') return 'rejected';

  const stations = deriveInvolvedStations(order, menuItems);
  if (stations.length === 0) {
    return order.status === 'pending' ? 'pending' : 'ready_for_handover';
  }

  const statuses = stations
    .map((station) => order.stationStatus?.[station]?.status)
    .filter((status): status is StationOrderStatus => !!status);

  if (statuses.some((status) => status === 'rejected')) return 'rejected';
  if (statuses.length === stations.length && statuses.every((status) => status === 'ready')) return 'ready_for_handover';
  if (statuses.some((status) => status === 'accepted' || status === 'preparing' || status === 'ready')) return 'in_progress';
  if (statuses.length === stations.length && statuses.every((status) => status === 'queued')) return 'front_accepted';
  return order.status === 'pending' ? 'pending' : 'front_accepted';
}

export function buildFrontServiceAcceptUpdate(order: LiveOrder, menuItems: MenuItem[], actor: StaffIdentity | null) {
  const involvedStations = deriveInvolvedStations(order, menuItems);
  const stationStatus = buildInitialStationStatus(involvedStations);

  return {
    status: involvedStations.length > 0 ? 'front_accepted' : 'ready_for_handover',
    involvedStations,
    stationStatus,
    frontAcceptedBy: actor,
    updatedAt: serverTimestamp(),
  };
}

export function buildOptimisticFrontServiceAcceptState(order: LiveOrder, menuItems: MenuItem[], actor: StaffIdentity | null) {
  const involvedStations = deriveInvolvedStations(order, menuItems);
  const timestamp = new Date();
  const stationStatus = involvedStations.reduce<Partial<Record<PrepStation, LiveStationStatusRecord>>>((accumulator, station) => {
    accumulator[station] = {
      status: 'queued',
      updatedAt: timestamp,
    };
    return accumulator;
  }, {});

  return {
    status: involvedStations.length > 0 ? 'front_accepted' : 'ready_for_handover' as OrderStatus,
    involvedStations,
    stationStatus,
    frontAcceptedBy: actor,
    updatedAt: timestamp,
  };
}

export function buildStationProgressUpdate(
  order: LiveOrder,
  station: PrepStation,
  action: StationAction,
  menuItems: MenuItem[],
  actor: StaffIdentity | null,
  rejectionReason?: string
) {
  const involvedStations = deriveInvolvedStations(order, menuItems);
  const existingStationStatus = order.stationStatus || {};
  const nextStatus: StationOrderStatus =
    action === 'accept'
      ? 'accepted'
      : action === 'preparing'
        ? 'preparing'
        : action === 'ready'
          ? 'ready'
          : 'rejected';

  const previousStationRecord = existingStationStatus[station];
  const nextStationRecord: StationStatusRecord = {
    ...(previousStationRecord || {}),
    status: nextStatus,
    updatedAt: serverTimestamp(),
    ...(action === 'accept' && actor ? { acceptedBy: actor } : {}),
    ...(action === 'preparing' && actor ? { preparingBy: actor } : {}),
    ...(action === 'ready' && actor ? { readyBy: actor } : {}),
    ...(action === 'reject' && actor ? { rejectedBy: actor } : {}),
    ...(action === 'reject' && rejectionReason?.trim() ? { rejectionReason: rejectionReason.trim() } : {}),
  };

  const stationStatus = {
    ...existingStationStatus,
    [station]: nextStationRecord,
  };

  const status = deriveOverallOrderStatus(
    {
      ...order,
      involvedStations,
      stationStatus: stationStatus as Partial<Record<PrepStation, LiveStationStatusRecord>>,
    },
    menuItems
  );

  return {
    stationStatus,
    involvedStations,
    status,
    updatedAt: serverTimestamp(),
  };
}

export function buildOptimisticStationProgressState(
  order: LiveOrder,
  station: PrepStation,
  action: StationAction,
  menuItems: MenuItem[],
  actor: StaffIdentity | null,
  rejectionReason?: string
) {
  const involvedStations = deriveInvolvedStations(order, menuItems);
  const timestamp = new Date();
  const nextStatus: StationOrderStatus =
    action === 'accept'
      ? 'accepted'
      : action === 'preparing'
        ? 'preparing'
        : action === 'ready'
          ? 'ready'
          : 'rejected';

  const stationStatus = {
    ...(order.stationStatus || {}),
    [station]: {
      ...(order.stationStatus?.[station] || {}),
      status: nextStatus,
      updatedAt: timestamp,
      ...(action === 'accept' && actor ? { acceptedBy: actor } : {}),
      ...(action === 'preparing' && actor ? { preparingBy: actor } : {}),
      ...(action === 'ready' && actor ? { readyBy: actor } : {}),
      ...(action === 'reject' && actor ? { rejectedBy: actor } : {}),
      ...(action === 'reject' && rejectionReason?.trim() ? { rejectionReason: rejectionReason.trim() } : {}),
    },
  } as Partial<Record<PrepStation, LiveStationStatusRecord>>;

  return {
    stationStatus,
    involvedStations,
    status: deriveOverallOrderStatus(
      {
        ...order,
        involvedStations,
        stationStatus,
      },
      menuItems
    ),
    updatedAt: timestamp,
  };
}

export function buildOptimisticCompletionState(actor: StaffIdentity | null) {
  return {
    status: 'completed' as OrderStatus,
    completedBy: actor,
    updatedAt: new Date(),
  };
}

export function canAccessOperationalPath(role: UserRole | undefined, path: string, isActive = true): boolean {
  if (!isActive) return false;
  if (path.startsWith('/admin/orders') || path.startsWith('/admin/staff') || path.startsWith('/admin/catalog')) return role === 'admin';
  if (path.startsWith('/reconciliation')) {
    return role === 'admin' || role === 'bakery_account_reconciliation' || role === 'cafe_account_reconciliation';
  }
  if (path.startsWith('/front/orders')) return role === 'front_service' || role === 'admin';
  if (path.startsWith('/bakery-front/orders')) return role === 'bakery_front_service' || role === 'admin';
  if (path.startsWith('/kitchen/orders')) return role === 'kitchen' || role === 'admin';
  if (path.startsWith('/barista/orders')) return role === 'barista' || role === 'admin';
  return true;
}

export function getRoleHomePath(role: UserRole | undefined): string {
  if (role === 'admin') return '/admin/orders';
  if (role === 'front_service') return '/front/orders';
  if (role === 'bakery_front_service') return '/bakery-front/orders';
  if (role === 'kitchen') return '/kitchen/orders';
  if (role === 'barista') return '/barista/orders';
  if (role === 'bakery_account_reconciliation' || role === 'cafe_account_reconciliation') return '/reconciliation';
  return '/';
}
