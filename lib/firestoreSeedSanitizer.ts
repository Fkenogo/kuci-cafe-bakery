type FirestoreSanitized =
  | null
  | boolean
  | number
  | string
  | FirestoreSanitized[]
  | { [key: string]: FirestoreSanitized };

interface SanitizeResult {
  sanitized: FirestoreSanitized;
  undefinedPaths: string[];
  nanPaths: string[];
  unsupportedPaths: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sanitizeInternal(value: unknown, path: string, result: SanitizeResult): FirestoreSanitized | undefined {
  if (value === undefined) {
    result.undefinedPaths.push(path);
    return undefined;
  }

  if (typeof value === 'number' && Number.isNaN(value)) {
    result.nanPaths.push(path);
    return undefined;
  }

  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value as FirestoreSanitized;
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => {
      const sanitized = sanitizeInternal(entry, `${path}[${index}]`, result);
      return sanitized === undefined ? [] : [sanitized];
    });
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (isPlainObject(value)) {
    const next: Record<string, FirestoreSanitized> = {};
    for (const [key, entry] of Object.entries(value)) {
      const sanitized = sanitizeInternal(entry, path ? `${path}.${key}` : key, result);
      if (sanitized !== undefined) {
        next[key] = sanitized;
      }
    }
    return next;
  }

  result.unsupportedPaths.push(path);
  return undefined;
}

export function sanitizeForFirestoreWrite(value: unknown): SanitizeResult {
  const result: SanitizeResult = {
    sanitized: null,
    undefinedPaths: [],
    nanPaths: [],
    unsupportedPaths: [],
  };

  const sanitized = sanitizeInternal(value, '', result);
  result.sanitized = sanitized === undefined ? null : sanitized;
  return result;
}

export function collectUndefinedPaths(value: unknown): string[] {
  return sanitizeForFirestoreWrite(value).undefinedPaths;
}
