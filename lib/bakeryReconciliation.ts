import { BakeryDailyReconciliationLine, BakeryItem, BakeryStockSnapshot, PersistedOrder } from '../types';
import { compareBusinessDates, toBusinessDate, toDateFromUnknown } from './businessDate';

export interface BakeryStockMathInput {
  openingStock: number;
  receivedStock: number;
  soldStock: number;
  waste: number;
  adjustment: number;
  closingActual?: number;
}

export interface BakeryReconciliationTotals {
  openingStock: number;
  receivedStock: number;
  soldStock: number;
  expectedSalesValue: number;
  waste: number;
  adjustment: number;
  closingExpected: number;
  closingActual: number;
  variance: number;
}

function normalizeNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return value;
}

export { toBusinessDate };

export function parseBusinessDateToRange(date: string): { start: Date; end: Date } {
  const [year, month, day] = date.split('-').map((part) => Number(part));
  const start = new Date(Date.UTC(year, (month || 1) - 1, day || 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, (month || 1) - 1, (day || 1) + 1, 0, 0, 0, 0));
  return { start, end };
}

export function timestampToDate(value: unknown): Date | null {
  return toDateFromUnknown(value);
}

export function computeBakeryClosingExpected(input: BakeryStockMathInput): number {
  return (
    normalizeNumber(input.openingStock) +
    normalizeNumber(input.receivedStock) -
    normalizeNumber(input.soldStock) -
    normalizeNumber(input.waste) +
    normalizeNumber(input.adjustment)
  );
}

export function buildBakeryReconciliationLine(
  base: Omit<BakeryDailyReconciliationLine, 'closingExpected' | 'variance' | 'expectedSalesValue'>
): BakeryDailyReconciliationLine {
  const closingExpected = computeBakeryClosingExpected(base);
  const expectedSalesValue = normalizeNumber(base.soldStock) * normalizeNumber(base.unitPrice);
  const variance = typeof base.closingActual === 'number'
    ? base.closingActual - closingExpected
    : undefined;

  return {
    ...base,
    expectedSalesValue,
    closingExpected,
    ...(typeof variance === 'number' ? { variance } : {}),
  };
}

export function computeBakeryReconciliationTotals(lines: BakeryDailyReconciliationLine[]): BakeryReconciliationTotals {
  return lines.reduce<BakeryReconciliationTotals>((acc, line) => {
    const closingActual = typeof line.closingActual === 'number' ? line.closingActual : 0;
    const variance = typeof line.variance === 'number' ? line.variance : closingActual - line.closingExpected;

    acc.openingStock += normalizeNumber(line.openingStock);
    acc.receivedStock += normalizeNumber(line.receivedStock);
    acc.soldStock += normalizeNumber(line.soldStock);
    acc.expectedSalesValue += normalizeNumber(line.expectedSalesValue);
    acc.waste += normalizeNumber(line.waste);
    acc.adjustment += normalizeNumber(line.adjustment);
    acc.closingExpected += normalizeNumber(line.closingExpected);
    acc.closingActual += closingActual;
    acc.variance += variance;
    return acc;
  }, {
    openingStock: 0,
    receivedStock: 0,
    soldStock: 0,
    expectedSalesValue: 0,
    waste: 0,
    adjustment: 0,
    closingExpected: 0,
    closingActual: 0,
    variance: 0,
  });
}

export function buildOpeningLinesFromItems(
  bakeryItems: BakeryItem[],
  previousSnapshotsBySku: Record<string, BakeryStockSnapshot | undefined>,
  soldBySku: Record<string, number>
): BakeryDailyReconciliationLine[] {
  return bakeryItems
    .filter((item) => item.active)
    .map((item) => {
      const sku = item.sku?.trim() || item.id;
      const previous = previousSnapshotsBySku[sku];
      const openingStock = typeof previous?.closingActual === 'number' ? previous.closingActual : 0;

      return buildBakeryReconciliationLine({
        sku,
        itemId: item.id,
        itemName: item.name,
        unitPrice: typeof item.price === 'number' && Number.isFinite(item.price) ? item.price : 0,
        openingStock,
        receivedStock: 0,
        soldStock: soldBySku[sku] || 0,
        waste: 0,
        adjustment: 0,
      });
    })
    .sort((a, b) => a.itemName.localeCompare(b.itemName));
}

export function computeBakerySoldBySkuForDate(
  orders: PersistedOrder[],
  businessDate: string,
  bakeryItems: BakeryItem[]
): Record<string, number> {
  const bakeryItemById = new Map<string, BakeryItem>();
  bakeryItems.forEach((item) => bakeryItemById.set(item.id, item));

  const soldBySku: Record<string, number> = {};

  orders.forEach((order) => {
    if (order.status !== 'completed') return;

    const orderBusinessDate = typeof order.businessDate === 'string'
      ? order.businessDate
      : (() => {
          const fallbackDate = timestampToDate(order.createdAt) || timestampToDate(order.updatedAt);
          return fallbackDate ? toBusinessDate(fallbackDate) : null;
        })();
    if (!orderBusinessDate || orderBusinessDate !== businessDate) return;

    order.items.forEach((line) => {
      const bakeryItem = bakeryItemById.get(line.itemId);
      if (!bakeryItem) return;
      if (line.serviceArea && line.serviceArea !== 'bakery') return;

      const sku = bakeryItem.sku?.trim() || bakeryItem.id;
      soldBySku[sku] = (soldBySku[sku] || 0) + Math.max(0, Math.floor(line.quantity || 0));
    });
  });

  return soldBySku;
}

export function mergeManualLineFields(
  existing: BakeryDailyReconciliationLine,
  updates: Pick<BakeryDailyReconciliationLine, 'receivedStock' | 'waste' | 'adjustment' | 'closingActual'>,
  soldStock: number
): BakeryDailyReconciliationLine {
  return buildBakeryReconciliationLine({
    sku: existing.sku,
    itemId: existing.itemId,
    itemName: existing.itemName,
    unitPrice: normalizeNumber(existing.unitPrice),
    openingStock: normalizeNumber(existing.openingStock),
    receivedStock: normalizeNumber(updates.receivedStock),
    soldStock: normalizeNumber(soldStock),
    waste: normalizeNumber(updates.waste),
    adjustment: normalizeNumber(updates.adjustment),
    ...(typeof updates.closingActual === 'number' ? { closingActual: normalizeNumber(updates.closingActual) } : {}),
  });
}

export function buildPreviousSnapshotIndex(snapshots: BakeryStockSnapshot[]): Record<string, BakeryStockSnapshot | undefined> {
  const bySku: Record<string, BakeryStockSnapshot | undefined> = {};

  snapshots
    .slice()
    .sort((a, b) => compareBusinessDates(b.businessDate, a.businessDate))
    .forEach((snapshot) => {
      if (!bySku[snapshot.sku]) {
        bySku[snapshot.sku] = snapshot;
      }
    });

  return bySku;
}
