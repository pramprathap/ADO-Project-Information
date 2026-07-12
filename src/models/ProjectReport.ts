/**
 * Computed metrics for the Project Health report. All values are derived from
 * the current project's Azure Boards work items (read-only) via the Work Item
 * Tracking REST API.
 */

export interface CountBucket {
  key: string;
  count: number;
}

export interface BugMetrics {
  total: number;
  open: number;
  closed: number;
  reopened: number;
  /** reopened / total, 0..1. */
  reworkRate: number;
}

export interface SprintSummary {
  name: string;
  path: string;
  startDate?: string;
  finishDate?: string;
  /** 'past' | 'current' | 'future' relative to today. */
  timeframe: 'past' | 'current' | 'future';
}

export interface SprintStats {
  total: number;
  /** Past sprints (treated as delivered). */
  done: number;
  /** Currently active sprint(s). */
  inProgress: number;
  /** Future/pending sprints. */
  pending: number;
}

/** Per-work-item-type breakdown for the segmented "Work items by type" bars. */
export interface TypeBreakdown {
  type: string;
  open: number;
  inProgress: number;
  completed: number;
  overdue: number;
  total: number;
}

export type MilestoneStatus = 'completed' | 'overdue' | 'in-progress' | 'upcoming' | 'not-set';

export interface Milestone {
  /** Display phase name: Requirement, Development, QA / QC, UAT, Go-Live, Post-Production. */
  phase: string;
  /** Feature id backing this milestone, if matched. */
  featureId?: number;
  targetDate?: string;
  revisedDate?: string;
  /** Number of times the target date was revised. */
  revisedCount: number;
  status: MilestoneStatus;
  overdue: boolean;
  /** Days overdue (past target/revised date), when overdue. */
  slipDays?: number;
}

export interface OpenItem {
  id: number;
  /** Raw work-item type, e.g. "Blocker", "Clarifications". */
  type: string;
  /** Badge kind derived from the work-item type. */
  kind: 'Blocker' | 'Clarification';
  title: string;
  state: string;
  owner?: string;
  /** Free-text "raised to" (dependency / client / approval), when available. */
  raisedTo?: string;
  ageDays: number;
}

/**
 * A delivery Epic (EPIC Type = "Development"). A project can have several; each
 * owns its own milestone timeline, lead, Go-Live and blockers/clarifications.
 */
export interface EpicSummary {
  id: number;
  title: string;
  /** Raw "EPIC Type" value (e.g. "Development", "Support", "Training"). */
  epicType: string;
  /** True when the Epic Type maps to a phased delivery (shows the milestone timeline). */
  isDevelopment: boolean;
  /** Track label: "Phased delivery" for Development, else "Continuous / Activity-based". */
  track: string;
  /** Epic lead (from the "Lead" identity field, else Assigned To). */
  lead?: string;
  /** Board state of the Epic. */
  state: string;
  /** True when the Epic itself is Closed / Completed / Done. */
  completed: boolean;
  /** Effective Go-Live date (revised target if set, else target). */
  goLiveDate?: string;
  /** Short Go-Live status label: "Ongoing" | "Completed" | "Overdue" | "Not set". */
  goLiveStatus: string;
  /** Open Items (blockers) under this Epic that are still open. */
  openBlockers: number;
  /** Clarifications under this Epic that are still open. */
  openClarifications: number;
  milestones: Milestone[];
  milestonesOverdue: number;
  openItems: OpenItem[];
  /** Full report metrics scoped to this Epic's descendants (all sections). */
  report?: ProjectReportMetrics;
}

export interface SignOffReadiness {
  criticalOpen: number;
  blockedItems: number;
  overdueOpen: number;
  openBugs: number;
  pendingApprovals: number;
  /** Overall readiness label. */
  status: 'Ready' | 'Pending' | 'Blocked';
}

export interface WorkItemRow {
  id: number;
  type: string;
  title: string;
  state: string;
  assignedTo?: string;
  dueDate?: string;
  iteration?: string;
  overdue: boolean;
  /** Start Date. */
  startDate?: string;
  /** Closed (or last state-change) date, for done items. */
  closedDate?: string;
  /** Target Date (Features) — the phase target. */
  targetDate?: string;
  /** Revised Target Date (custom field), when set. */
  revisedDate?: string;
  /** Number of times the target date was revised (custom field). */
  revisedCount?: number;
  /** Original Estimate hours. */
  originalEstimate?: number;
  /** Remaining Work hours. */
  remainingWork?: number;
  /** Completed Work hours. */
  completedWork?: number;
  /** Parent work item id (for the tree view), if any. */
  parentId?: number;
  /** Tree depth (0 = root) computed from the parent chain. */
  depth: number;
}

export interface EffortMetrics {
  /** Σ Original Estimate (planned hours). */
  plannedHrs: number;
  /** Σ Completed Work (actual hours). */
  actualHrs: number;
  /** Σ Completed + Remaining (entered/tracked hours). */
  enteredHrs: number;
  /** (actual − planned) / planned, as a percentage (est. accuracy gap). */
  gapAccuracyPct: number;
  /** (entered − actual) / actual, as a percentage (board hygiene gap). */
  gapHygienePct: number;
  /** (entered − planned) / planned, as a percentage (cost-vs-budget gap). */
  gapBudgetPct: number;
}

export interface TeamMemberEffort {
  name: string;
  initials: string;
  loggedHrs: number;
  /** Share of total logged hours, 0..100. */
  effortPct: number;
  /** Planned time-off hours in the current iteration (from team capacity). */
  leaveHrs?: number;
}

/** One week bucket for the Weekly progress bars and Effort burn-down line. */
export interface WeeklyPoint {
  /** Short label, e.g. "W1". */
  label: string;
  /** Work items created in the week. */
  opened: number;
  /** Work items completed in the week. */
  closed: number;
  /** Estimated remaining hours at the end of the week (burn-down actual). */
  remainingHrs: number;
  /** Ideal (steady-pace) remaining hours at the end of the week. */
  idealHrs: number;
}

export interface DataQualityItem {
  id: number;
  type: string;
  title: string;
  state: string;
  /** Short issue labels, e.g. "No start date", "No original estimate", "Stale 7d". */
  issues: string[];
}

/** Compact per-project epic descriptor for the portfolio overview. */
export interface EpicMini {
  id: number;
  name: string;
  isDevelopment: boolean;
  completed: boolean;
}

/**
 * Lightweight per-project roll-up for the organisation Overview page. Computed
 * from a single WIQL + batch per project (no analytics/capacity/sprints), so it
 * scales across many projects.
 */
export interface PortfolioSummary {
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  completionPct: number;
  /** Overdue work items (past due, not done). */
  overdue: number;
  /** Age in days of the most overdue open item (0 when none). */
  overdueMaxAgeDays: number;
  blockers: number;
  /** Age in days of the oldest open blocker (0 when none). */
  oldestBlockerDays: number;
  /** Reopened bugs (rework signal). */
  bugsReopened: number;
  bugsClosed: number;
  /** Open Blocker/Clarification items (not done). */
  openItemsCount: number;
  /** All completed work items. */
  closedCount: number;
  /** Active tasks + bugs (open + in-progress). */
  openWork: number;
  tasksTotal: number;
  tasksOpen: number;
  tasksOverdue: number;
  bugsOpen: number;
  bugsTotal: number;
  epics: EpicMini[];
  milestonesOverdue: number;
}

export interface ProjectReportMetrics {
  /** ISO timestamp the report was generated. */
  asOf: string;
  /** True when the underlying query was capped and totals may be partial. */
  truncated: boolean;

  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  /** 0..100 completion percentage (completed / total). */
  completionPct: number;
  overdue: number;
  blockers: number;

  byState: CountBucket[];
  byType: CountBucket[];
  typeBreakdown: TypeBreakdown[];
  bugs: BugMetrics;

  effort: EffortMetrics;
  team: TeamMemberEffort[];
  teamLoggedHrs: number;
  /** 8-week trend for the Weekly progress and Effort burn-down charts. */
  weekly: WeeklyPoint[];
  /** Current estimated remaining hours (Σ Remaining Work). */
  remainingHrs: number;
  /** Total planned team time-off hours in the current iteration (capacity API). */
  teamLeaveHrs: number;
  /** True when the burn-down line uses real Analytics snapshot history. */
  analyticsUsed: boolean;
  signOff: SignOffReadiness;
  dataQuality: DataQualityItem[];

  sprints: SprintSummary[];
  sprintStats: SprintStats;
  /** All Epics in the project, each with its own milestones/blockers/lead. */
  epics: EpicSummary[];
  /** Key delivery milestones for the default (first) Epic — convenience mirror. */
  milestones: Milestone[];
  milestonesOverdue: number;
  /** Whether the process exposes a "Feature Type" field (else milestones hidden). */
  milestonesAvailable: boolean;
  /** Blocker / Clarification work items (flat) — used by the Blocker log & KPIs. */
  openItems: OpenItem[];
  /** Tree of the open-items branch: Feature → Open Items → Blocker/Clarification. */
  openItemsTree: WorkItemRow[];
  /** A capped list of the most relevant work items for the tree view. */
  workItems: WorkItemRow[];
}
