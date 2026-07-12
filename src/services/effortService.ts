import type { OrgContext, ProjectRef } from './orgServices';
import {
  loadResourceData,
  type Period,
  type ProjectWork,
} from './resourceService';
import {
  GraphLeaveProvider,
  GraphTimesheetProvider,
  type DayMode,
} from './sharePointProviders';
import { normalizeName } from './sharePointProviders';

/** One resource row for the Effort & Timesheet page. */
export interface EffortRow {
  name: string;
  role: string;
  /** Azure-planned hours in the period (allocation). */
  planned: number;
  byDayPlanned: number[];
  submitted: number;
  approved: number;
  pending: number;
  byDaySubmitted: number[];
  byDayApproved: number[];
  leaveDays: number;
  wfhDays: number;
  /** Attendance mode per working day, aligned with period.days. */
  dayMode: DayMode[];
  /** Work delivered in the period + in-progress, per project. */
  work: ProjectWork[];
}

export interface EffortData {
  period: Period;
  rows: EffortRow[];
  planned: number;
  submitted: number;
  approved: number;
  pending: number;
  pendingCount: number;
  leaveDays: number;
  wfhDays: number;
  timesheetConnected: boolean;
  leaveConnected: boolean;
}

/**
 * Build the Effort & Timesheet dataset: Azure-planned hours per resource (from
 * the resource-allocation loader) merged with SharePoint timesheet detail
 * (submitted/approved/pending, per day) and LMS attendance (leave/WFH days).
 */
export async function loadEffortData(
  org: OrgContext,
  projects: ProjectRef[],
  period: Period,
  leave: GraphLeaveProvider,
  timesheet: GraphTimesheetProvider,
  onProgress?: (done: number, total: number) => void,
): Promise<EffortData> {
  const res = await loadResourceData(org, projects, period, leave, timesheet, onProgress);
  const [tsDetail, attendance] = await Promise.all([
    timesheet.getDetail(period),
    leave.getAttendance(period),
  ]);

  const zeroDays = (): number[] => period.days.map(() => 0);
  const rows: EffortRow[] = res.people
    .map((p) => {
      const key = normalizeName(p.name);
      const ts = tsDetail.get(key);
      const att = attendance.get(key);
      return {
        name: p.name,
        role: p.role,
        planned: p.allocatedHrs,
        byDayPlanned: p.byDay,
        submitted: r1(ts?.submitted ?? 0),
        approved: r1(ts?.approved ?? 0),
        pending: r1(ts?.pending ?? 0),
        byDaySubmitted: ts?.byDaySubmitted ?? zeroDays(),
        byDayApproved: ts?.byDayApproved ?? zeroDays(),
        leaveDays: att?.leaveDays ?? 0,
        wfhDays: att?.wfhDays ?? 0,
        dayMode: att?.dayMode ?? period.days.map(() => 'office' as DayMode),
        work: p.work,
      };
    })
    .sort((a, b) => b.planned - a.planned);

  return {
    period,
    rows,
    planned: r1(rows.reduce((a, r) => a + r.planned, 0)),
    submitted: r1(rows.reduce((a, r) => a + r.submitted, 0)),
    approved: r1(rows.reduce((a, r) => a + r.approved, 0)),
    pending: r1(rows.reduce((a, r) => a + r.pending, 0)),
    pendingCount: rows.filter((r) => r.pending > 0).length,
    leaveDays: rows.reduce((a, r) => a + r.leaveDays, 0),
    wfhDays: rows.reduce((a, r) => a + r.wfhDays, 0),
    timesheetConnected: timesheet.connected,
    leaveConnected: leave.connected,
  };
}

function r1(n: number): number {
  return Math.round(n * 10) / 10;
}
