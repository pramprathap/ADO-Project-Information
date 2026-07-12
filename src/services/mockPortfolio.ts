import type { PortfolioProject } from '@/models/Portfolio';
import type { PortfolioSummary } from '@/models/ProjectReport';

/** In-memory portfolio used only for local preview (`npm run dev?page=overview`). */
function sum(over: Partial<PortfolioSummary>): PortfolioSummary {
  return {
    total: 40,
    completed: 22,
    inProgress: 12,
    notStarted: 6,
    completionPct: 55,
    overdue: 3,
    blockers: 1,
    openItemsCount: 4,
    closedCount: 22,
    openWork: 14,
    tasksTotal: 28,
    tasksOpen: 10,
    tasksOverdue: 2,
    bugsOpen: 3,
    bugsTotal: 8,
    epics: [
      { id: 1, name: 'Delivery', isDevelopment: true, completed: false },
      { id: 2, name: 'Support', isDevelopment: false, completed: true },
    ],
    milestonesOverdue: 0,
    ...over,
  };
}

export const MOCK_PORTFOLIO: PortfolioProject[] = [
  {
    id: 'p1', name: 'M365 Implementation Delivery', lead: 'RamPrathap P', type: 'Development', typeRaw: 'Development',
    region: 'NA', client: 'Atkore', status: 'In Progress', statusRaw: 'InProgress', health: 'Green', billable: true,
    plannedStart: '2026-04-01', plannedDue: '2026-09-30', progress: 62, rag: 'on', isOverdue: false, overdueDays: 0,
    reasons: [], summary: sum({ completionPct: 62 }),
  },
  {
    id: 'p2', name: 'IT Helpdesk Chatbot (ICT)', lead: 'Venkata Teja K', type: 'Development', typeRaw: 'Development',
    region: 'India', client: 'Summit', status: 'In Progress', statusRaw: 'InProgress', health: 'Amber', billable: true,
    plannedStart: '2026-05-01', plannedDue: '2026-08-15', progress: 44, rag: 'risk', isOverdue: false, overdueDays: 0,
    reasons: [{ t: '2 blockers', tone: 'amber' }], summary: sum({ completionPct: 44, blockers: 2, overdue: 1 }),
  },
  {
    id: 'p3', name: 'User Onboarding / Offboarding Automation', lead: 'Ali Abuthahir', type: 'Development', typeRaw: 'Development',
    region: 'EMEA', client: 'Brecoflex', status: 'In Progress', statusRaw: 'InProgress', health: 'Red', billable: true,
    plannedStart: '2026-02-01', plannedDue: '2026-06-20', progress: 71, rag: 'off', isOverdue: true, overdueDays: 22,
    reasons: [{ t: '22d overdue', tone: 'red' }, { t: 'Off track', tone: 'red' }], summary: sum({ completionPct: 71, overdue: 5, blockers: 1 }),
  },
  {
    id: 'p4', name: 'Travel Request (Conditional Access)', lead: 'Rajesh K', type: 'Development', typeRaw: 'Development',
    region: 'NA', client: 'Atkore', status: 'In Progress', statusRaw: 'InProgress', health: 'Green', billable: true,
    plannedStart: '2026-06-01', plannedDue: '2026-10-31', progress: 30, rag: 'on', isOverdue: false, overdueDays: 0,
    reasons: [], summary: sum({ completionPct: 30, bugsTotal: 4, tasksTotal: 18 }),
  },
  {
    id: 'p5', name: 'Hardware Request Management', lead: 'Venkata Teja K', type: 'Support', typeRaw: 'Support',
    region: 'India', client: 'Summit', status: 'In Progress', statusRaw: 'InProgress', health: 'Green', billable: true,
    plannedStart: '2026-03-01', plannedDue: '2026-12-31', progress: 80, rag: 'on', isOverdue: false, overdueDays: 0,
    reasons: [], summary: sum({ completionPct: 80 }),
  },
  {
    id: 'p6', name: 'Employee Self-Service Details Update', lead: 'Ali Abuthahir', type: 'Internal', typeRaw: 'Internal',
    region: 'Internal', client: 'Veelead', status: 'On Hold', statusRaw: 'OnHold', health: 'Amber', billable: false,
    plannedStart: '2026-05-15', plannedDue: '2026-07-15', progress: 20, rag: 'risk', isOverdue: false, overdueDays: 0,
    reasons: [{ t: '1 blocker', tone: 'amber' }], summary: sum({ completionPct: 20, blockers: 1 }),
  },
  {
    id: 'p7', name: 'Internship Program 2026', lead: 'Jyothi T', type: 'Internship', typeRaw: 'Internship',
    region: 'Internal', client: 'Veelead', status: 'In Progress', statusRaw: 'InProgress', health: 'Green', billable: false,
    plannedStart: '2026-01-05', plannedDue: '2026-11-30', progress: 68, rag: 'on', isOverdue: false, overdueDays: 0,
    reasons: [], summary: sum({ completionPct: 68, epics: [{ id: 1, name: 'Cohort A', isDevelopment: false, completed: false }] }),
  },
];
