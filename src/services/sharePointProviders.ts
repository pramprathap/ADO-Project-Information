import { SHAREPOINT_CONFIG } from '@/constants/sharepointConfig';
import { graphGet, getGraphTokenSilent, isSharePointConfigured } from './graphClient';
import type { LeaveProvider, Period, TimesheetProvider } from './resourceService';

/**
 * Live SharePoint providers (Microsoft Graph, delegated).
 *
 * - Leave:      /sites/Data/LMS       → list LMS_LeaveTransaction
 * - Timesheet:  /sites/TimesheetPro   → list Timesheet (daily header rows)
 *
 * Column internal names are resolved at runtime from each list's column
 * definitions (displayName → name), so UI-created columns with encoded names
 * ("From_x0020_Date") keep working. Person columns are requested via
 * `expand=fields($select=…)` so Graph returns `{ LookupValue, Email }`.
 */
const GRAPH = 'https://graph.microsoft.com/v1.0';
const HOURS_PER_DAY = 8;

export type SpStatus = 'ok' | 'auth-required' | 'error' | 'disabled';

interface ColumnsResponse {
  value?: { name?: string; displayName?: string }[];
}
interface ItemsResponse {
  value?: { fields?: Record<string, unknown> }[];
  '@odata.nextLink'?: string;
}

const siteIdCache = new Map<string, string>();

async function resolveSiteId(token: string, sitePath: string): Promise<string> {
  const cached = siteIdCache.get(sitePath);
  if (cached) return cached;
  const res = await graphGet<{ id?: string }>(
    token,
    `${GRAPH}/sites/${SHAREPOINT_CONFIG.host}:${sitePath}`,
  );
  if (!res.id) throw new Error(`Site not found: ${sitePath}`);
  siteIdCache.set(sitePath, res.id);
  return res.id;
}

/** displayName → internal name map for a list. */
async function columnMap(token: string, siteId: string, list: string): Promise<Map<string, string>> {
  const res = await graphGet<ColumnsResponse>(
    token,
    `${GRAPH}/sites/${siteId}/lists/${encodeURIComponent(list)}/columns?$top=200`,
  );
  const map = new Map<string, string>();
  for (const c of res.value ?? []) {
    if (c.displayName && c.name) map.set(c.displayName.trim().toLowerCase(), c.name);
  }
  return map;
}

async function listItems(
  token: string,
  siteId: string,
  list: string,
  selectFields: string[],
): Promise<Record<string, unknown>[]> {
  const select = selectFields.join(',');
  let url = `${GRAPH}/sites/${siteId}/lists/${encodeURIComponent(list)}/items?$top=500&expand=fields($select=${encodeURIComponent(select)})`;
  const out: Record<string, unknown>[] = [];
  for (let page = 0; page < 20 && url; page += 1) {
    const res = await graphGet<ItemsResponse>(token, url);
    for (const it of res.value ?? []) {
      if (it.fields) out.push(it.fields);
    }
    url = res['@odata.nextLink'] ?? '';
  }
  return out;
}

/** Person-column value → display name (handles object / array / string). */
function personName(v: unknown): string {
  if (!v) return '';
  if (Array.isArray(v)) return personName(v[0]);
  if (typeof v === 'object') {
    const o = v as { LookupValue?: unknown; Email?: unknown };
    return String(o.LookupValue ?? o.Email ?? '');
  }
  return typeof v === 'string' ? v : '';
}

/**
 * Normalize a person display name for cross-system matching. SharePoint shows
 * "RamPrathap P | Veelead"; Azure DevOps shows "RamPrathap P" — strip the
 * "| suffix", the company word and whitespace/case differences.
 */
export function normalizeName(name: string): string {
  return name
    .split('|')[0]
    .replace(/veelead/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function dateOnly(v: unknown): string {
  const s = typeof v === 'string' ? v : '';
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Working days (from period.days) within [from, to]. */
function overlapDays(period: Period, from: string, to: string): number {
  if (!from || !to) return 0;
  return period.days.filter((d) => d >= from && d <= to).length;
}

// ---------------------------------------------------------------- leave
export class GraphLeaveProvider implements LeaveProvider {
  status: SpStatus = isSharePointConfigured() ? 'auth-required' : 'disabled';
  constructor(private readonly loginHint?: string) {}

  get connected(): boolean {
    return this.status === 'ok';
  }

  async getLeaveHours(period: Period): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (!isSharePointConfigured()) {
      this.status = 'disabled';
      return out;
    }
    try {
      const token = await getGraphTokenSilent(this.loginHint);
      if (!token) {
        this.status = 'auth-required';
        return out;
      }
      const siteId = await resolveSiteId(token, SHAREPOINT_CONFIG.lmsSitePath);
      const cols = await columnMap(token, siteId, SHAREPOINT_CONFIG.leaveListName);
      const f = (label: string, fallback: string): string => cols.get(label) ?? fallback;
      const cRequestedBy = f('requested by', 'RequestedBy');
      const cFrom = f('from date', 'FromDate');
      const cTo = f('to date', 'ToDate');
      const cHalf = f('half day type', 'HalfDayType');
      const cType = f('leave type', 'LeaveType');
      const cStatus = f('status', 'Status');

      const rows = await listItems(token, siteId, SHAREPOINT_CONFIG.leaveListName, [
        cRequestedBy,
        cFrom,
        cTo,
        cHalf,
        cType,
        cStatus,
      ]);
      for (const r of rows) {
        const status = String(r[cStatus] ?? '');
        if (!/approv/i.test(status)) continue;
        const type = String(r[cType] ?? '');
        // WFH is presence, not absence — it does not reduce capacity.
        if (/work\s*from\s*home|wfh/i.test(type)) continue;
        const who = normalizeName(personName(r[cRequestedBy]));
        if (!who) continue;
        const from = dateOnly(r[cFrom]);
        const to = dateOnly(r[cTo]) || from;
        const days = overlapDays(period, from, to);
        if (days <= 0) continue;
        const half = String(r[cHalf] ?? '');
        const hrs = days === 1 && half && !/^na$/i.test(half) ? HOURS_PER_DAY / 2 : days * HOURS_PER_DAY;
        out.set(who, (out.get(who) ?? 0) + hrs);
      }
      this.status = 'ok';
      return out;
    } catch (err) {
      console.warn('Leave (LMS) fetch failed.', err);
      this.status = 'error';
      return out;
    }
  }
}

// ---------------------------------------------------------------- timesheet
export class GraphTimesheetProvider implements TimesheetProvider {
  status: SpStatus = isSharePointConfigured() ? 'auth-required' : 'disabled';
  constructor(private readonly loginHint?: string) {}

  get connected(): boolean {
    return this.status === 'ok';
  }

  async getTimesheetHours(
    period: Period,
  ): Promise<Map<string, { submitted: number; approved: number }>> {
    const out = new Map<string, { submitted: number; approved: number }>();
    if (!isSharePointConfigured()) {
      this.status = 'disabled';
      return out;
    }
    try {
      const token = await getGraphTokenSilent(this.loginHint);
      if (!token) {
        this.status = 'auth-required';
        return out;
      }
      const siteId = await resolveSiteId(token, SHAREPOINT_CONFIG.timesheetSitePath);
      const cols = await columnMap(token, siteId, SHAREPOINT_CONFIG.timesheetListName);
      const f = (label: string, fallback: string): string => cols.get(label) ?? fallback;
      const cEmployee = f('employee', 'Employee');
      const cDate = f('date', 'Date');
      const cSubmitted = f('submitted hours', 'SubmittedHours');
      const cPending = f('pending hours', 'PendingHours');

      const rows = await listItems(token, siteId, SHAREPOINT_CONFIG.timesheetListName, [
        cEmployee,
        cDate,
        cSubmitted,
        cPending,
      ]);
      const start = period.days[0];
      const end = period.days[period.days.length - 1];
      for (const r of rows) {
        const day = dateOnly(r[cDate]);
        if (!day || day < start || day > end) continue;
        const who = normalizeName(personName(r[cEmployee]));
        if (!who) continue;
        const submitted = num(r[cSubmitted]);
        const pending = num(r[cPending]);
        const cur = out.get(who) ?? { submitted: 0, approved: 0 };
        // Submitted = everything entered; Approved = submitted minus pending.
        cur.submitted += submitted + pending;
        cur.approved += submitted;
        out.set(who, cur);
      }
      this.status = 'ok';
      return out;
    } catch (err) {
      console.warn('Timesheet (TimesheetPro) fetch failed.', err);
      this.status = 'error';
      return out;
    }
  }
}
