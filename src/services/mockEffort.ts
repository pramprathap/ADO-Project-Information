import type { Period } from './resourceService';
import type { EffortData, EffortRow } from './effortService';
import type { DayMode } from './sharePointProviders';

/** Preview-only Effort & Timesheet dataset (`npm run dev` → ?page=effort). */
export function MOCK_EFFORT_DATA(period: Period): EffortData {
  const n = period.days.length;
  const spread = (total: number): number[] => period.days.map(() => total / n);
  const modes = (leave: number, wfh: number): DayMode[] =>
    period.days.map((_, i) => (i < leave ? 'leave' : i < leave + wfh ? 'wfh' : 'office'));

  const seed: [string, string, number, number, number, number, number][] = [
    // name, role, planned, submitted, approved, leaveDays, wfhDays
    ['RamPrathap P', 'Project Lead', 40, 38, 34, 0, 1],
    ['Venkata Teja K', 'Developer', 34, 30, 30, 1, 0],
    ['Ali Abuthahir', 'Technical Lead', 31, 33, 28, 0, 2],
    ['Rajesh K', 'Developer', 16, 8, 6, 2, 0],
    ['Shanmathi R', 'QA/QC', 10, 10, 10, 2, 0],
  ];
  const rows: EffortRow[] = seed.map(([name, role, planned, submitted, approved, leaveDays, wfhDays]) => ({
    name,
    role,
    planned,
    byDayPlanned: spread(planned),
    submitted,
    approved,
    pending: Math.max(0, submitted - approved),
    byDaySubmitted: spread(submitted),
    byDayApproved: spread(approved),
    leaveDays,
    wfhDays,
    dayMode: modes(leaveDays, wfhDays),
    work: [
      { project: 'M365 Implementation', stories: 1, tasks: 4, bugs: 1, completed: 6, inprog: 3 },
      { project: 'IT Helpdesk Chatbot', stories: 0, tasks: 2, bugs: 1, completed: 3, inprog: 1 },
    ],
  }));

  const sum = (f: (r: EffortRow) => number): number => Math.round(rows.reduce((a, r) => a + f(r), 0) * 10) / 10;
  return {
    period,
    rows,
    planned: sum((r) => r.planned),
    submitted: sum((r) => r.submitted),
    approved: sum((r) => r.approved),
    pending: sum((r) => r.pending),
    pendingCount: rows.filter((r) => r.pending > 0).length,
    leaveDays: sum((r) => r.leaveDays),
    wfhDays: sum((r) => r.wfhDays),
    timesheetConnected: true,
    leaveConnected: true,
  };
}
