import { buildProjectServices, type OrgContext, type ProjectRef } from './orgServices';
import { normalizeName } from './sharePointProviders';
import { fromProperties } from '@/utils/propertyMapper';

/** Hours assumed per working day when computing capacity. */
export const HOURS_PER_DAY = 8;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---------------------------------------------------------------- period
export type PeriodMode = 'current' | 'week' | 'month';

/** One heatmap column: a label and the indices of `days` it aggregates. */
export interface PeriodCol {
  label: string;
  idx: number[];
}

export interface Period {
  mode: PeriodMode;
  /** All working days (Mon–Fri) in the period, YYYY-MM-DD. */
  days: string[];
  /** Display label per day, e.g. "Mon 23 Jun". */
  dayLabels: string[];
  /** Heatmap columns: the 5 days (week modes) or 4 calendar weeks (month). */
  cols: PeriodCol[];
  label: string;
}

function toStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}
function fromStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function fmtDayLabel(s: string): string {
  const d = fromStr(s);
  return `${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][(d.getDay() + 6) % 7]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const f = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t.getTime() - f.getTime()) / 86400000 - 3 + ((f.getUTCDay() + 6) % 7)) / 7);
}
function mondayOfWeek(offsetWeeks: number): Date {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7) + offsetWeeks * 7);
  return monday;
}

/** The Mon–Fri working week `offsetWeeks` from the current one. */
export function weekPeriod(offsetWeeks: number, mode: PeriodMode = 'current'): Period {
  const monday = mondayOfWeek(offsetWeeks);
  const days: string[] = [];
  for (let i = 0; i < 5; i += 1) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(toStr(d));
  }
  const dayLabels = days.map(fmtDayLabel);
  const s = fromStr(days[0]);
  const e = fromStr(days[4]);
  return {
    mode,
    days,
    dayLabels,
    cols: dayLabels.map((label, i) => ({ label, idx: [i] })),
    label: `${s.getDate()} ${MONTHS[s.getMonth()]} – ${e.getDate()} ${MONTHS[e.getMonth()]}`,
  };
}

/** Four calendar weeks starting the first Monday of the selected month. */
export function monthPeriod(year: number, monthIdx: number): Period {
  const first = new Date(year, monthIdx, 1);
  while (first.getDay() !== 1) first.setDate(first.getDate() + 1);
  const days: string[] = [];
  const cols: PeriodCol[] = [];
  for (let w = 0; w < 4; w += 1) {
    const idx: number[] = [];
    const ws = new Date(first);
    ws.setDate(first.getDate() + w * 7);
    for (let i = 0; i < 5; i += 1) {
      const d = new Date(ws);
      d.setDate(ws.getDate() + i);
      idx.push(days.length);
      days.push(toStr(d));
    }
    const we = new Date(ws);
    we.setDate(ws.getDate() + 4);
    cols.push({
      label: `CW${isoWeek(ws)} · ${ws.getDate()} ${MONTHS[ws.getMonth()]}–${we.getDate()} ${MONTHS[we.getMonth()]}`,
      idx,
    });
  }
  return {
    mode: 'month',
    days,
    dayLabels: days.map(fmtDayLabel),
    cols,
    label: `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][monthIdx]} ${year}`,
  };
}

/** "Week 28 · 7–11 Jul"-style options for the By-week dropdown. */
export function weekOptions(): { label: string; offset: number }[] {
  return [1, 0, -1, -2, -3, -4].map((offset) => {
    const monday = mondayOfWeek(offset);
    const fri = new Date(monday);
    fri.setDate(monday.getDate() + 4);
    return {
      offset,
      label: `Week ${isoWeek(monday)} · ${monday.getDate()}${monday.getMonth() === fri.getMonth() ? '' : ' ' + MONTHS[monday.getMonth()]}–${fri.getDate()} ${MONTHS[fri.getMonth()]}`,
    };
  });
}

// ---------------------------------------------------------------- leave (LMS)
/**
 * Leave/WFH per person for a period, in hours. Source of truth is the SharePoint
 * LMS at https://veeleadsolutions.sharepoint.com/sites/Data/LMS/ — list
 * `LMS_LeaveTransaction` (Requested By, From/To Date, Number of Days, Half Day
 * Type, Number of Hours, Leave Type — incl. "Work From Home" —, Status=Approved).
 *
 * The Azure DevOps iframe cannot call SharePoint directly (auth + CORS), so this
 * adapter is served by the middle-tier API (AAD-secured Azure Function reading
 * the list via Microsoft Graph). Until that endpoint is deployed the stub
 * returns no data and the UI flags leave as "LMS connection pending".
 */
export interface LeaveProvider {
  getLeaveHours(period: Period): Promise<Map<string, number>>;
  readonly connected: boolean;
}

export const leaveNotConnected: LeaveProvider = {
  connected: false,
  async getLeaveHours(): Promise<Map<string, number>> {
    return new Map();
  },
};

/**
 * Timesheet hours per person for a period. Source of truth is the SharePoint
 * TimesheetPro site (https://veeleadsolutions.sharepoint.com/sites/TimesheetPro/):
 * lists `Timesheet` (header: Employee, Date, Submitted/Pending/Total/Billable
 * hours) and `Timesheet Entries` (line items with **Azure work-item ids** —
 * Epic/Feature/UserStory/Task-Bug ID — Estimate/Submitted hours and Approval
 * Status), joining to Boards by work-item id + Employee. Served by the same
 * middle-tier API as leave; stubbed until it is deployed.
 */
export interface TimesheetProvider {
  getTimesheetHours(period: Period): Promise<Map<string, { submitted: number; approved: number }>>;
  readonly connected: boolean;
}

export const timesheetNotConnected: TimesheetProvider = {
  connected: false,
  async getTimesheetHours(): Promise<Map<string, { submitted: number; approved: number }>> {
    return new Map();
  },
};

// ---------------------------------------------------------------- data shapes
export interface ProjectSplitDay {
  project: string;
  /** Hours per day of the period, aligned with period.days. */
  day: number[];
  total: number;
}

/** Work items completed in the period (by type) + current in-progress, per project. */
export interface ProjectWork {
  project: string;
  stories: number;
  tasks: number;
  bugs: number;
  completed: number;
  inprog: number;
}

/** One work item contributing to a person's allocation (for the breakdown). */
export interface AllocItem {
  id: number;
  title: string;
  type: string;
  state: string;
  project: string;
  startDate?: string;
  dueDate?: string;
  /** Hours attributed to the whole period. */
  hrs: number;
  /** Hours attributed per day, aligned with period.days. */
  day: number[];
}

export interface ResourcePerson {
  name: string;
  role: string;
  capacityHrs: number;
  leaveHrs: number;
  allocatedHrs: number;
  /** allocated / (capacity − leave), as a percentage. */
  utilPct: number;
  /** Allocation per working day (hrs), aligned with period.days. */
  byDay: number[];
  /** Allocation split per project with per-day detail. */
  byProject: ProjectSplitDay[];
  /** Work delivered in the period + in-progress load, per project. */
  work: ProjectWork[];
  /** The work items behind the allocation (transparency for the load %). */
  items: AllocItem[];
  /** Timesheet entered hours (LMS) — 0 until the middle-tier is connected. */
  timesheetHrs: number;
}

export interface ProjectAllocation {
  name: string;
  lead: string;
  total: number;
  people: { name: string; hrs: number }[];
  /** Project hours per day of the period (for the roll-up grid). */
  byDay: number[];
}

export interface ResourceData {
  period: Period;
  people: ResourcePerson[];
  projects: ProjectAllocation[];
  totalCapacity: number;
  totalAllocated: number;
  utilPct: number;
  underCount: number;
  overCount: number;
  leaveConnected: boolean;
  timesheetConnected: boolean;
}

// ---------------------------------------------------------------- loader
/**
 * Build the org-wide Resource Allocation dataset: every open assigned
 * Task/Bug/User Story across all projects, distributed over the period's
 * working days (schedule-window overlap; undated open items count as current
 * workload spread across the period).
 */
export async function loadResourceData(
  org: OrgContext,
  projects: ProjectRef[],
  period: Period,
  leave: LeaveProvider = leaveNotConnected,
  timesheet: TimesheetProvider = timesheetNotConnected,
  onProgress?: (done: number, total: number) => void,
): Promise<ResourceData> {
  interface P {
    byProject: Map<string, number[]>;
    byDay: number[];
    work: Map<string, ProjectWork>;
    items: AllocItem[];
  }
  const personMap = new Map<string, P>();
  const projDay = new Map<string, { lead: string; byDay: number[]; people: Map<string, number> }>();
  const roleByName = new Map<string, string>();
  let done = 0;

  const ensure = (name: string): P => {
    let p = personMap.get(name);
    if (!p) {
      p = { byProject: new Map(), byDay: period.days.map(() => 0), work: new Map(), items: [] };
      personMap.set(name, p);
    }
    return p;
  };
  const ensureWork = (p: P, project: string): ProjectWork => {
    let w = p.work.get(project);
    if (!w) {
      w = { project, stories: 0, tasks: 0, bugs: 0, completed: 0, inprog: 0 };
      p.work.set(project, w);
    }
    return w;
  };

  const queue = [...projects];
  const worker = async (): Promise<void> => {
    for (;;) {
      const project = queue.shift();
      if (!project) return;
      try {
        const services = buildProjectServices(org, project);
        const [assignments, bag] = await Promise.all([
          services.workItems.getAssignments(),
          services.properties.load().catch(() => ({})),
        ]);
        const info = fromProperties(bag);
        for (const member of info.team ?? []) {
          const display = member.identity?.displayName;
          if (display && member.role && !roleByName.has(display)) {
            roleByName.set(display, member.role);
          }
        }
        const lead = info.projectManager?.displayName || '—';

        const periodStart = period.days[0];
        const periodEnd = period.days[period.days.length - 1];
        for (const a of assignments) {
          const p = ensure(a.assignee);
          const w = ensureWork(p, project.name);
          if (a.done) {
            // Delivered-in-period counts (for the Effort page detail).
            const cd = a.closedDate ?? '';
            if (cd >= periodStart && cd <= periodEnd) {
              w.completed += 1;
              if (a.type === 'User Story') w.stories += 1;
              else if (a.type === 'Bug') w.bugs += 1;
              else w.tasks += 1;
            }
            continue;
          }
          w.inprog += 1;
          const hrs = a.remainingWork > 0 ? a.remainingWork : Math.max(0, a.originalEstimate - a.completedWork);
          if (hrs <= 0) continue;
          const winStart = a.startDate ?? periodStart;
          const winEnd = a.dueDate ?? periodEnd;
          if (winEnd < periodStart || winStart > periodEnd) continue;
          const overlapIdx = period.days
            .map((d, i) => (d >= winStart && d <= winEnd ? i : -1))
            .filter((i) => i >= 0);
          if (overlapIdx.length === 0) continue;

          let projSeries = p.byProject.get(project.name);
          if (!projSeries) {
            projSeries = period.days.map(() => 0);
            p.byProject.set(project.name, projSeries);
          }
          let proj = projDay.get(project.name);
          if (!proj) {
            proj = { lead, byDay: period.days.map(() => 0), people: new Map() };
            projDay.set(project.name, proj);
          }
          const perDay = hrs / overlapIdx.length;
          const itemDay = period.days.map(() => 0);
          for (const i of overlapIdx) {
            p.byDay[i] += perDay;
            projSeries[i] += perDay;
            proj.byDay[i] += perDay;
            itemDay[i] = perDay;
          }
          proj.people.set(a.assignee, (proj.people.get(a.assignee) ?? 0) + hrs);
          p.items.push({
            id: a.id,
            title: a.title,
            type: a.type,
            state: a.state,
            project: project.name,
            startDate: a.startDate,
            dueDate: a.dueDate,
            hrs: round1(hrs),
            day: itemDay.map(round1),
          });
        }
      } catch (err) {
        console.warn(`Resource allocation: skipped project ${project.name}.`, err);
      } finally {
        done += 1;
        onProgress?.(done, projects.length);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, projects.length || 1) }, worker));

  const [leaveHours, tsHours] = await Promise.all([
    leave.getLeaveHours(period),
    timesheet.getTimesheetHours(period),
  ]);

  const people: ResourcePerson[] = [...personMap.entries()]
    .map(([name, p]) => {
      // Provider maps are keyed by normalized names (SharePoint "X | Veelead"
      // vs ADO "X" display-name differences).
      const key = normalizeName(name);
      const leaveHrs = leaveHours.get(key) ?? 0;
      const capacityHrs = period.days.length * HOURS_PER_DAY;
      const effective = Math.max(1, capacityHrs - leaveHrs);
      const byProject: ProjectSplitDay[] = [...p.byProject.entries()]
        .map(([project, day]) => ({
          project,
          day: day.map(round1),
          total: round1(day.reduce((a, b) => a + b, 0)),
        }))
        .sort((a, b) => b.total - a.total);
      const allocatedHrs = round1(byProject.reduce((a, b) => a + b.total, 0));
      return {
        name,
        role: roleByName.get(name) || '—',
        capacityHrs,
        leaveHrs,
        allocatedHrs,
        utilPct: Math.round((allocatedHrs / effective) * 100),
        byDay: p.byDay.map(round1),
        byProject,
        work: [...p.work.values()]
          .filter((w) => w.completed > 0 || w.inprog > 0)
          .sort((a, b) => b.completed - a.completed),
        items: [...p.items].sort((a, b) => b.hrs - a.hrs),
        timesheetHrs: round1(tsHours.get(key)?.submitted ?? 0),
      };
    })
    .sort((a, b) => b.utilPct - a.utilPct);

  const projectRows: ProjectAllocation[] = [...projDay.entries()]
    .map(([name, v]) => ({
      name,
      lead: v.lead,
      total: round1(v.byDay.reduce((a, b) => a + b, 0)),
      byDay: v.byDay.map(round1),
      people: [...v.people.entries()]
        .map(([n, hrs]) => ({ name: n, hrs: round1(hrs) }))
        .sort((a, b) => b.hrs - a.hrs),
    }))
    .sort((a, b) => b.total - a.total);

  const totalCapacity = people.reduce((a, p) => a + p.capacityHrs - p.leaveHrs, 0);
  const totalAllocated = round1(people.reduce((a, p) => a + p.allocatedHrs, 0));

  return {
    period,
    people,
    projects: projectRows,
    totalCapacity,
    totalAllocated,
    utilPct: totalCapacity > 0 ? Math.round((totalAllocated / totalCapacity) * 100) : 0,
    underCount: people.filter((p) => p.utilPct < 60).length,
    overCount: people.filter((p) => p.utilPct > 100).length,
    leaveConnected: leave.connected,
    timesheetConnected: timesheet.connected,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
