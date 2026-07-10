/**
 * Date helpers. All persisted dates use the ISO calendar-date form `YYYY-MM-DD`
 * (no time component, no timezone) so a project's dates are stable regardless of
 * the viewer's timezone.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True if the string is a well-formed, real `YYYY-MM-DD` date. */
export function isValidIsoDate(value: string | undefined | null): value is string {
  if (!value || !ISO_DATE_RE.test(value)) {
    return false;
  }
  const [y, m, d] = value.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) {
    return false;
  }
  // Round-trip through Date to reject impossible dates like 2024-02-31.
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Normalise a possibly-empty date input to a clean ISO date or `undefined`. */
export function normalizeIsoDate(value: string | undefined | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return isValidIsoDate(trimmed) ? trimmed : undefined;
}

/**
 * Compare two ISO dates. Returns a negative number if a < b, 0 if equal, a
 * positive number if a > b. Callers should pre-validate with isValidIsoDate.
 */
export function compareIsoDates(a: string, b: string): number {
  // ISO `YYYY-MM-DD` strings sort lexicographically in chronological order.
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Format an ISO date for display; returns an em dash for empty values. */
export function formatIsoDateForDisplay(value: string | undefined | null): string {
  if (!isValidIsoDate(value ?? '')) {
    return '—';
  }
  const [y, m, d] = (value as string).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Current time as an ISO 8601 UTC timestamp. Isolated here so the single call
 * site is easy to reason about and to stub in tests.
 */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Format an ISO 8601 timestamp for display, or em dash when absent/invalid. */
export function formatTimestampForDisplay(value: string | undefined | null): string {
  if (!value) {
    return '—';
  }
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) {
    return '—';
  }
  return dt.toLocaleString();
}
