const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DDMMYYYY_REGEX = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function isIsoBusinessDate(value: string): boolean {
  return ISO_DATE_REGEX.test(value);
}

export function toBusinessDate(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function formatBusinessDateDisplay(isoDate: string): string {
  if (!isIsoBusinessDate(isoDate)) return 'Invalid date';
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

export function parseBusinessDateInput(value: string, fallback: string = toBusinessDate()): string {
  const normalized = value.trim();
  if (isIsoBusinessDate(normalized)) return normalized;

  const ddmmyyyy = normalized.match(DDMMYYYY_REGEX);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    const candidate = `${year}-${month}-${day}`;
    return isIsoBusinessDate(candidate) ? candidate : fallback;
  }

  return fallback;
}

export function compareBusinessDates(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function toDateFromUnknown(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (!value || typeof value !== 'object') return null;
  if ('toDate' in value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isFinite(date.getTime()) ? date : null;
  }
  return null;
}
