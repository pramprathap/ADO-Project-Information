import { SHAREPOINT_CONFIG } from '@/constants/sharepointConfig';
import {
  graphGet,
  getGraphTokenSilent,
  isGraphAuthError,
  isSharePointConfigured,
  resetGraphAuth,
} from './graphClient';
import type { EmployeeDirectory, LeaveProvider, Period, TimesheetProvider } from './resourceService';

/**
 * Live SharePoint providers (Microsoft Graph, delegated).
 *
 * - Leave:      /sites/Data/LMS       → list LMS_LeaveTransaction
 * - Timesheet:  /sites/TimesheetPro   → list Timesheet (daily header rows)
 *
 * Column internal names are resolved at runtime from each list's column
 * definitions (displayName → name). Person columns are requested via
 * `expand=fields($select=…)` so Graph returns `{ LookupValue, Email }`. Raw
 * rows are fetched once per provider instance and filtered per period.
 */
const GRAPH = 'https://graph.microsoft.com/v1.0';
const HOURS_PER_DAY = 8;

export type SpStatus = 'ok' | 'auth-required' | 'error' | 'disabled';
export type DayMode = 'office' | 'wfh' | 'leave';

export interface AttendanceInfo {
  leaveDays: number;
  wfhDays: number;
  /** Mode per working day, aligned with period.days. */
  dayMode: DayMode[];
}

export interface TimesheetDetail {
  submitted: number;
  approved: number;
  pending: number;
  /** Aligned with period.days. */
  byDaySubmitted: number[];
  byDayApproved: number[];
}

interface ColumnsResponse {
  value?: { name?: string; displayName?: string }[];
}
interface ItemsResponse {
  value?: { fields?: Record<string, unknown> }[];
  '@odata.nextLink'?: string;
}

const siteIdCache = new Map<string, string>();

/**
 * Resolve a site id. An explicit id from the config wins; otherwise the path is
 * resolved via Graph — and if a nested path like /sites/Data/LMS is not an
 * actual subsite, we fall back to its parent (/sites/Data), where the lists
 * live in that case.
 */
async function resolveSiteId(token: string, sitePath: string, explicitId?: string): Promise<string> {
  if (explicitId) return explicitId;
  const cached = siteIdCache.get(sitePath);
  if (cached) return cached;
  const byPath = async (p: string): Promise<string | null> => {
    try {
      const res = await graphGet<{ id?: string }>(token, `${GRAPH}/sites/${SHAREPOINT_CONFIG.host}:${p}`);
      return res.id ?? null;
    } catch {
      return null;
    }
  };
  let id = await byPath(sitePath);
  if (!id) {
    const parent = sitePath.replace(/\/[^/]+$/, '');
    if (parent && parent !== sitePath && parent !== '/sites') {
      console.warn(`Site path ${sitePath} not found — falling back to ${parent}.`);
      id = await byPath(parent);
    }
  }
  if (!id) throw new Error(`Site not found: ${sitePath}`);
  siteIdCache.set(sitePath, id);
  return id;
}

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

/**
 * Normalize a SharePoint date value to `YYYY-MM-DD`. Graph usually returns ISO
 * 8601, but text/locale-formatted columns can surface as `M/D/YYYY` — accept
 * both, otherwise the row is silently dropped (which zeroed all leave).
 */
function dateOnly(v: unknown): string {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) return '';
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // US M/D/YYYY (SharePoint display fallback — 4/15/2026 = 15 Apr).
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  // Last resort: let the engine parse it, then read UTC parts.
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
  return '';
}
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------- leave
interface LeaveRow {
  who: string;
  from: string;
  to: string;
  half: string;
  isWfh: boolean;
}

export class GraphLeaveProvider implements LeaveProvider {
  status: SpStatus = isSharePointConfigured() ? 'auth-required' : 'disabled';
  private rows: LeaveRow[] | null = null;
  constructor(private readonly loginHint?: string) {}

  get connected(): boolean {
    return this.status === 'ok';
  }

  /** Fetch (once) all approved leave/WFH transactions. */
  private async fetchRows(): Promise<LeaveRow[] | null> {
    if (this.rows) return this.rows;
    if (!isSharePointConfigured()) {
      this.status = 'disabled';
      return null;
    }
    try {
      const token = await getGraphTokenSilent(this.loginHint);
      if (!token) {
        this.status = 'auth-required';
        return null;
      }
      const siteId = await resolveSiteId(token, SHAREPOINT_CONFIG.lmsSitePath, SHAREPOINT_CONFIG.lmsSiteId);
      const cols = await columnMap(token, siteId, SHAREPOINT_CONFIG.leaveListName);
      const f = (label: string, fallback: string): string => cols.get(label) ?? fallback;
      const cRequestedBy = f('requested by', 'RequestedBy');
      const cFrom = f('from date', 'FromDate');
      const cTo = f('to date', 'ToDate');
      const cHalf = f('half day type', 'HalfDayType');
      const cType = f('leave type', 'LeaveType');
      const cStatus = f('status', 'Status');
      const raw = await listItems(token, siteId, SHAREPOINT_CONFIG.leaveListName, [
        cRequestedBy,
        cFrom,
        cTo,
        cHalf,
        cType,
        cStatus,
      ]);
      const rows: LeaveRow[] = [];
      for (const r of raw) {
        if (!/approv/i.test(String(r[cStatus] ?? ''))) continue;
        const who = normalizeName(personName(r[cRequestedBy]));
        const from = dateOnly(r[cFrom]);
        const to = dateOnly(r[cTo]) || from;
        if (!who || !from) continue;
        rows.push({
          who,
          from,
          to,
          half: String(r[cHalf] ?? ''),
          isWfh: /work\s*from\s*home|wfh/i.test(String(r[cType] ?? '')),
        });
      }
      this.rows = rows;
      this.status = 'ok';
      console.info(
        `[SharePoint] LMS leave: ${raw.length} rows read, ${rows.length} approved non-WFH parsed.`,
        rows.slice(0, 8).map((r) => `${r.who} ${r.from}→${r.to}`),
      );
      return rows;
    } catch (err) {
      console.warn('Leave (LMS) fetch failed.', err);
      if (isGraphAuthError(err)) {
        this.status = 'auth-required';
        void resetGraphAuth();
      } else {
        this.status = 'error';
      }
      return null;
    }
  }

  /** Approved absence hours per person (WFH is presence — not counted). */
  async getLeaveHours(period: Period): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    const rows = await this.fetchRows();
    if (!rows) return out;
    for (const r of rows) {
      if (r.isWfh) continue;
      const days = period.days.filter((d) => d >= r.from && d <= r.to).length;
      if (days <= 0) continue;
      const hrs = days === 1 && r.half && !/^na$/i.test(r.half) ? HOURS_PER_DAY / 2 : days * HOURS_PER_DAY;
      out.set(r.who, (out.get(r.who) ?? 0) + hrs);
    }
    return out;
  }

  /** Approved leave hours per working day of the period, per person. */
  async getLeaveHoursByDay(period: Period): Promise<Map<string, number[]>> {
    const out = new Map<string, number[]>();
    const rows = await this.fetchRows();
    if (!rows) return out;
    for (const r of rows) {
      if (r.isWfh) continue;
      const coveredIdx = period.days
        .map((d, i) => (d >= r.from && d <= r.to ? i : -1))
        .filter((i) => i >= 0);
      if (coveredIdx.length === 0) continue;
      // A half-day flag only applies to a single-day leave.
      const perDay =
        coveredIdx.length === 1 && r.half && !/^na$/i.test(r.half)
          ? HOURS_PER_DAY / 2
          : HOURS_PER_DAY;
      const arr = out.get(r.who) ?? period.days.map(() => 0);
      for (const i of coveredIdx) arr[i] = Math.min(HOURS_PER_DAY, arr[i] + perDay);
      out.set(r.who, arr);
    }
    return out;
  }

  /** Per-person attendance (office / WFH / leave) for the period. */
  async getAttendance(period: Period): Promise<Map<string, AttendanceInfo>> {
    const out = new Map<string, AttendanceInfo>();
    const rows = await this.fetchRows();
    if (!rows) return out;
    const byWho = new Map<string, LeaveRow[]>();
    for (const r of rows) {
      const list = byWho.get(r.who) ?? [];
      list.push(r);
      byWho.set(r.who, list);
    }
    for (const [who, list] of byWho) {
      const dayMode: DayMode[] = period.days.map((d) => {
        // Leave wins over WFH on the same day.
        if (list.some((r) => !r.isWfh && d >= r.from && d <= r.to)) return 'leave';
        if (list.some((r) => r.isWfh && d >= r.from && d <= r.to)) return 'wfh';
        return 'office';
      });
      out.set(who, {
        leaveDays: dayMode.filter((m) => m === 'leave').length,
        wfhDays: dayMode.filter((m) => m === 'wfh').length,
        dayMode,
      });
    }
    return out;
  }
}

// ---------------------------------------------------------------- employees
/**
 * Reads the TimesheetPro `EmployeeList` and exposes the set of currently-Active
 * employees (normalized names). The resource views use this to hide people
 * whose `EmployeeStatus` is not "Active" (e.g. left the company / inactive),
 * even if stale Boards assignments still reference them.
 */
export class GraphEmployeeProvider implements EmployeeDirectory {
  status: SpStatus = isSharePointConfigured() ? 'auth-required' : 'disabled';
  private names: Set<string> | null = null;
  constructor(private readonly loginHint?: string) {}

  get connected(): boolean {
    return this.status === 'ok';
  }

  async getActiveNames(): Promise<Set<string>> {
    if (this.names) return this.names;
    if (!isSharePointConfigured()) {
      this.status = 'disabled';
      return new Set();
    }
    try {
      const token = await getGraphTokenSilent(this.loginHint);
      if (!token) {
        this.status = 'auth-required';
        return new Set();
      }
      const siteId = await resolveSiteId(
        token,
        SHAREPOINT_CONFIG.timesheetSitePath,
        SHAREPOINT_CONFIG.timesheetSiteId,
      );
      const cols = await columnMap(token, siteId, SHAREPOINT_CONFIG.employeeListName);
      const f = (label: string, fallback: string): string => cols.get(label) ?? fallback;
      const cEmployee = f('employee', 'Employee');
      const cStatus = f('employeestatus', 'EmployeeStatus');
      const raw = await listItems(token, siteId, SHAREPOINT_CONFIG.employeeListName, [
        cEmployee,
        cStatus,
      ]);
      const set = new Set<string>();
      for (const r of raw) {
        if (!/^\s*active\s*$/i.test(String(r[cStatus] ?? ''))) continue;
        const who = normalizeName(personName(r[cEmployee]));
        if (who) set.add(who);
      }
      this.names = set;
      this.status = 'ok';
      return set;
    } catch (err) {
      console.warn('EmployeeList (TimesheetPro) fetch failed.', err);
      if (isGraphAuthError(err)) {
        this.status = 'auth-required';
        void resetGraphAuth();
      } else {
        this.status = 'error';
      }
      return new Set();
    }
  }
}

// ---------------------------------------------------------------- timesheet
interface TsRow {
  who: string;
  day: string;
  submitted: number;
  pending: number;
}

export class GraphTimesheetProvider implements TimesheetProvider {
  status: SpStatus = isSharePointConfigured() ? 'auth-required' : 'disabled';
  private rows: TsRow[] | null = null;
  constructor(private readonly loginHint?: string) {}

  get connected(): boolean {
    return this.status === 'ok';
  }

  /** Fetch (once) all timesheet header rows. */
  private async fetchRows(): Promise<TsRow[] | null> {
    if (this.rows) return this.rows;
    if (!isSharePointConfigured()) {
      this.status = 'disabled';
      return null;
    }
    try {
      const token = await getGraphTokenSilent(this.loginHint);
      if (!token) {
        this.status = 'auth-required';
        return null;
      }
      const siteId = await resolveSiteId(token, SHAREPOINT_CONFIG.timesheetSitePath, SHAREPOINT_CONFIG.timesheetSiteId);
      const cols = await columnMap(token, siteId, SHAREPOINT_CONFIG.timesheetListName);
      const f = (label: string, fallback: string): string => cols.get(label) ?? fallback;
      const cEmployee = f('employee', 'Employee');
      const cDate = f('date', 'Date');
      const cSubmitted = f('submitted hours', 'SubmittedHours');
      const cPending = f('pending hours', 'PendingHours');
      const raw = await listItems(token, siteId, SHAREPOINT_CONFIG.timesheetListName, [
        cEmployee,
        cDate,
        cSubmitted,
        cPending,
      ]);
      const rows: TsRow[] = [];
      for (const r of raw) {
        const who = normalizeName(personName(r[cEmployee]));
        const day = dateOnly(r[cDate]);
        if (!who || !day) continue;
        rows.push({ who, day, submitted: num(r[cSubmitted]), pending: num(r[cPending]) });
      }
      this.rows = rows;
      this.status = 'ok';
      return rows;
    } catch (err) {
      console.warn('Timesheet (TimesheetPro) fetch failed.', err);
      if (isGraphAuthError(err)) {
        this.status = 'auth-required';
        void resetGraphAuth();
      } else {
        this.status = 'error';
      }
      return null;
    }
  }

  async getTimesheetHours(
    period: Period,
  ): Promise<Map<string, { submitted: number; approved: number }>> {
    const detail = await this.getDetail(period);
    const out = new Map<string, { submitted: number; approved: number }>();
    for (const [who, d] of detail) out.set(who, { submitted: d.submitted, approved: d.approved });
    return out;
  }

  /** Full per-person detail with per-day series (for the Effort page). */
  async getDetail(period: Period): Promise<Map<string, TimesheetDetail>> {
    const out = new Map<string, TimesheetDetail>();
    const rows = await this.fetchRows();
    if (!rows) return out;
    const start = period.days[0];
    const end = period.days[period.days.length - 1];
    for (const r of rows) {
      if (r.day < start || r.day > end) continue;
      let d = out.get(r.who);
      if (!d) {
        d = {
          submitted: 0,
          approved: 0,
          pending: 0,
          byDaySubmitted: period.days.map(() => 0),
          byDayApproved: period.days.map(() => 0),
        };
        out.set(r.who, d);
      }
      const idx = period.days.indexOf(r.day);
      // Submitted = everything entered; Approved = submitted minus pending.
      d.submitted += r.submitted + r.pending;
      d.approved += r.submitted;
      d.pending += r.pending;
      if (idx >= 0) {
        d.byDaySubmitted[idx] += r.submitted + r.pending;
        d.byDayApproved[idx] += r.submitted;
      }
    }
    return out;
  }
}
