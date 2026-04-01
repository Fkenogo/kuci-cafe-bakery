import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import {
  CartItem,
  DeliveryArea,
  DispatchMode,
  FrontLane,
  FulfillmentMode,
  ItemServiceArea,
  ModifierOption,
  OrderServiceArea,
  OrderServiceMode,
  OrderType,
  PersistedOrder,
  PersistedOrderItem,
  PersistedOrderTask,
  PrepStation,
  UserProfile,
} from '../types';
import { getCartItemUnitPrice, summarizeSelectedModifiers } from './catalog';
import { toBusinessDate } from './businessDate';
import { mapMenuPrepStationToPrepStation, mapMenuStationToPrepStation } from './orderRouting';

const MAX_NOTES_LENGTH = 500;

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toServiceMode(orderType: OrderType): OrderServiceMode {
  switch (orderType) {
    case OrderType.EAT_IN:
      return 'dine_in';
    case OrderType.DELIVERY:
      return 'delivery';
    case OrderType.PICK_UP:
    default:
      return 'pickup';
  }
}

function getSelectedOptions(item: CartItem): string[] {
  const customization = item.customization;
  if (!customization) return [];

  return [
    ...(customization.selectedVariantName ? [customization.selectedVariantName] : []),
    ...summarizeSelectedModifiers(customization.selectedModifiers),
    ...(customization.sides || []),
    ...(customization.toppings || []),
    ...(customization.extras || []),
    ...(customization.instructions ? [`Note: ${customization.instructions.trim()}`] : []),
  ].filter((option) => typeof option === 'string' && option.trim().length > 0);
}

function inferPrepStationFromText(value: string): PrepStation | null {
  const text = value.trim().toLowerCase();
  if (!text) return null;

  if (
    text.includes('coffee') ||
    text.includes('espresso') ||
    text.includes('tea') ||
    text.includes('juice') ||
    text.includes('smoothie') ||
    text.includes('soda') ||
    text.includes('water') ||
    text.includes('cocktail') ||
    text.includes('wine')
  ) {
    return 'barista';
  }

  return null;
}

function getModifierOptionById(item: CartItem, groupId: string, optionId: string): ModifierOption | undefined {
  return item.modifierGroups
    ?.find((group) => group.id === groupId)
    ?.options.find((option) => option.id === optionId);
}

function getSelectedModifierOptionNames(item: CartItem, groupId: string): string[] {
  const selectedModifier = item.customization?.selectedModifiers?.find((group) => group.groupId === groupId);
  if (!selectedModifier) return [];

  return selectedModifier.optionIds
    .map((optionId, index) => getModifierOptionById(item, groupId, optionId)?.name || selectedModifier.optionNames[index] || optionId)
    .filter((name): name is string => typeof name === 'string' && name.trim().length > 0);
}

function buildRoutedTasks(cart: CartItem[]): PersistedOrderTask[] {
  return cart.flatMap((item, index) => {
    const sourceItemId = normalizeString(item.id);
    const sourceItemName = normalizeString(item.name);
    const quantity = Number.isFinite(item.quantity) ? Math.floor(item.quantity) : 0;
    const fulfillmentMode: FulfillmentMode = item.fulfillmentMode || 'made_to_order';
    const baseStation = mapMenuPrepStationToPrepStation(item.prepStation) || mapMenuStationToPrepStation(item.station);

    if (!sourceItemId || !sourceItemName || quantity <= 0) {
      return [];
    }

    if (fulfillmentMode === 'ready_to_serve') {
      return [];
    }

    const tasks: PersistedOrderTask[] = [];
    const taskIndexByKey = new Map<string, number>();

    const pushTask = (
      prepStation: PrepStation | null,
      taskName: string,
      selectedOptions: string[] = [],
      taskQuantity = quantity
    ) => {
      if (!prepStation) return;
      const normalizedTaskName = normalizeString(taskName);
      if (!normalizedTaskName) return;
      if (!Number.isFinite(taskQuantity) || taskQuantity <= 0) return;

      const dedupeKey = `${prepStation}:${normalizedTaskName.toLowerCase()}`;
      const existingTaskIndex = taskIndexByKey.get(dedupeKey);

      if (existingTaskIndex !== undefined) {
        const existingTask = tasks[existingTaskIndex];
        existingTask.quantity += taskQuantity;
        existingTask.selectedOptions = Array.from(new Set([
          ...existingTask.selectedOptions,
          ...selectedOptions.filter((option) => typeof option === 'string' && option.trim().length > 0),
        ]));
        return;
      }

      taskIndexByKey.set(dedupeKey, tasks.length);

      tasks.push({
        taskId: `${sourceItemId}:${index}:${dedupeKey}`,
        sourceItemId,
        sourceItemName,
        taskName: normalizedTaskName,
        quantity: taskQuantity,
        selectedOptions: selectedOptions.filter((option) => typeof option === 'string' && option.trim().length > 0),
        prepStation,
      });
    };

    if (item.itemType === 'composite' && (item.components?.length || 0) > 0) {
      item.components?.forEach((component) => {
        const componentStation = mapMenuPrepStationToPrepStation(component.prepStation);
        if (!componentStation) return;

        const componentSelections = component.optionGroupId
          ? getSelectedModifierOptionNames(item, component.optionGroupId)
          : [];

        if (!component.required && component.optionGroupId && componentSelections.length === 0) {
          return;
        }

        const componentQuantity = quantity * Math.max(1, Math.floor(component.quantity || 1));
        pushTask(
          componentStation,
          component.name,
          componentSelections.length > 0 ? componentSelections : [`From ${sourceItemName}`],
          componentQuantity
        );
      });

      return tasks;
    }

    pushTask(baseStation, sourceItemName, getSelectedOptions(item));

    const selectedModifiers = item.customization?.selectedModifiers || [];
    selectedModifiers.forEach((selectedModifier) => {
      selectedModifier.optionIds.forEach((optionId, optionIndex) => {
        const modifierOption = getModifierOptionById(item, selectedModifier.groupId, optionId);
        const optionName = modifierOption?.name || selectedModifier.optionNames[optionIndex] || optionId;
        const optionStation =
          mapMenuPrepStationToPrepStation(modifierOption?.prepStation) ||
          mapMenuStationToPrepStation(modifierOption?.station) ||
          inferPrepStationFromText(optionName);

        if (!optionStation || optionStation === baseStation) return;

        pushTask(optionStation, optionName, [`From ${sourceItemName}`]);
      });
    });

    if (item.customization?.selectedVariantName) {
      const variantStation = inferPrepStationFromText(item.customization.selectedVariantName);
      if (variantStation && variantStation !== baseStation) {
        pushTask(variantStation, item.customization.selectedVariantName, [`From ${sourceItemName}`]);
      }
    }

    return tasks;
  });
}

function sanitizeOrderItems(cart: CartItem[]): PersistedOrderItem[] {
  return cart.flatMap((item) => {
    const itemId = normalizeString(item.id);
    const itemName = normalizeString(item.name);
    const quantity = Number.isFinite(item.quantity) ? Math.floor(item.quantity) : 0;
    const unitPrice = getCartItemUnitPrice(item);

    if (!itemId || !itemName || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
      return [];
    }

    const serviceArea: ItemServiceArea = item.serviceArea === 'bakery' ? 'bakery' : 'cafe';

    return [{
      itemId,
      itemName,
      quantity,
      unitPrice,
      selectedOptions: getSelectedOptions(item),
      lineTotal: unitPrice * quantity,
      serviceArea,
      ...(
        (item.fulfillmentMode || 'made_to_order') === 'made_to_order' &&
        (mapMenuPrepStationToPrepStation(item.prepStation) || mapMenuStationToPrepStation(item.station))
          ? { prepStation: (mapMenuPrepStationToPrepStation(item.prepStation) || mapMenuStationToPrepStation(item.station)) as PrepStation }
          : {}
      ),
    }];
  });
}

function classifyOrderOperationalRouting(items: PersistedOrderItem[], routedTasks: PersistedOrderTask[]): {
  serviceArea: OrderServiceArea;
  frontLane: FrontLane;
  dispatchMode: DispatchMode;
} {
  const containsBakery = items.some((item) => item.serviceArea === 'bakery');
  const containsCafe = items.some((item) => item.serviceArea !== 'bakery');

  if (containsBakery && containsCafe) {
    return {
      serviceArea: 'mixed',
      frontLane: 'cafe_front',
      dispatchMode: 'mixed_split',
    };
  }

  if (containsBakery) {
    return {
      serviceArea: 'bakery',
      frontLane: 'bakery_front',
      dispatchMode: routedTasks.length > 0 ? 'station_prep' : 'bakery_front_only',
    };
  }

  return {
    serviceArea: 'cafe',
    frontLane: 'cafe_front',
    dispatchMode: routedTasks.length > 0 ? 'station_prep' : 'front_only',
  };
}

export interface CreateOrderInput {
  cart: CartItem[];
  orderType: OrderType;
  deliveryArea?: DeliveryArea | null;
  userProfile: UserProfile;
  subtotal: number;
  deliveryFee: number;
  total: number;
  userId?: string | null;
}

export interface CreateOrderResult {
  orderId: string;
  order: PersistedOrder;
}

export function validateOrderInput(input: CreateOrderInput): { valid: true; items: PersistedOrderItem[]; notes: string } | { valid: false; message: string } {
  const items = sanitizeOrderItems(input.cart);
  if (items.length === 0) {
    return { valid: false, message: 'Your cart is empty or contains invalid items.' };
  }

  if (items.length !== input.cart.length) {
    return { valid: false, message: 'Some cart items are invalid. Please review your cart and try again.' };
  }

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  if (!Number.isFinite(subtotal) || subtotal <= 0) {
    return { valid: false, message: 'Order subtotal is invalid.' };
  }

  if (!Number.isFinite(input.deliveryFee) || input.deliveryFee < 0) {
    return { valid: false, message: 'Delivery fee is invalid.' };
  }

  if (!Number.isFinite(input.total) || input.total <= 0 || input.total > subtotal + input.deliveryFee) {
    return { valid: false, message: 'Order total is invalid.' };
  }

  const customerName = normalizeString(input.userProfile.name);
  const customerPhone = normalizeString(input.userProfile.phone);
  if (customerName.length < 3 || customerPhone.length < 10) {
    return { valid: false, message: 'Please provide a valid name and phone number.' };
  }

  const notes = input.orderType === OrderType.DELIVERY ? normalizeString(input.deliveryArea).slice(0, MAX_NOTES_LENGTH) : '';

  return { valid: true, items, notes };
}

export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const validation = validateOrderInput(input);
  if (validation.valid === false) {
    throw new Error(validation.message);
  }

  const routedTasks = buildRoutedTasks(input.cart);
  const operationalRouting = classifyOrderOperationalRouting(validation.items, routedTasks);

  const order: PersistedOrder = {
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    businessDate: toBusinessDate(),
    status: 'pending',
    paymentStatus: 'pending',
    serviceMode: toServiceMode(input.orderType),
    serviceArea: operationalRouting.serviceArea,
    frontLane: operationalRouting.frontLane,
    dispatchMode: operationalRouting.dispatchMode,
    customer: {
      name: normalizeString(input.userProfile.name),
      phone: normalizeString(input.userProfile.phone),
      ...(validation.notes ? { location: validation.notes } : {}),
    },
    items: validation.items,
    subtotal: input.subtotal,
    deliveryFee: input.deliveryFee,
    total: input.total,
    notes: validation.notes,
    routedTasks,
    involvedStations: Array.from(new Set(
      routedTasks
        .map((task) => task.prepStation)
        .filter((station): station is PrepStation => !!station)
    )),
    stationStatus: {},
    ...(input.userId ? { userId: input.userId } : {}),
  };

  const docRef = await addDoc(collection(db, 'orders'), order);
  return { orderId: docRef.id, order };
}
