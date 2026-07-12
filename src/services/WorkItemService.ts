import { AzureDevOpsClient } from './AzureDevOpsClient';
import type {
  BugMetrics,
  CountBucket,
  DataQualityItem,
  EffortMetrics,
  EpicSummary,
  Milestone,
  MilestoneStatus,
  OpenItem,
  PortfolioSummary,
  ProjectReportMetrics,
  SignOffReadiness,
  SprintStats,
  SprintSummary,
  TeamMemberEffort,
  TypeBreakdown,
  WeeklyPoint,
  WorkItemRow,
} from '@/models/ProjectReport';

const REPORT_WEEKS = 8;

/** One assignable work item for the Resource Allocation roll-up. */
export interface AssignmentItem {
  id: number;
  title: string;
  assignee: string;
  type: string;
  state: string;
  done: boolean;
  startDate?: string;
  dueDate?: string;
  /** Closed (or last state-change) date for done items. */
  closedDate?: string;
  originalEstimate: number;
  remainingWork: number;
  completedWork: number;
}

/** Options that gate project-level milestone visibility (from Project Information). */
export interface ReportOptions {
  /** Project Information "Current Phase" value. */
  currentPhase?: string;
  /** Project Information "Project Type" value. */
  projectType?: string;
}

const WIQL_VERSION = '7.1';
const BATCH_SIZE = 200;
const MAX_ITEMS = 2000;

/** Canonical milestone phases (fixed display order). */
const MILESTONE_PHASES = [
  'Requirement',
  'Development',
  'QA / QC',
  'UAT',
  'Go-Live',
  'Post-Production',
] as const;

/** Map a raw "Feature Type" value onto a canonical phase (spelling-tolerant). */
function matchPhase(featureType: string): string | undefined {
  const v = featureType.trim().toLowerCase();
  if (!v) return undefined;
  if (v.includes('requir')) return 'Requirement';
  if (v.includes('develop')) return 'Development';
  if (v.includes('qc') || v.includes('qa') || v.includes('test')) return 'QA / QC';
  if (v.includes('uat')) return 'UAT';
  if ((v.includes('go') && v.includes('live')) || v.includes('golive')) return 'Go-Live';
  if (v.includes('post')) return 'Post-Production';
  return undefined;
}

// The actual reportable impediments/questions are the leaf "Blocker" and
// "Clarifications" work items. "Open Items" is a Story-level *container* WIT
// (parent of these) — structural only, shown in the work-item tree, not listed.
const OPEN_ITEM_TYPES = ['Blocker', 'Blockers', 'Clarification', 'Clarifications'];

const FIELDS = [
  'System.Id',
  'System.WorkItemType',
  'System.State',
  'System.Title',
  'System.AssignedTo',
  'System.Reason',
  'System.Tags',
  'System.IterationPath',
  'System.ChangedDate',
  'System.CreatedDate',
  'Microsoft.VSTS.Common.StateChangeDate',
  'Microsoft.VSTS.Common.ClosedDate',
  'System.Parent',
  'Microsoft.VSTS.Common.Priority',
  'Microsoft.VSTS.Scheduling.StartDate',
  'Microsoft.VSTS.Scheduling.DueDate',
  'Microsoft.VSTS.Scheduling.TargetDate',
  'Microsoft.VSTS.Scheduling.OriginalEstimate',
  'Microsoft.VSTS.Scheduling.RemainingWork',
  'Microsoft.VSTS.Scheduling.CompletedWork',
];

/** True when an "EPIC Type" / "Project Type" / "Current Phase" value means phased delivery. */
function isDevelopmentValue(v: string): boolean {
  return /develop/i.test(v.trim());
}

/** Extract a display name from an identity field value. */
function identityName(fields: WorkItemFields, ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  const v = fields[ref];
  if (v && typeof v === 'object' && 'displayName' in v) {
    return String((v as { displayName?: unknown }).displayName ?? '') || undefined;
  }
  return typeof v === 'string' && v ? v : undefined;
}

function num(fields: WorkItemFields, key: string): number {
  const v = Number(fields[key]);
  return Number.isFinite(v) ? v : 0;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// State-name heuristics (process-agnostic best effort). Grouped by lowercase.
const DONE_STATES = new Set(['closed', 'done', 'completed']);
const NOT_STARTED_STATES = new Set(['new', 'proposed', 'to do', 'open', 'approved']);

interface WiqlResponse {
  workItems?: { id: number }[];
}

interface WorkItemFields {
  [key: string]: unknown;
}

interface BatchResponse {
  value?: { id: number; fields?: WorkItemFields }[];
}

interface ClassificationNode {
  name?: string;
  path?: string;
  attributes?: { startDate?: string; finishDate?: string };
  hasChildren?: boolean;
  children?: ClassificationNode[];
}

function str(fields: WorkItemFields, key: string): string {
  const v = fields[key];
  return typeof v === 'string' ? v : '';
}

function assignedName(fields: WorkItemFields): string | undefined {
  const v = fields['System.AssignedTo'];
  if (v && typeof v === 'object' && 'displayName' in v) {
    return String((v as { displayName?: unknown }).displayName ?? '') || undefined;
  }
  return typeof v === 'string' && v ? v : undefined;
}

function isDone(state: string): boolean {
  return DONE_STATES.has(state.trim().toLowerCase());
}

function isNotStarted(state: string): boolean {
  return NOT_STARTED_STATES.has(state.trim().toLowerCase());
}

/** Local calendar date (YYYY-MM-DD) for a Date, in the viewer's timezone. */
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Today's local calendar date. */
function todayLocal(): string {
  return localDateStr(new Date());
}

/**
 * Convert an Azure DevOps date value to the viewer's LOCAL calendar date.
 * ADO stores date fields as UTC, so a date entered as "7 Aug 00:00" in a +5:30
 * timezone comes back as "2026-08-06T18:30:00Z"; slicing the UTC portion would
 * wrongly show 06 Aug. Converting through the local timezone restores 07 Aug.
 */
function toDateOnly(value: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) {
    return localDateStr(d);
  }
  const s = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}

/** Round a number to 2 decimal places (kills floating-point noise on hours). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Add (or subtract) whole days to a YYYY-MM-DD date, returning YYYY-MM-DD. */
function addDaysStr(base: string, delta: number): string {
  const t = Date.parse(`${base}T00:00:00Z`);
  if (Number.isNaN(t)) return base;
  return new Date(t + delta * 86_400_000).toISOString().slice(0, 10);
}

/** Count Mon–Fri working days across a set of inclusive date ranges. */
function countWorkdays(ranges: { start?: string; end?: string }[]): number {
  let n = 0;
  for (const r of ranges) {
    const s = toDateOnly(r.start ?? '');
    const e = toDateOnly(r.end ?? '');
    if (!s || !e) continue;
    let cur = s;
    let guard = 0;
    while (cur <= e && guard < 400) {
      const day = new Date(`${cur}T00:00:00Z`).getUTCDay();
      if (day !== 0 && day !== 6) n += 1;
      cur = addDaysStr(cur, 1);
      guard += 1;
    }
  }
  return n;
}

/** Whole days between two ISO dates (from -> to); negative if `to` is earlier. */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) {
    return 0;
  }
  return Math.round((b - a) / 86_400_000);
}

/**
 * Reads the current project's Azure Boards work items (read-only) and computes
 * the Project Health report metrics. Uses the official Work Item Tracking REST
 * API: WIQL to select ids, then the work-items batch endpoint for fields, plus
 * classification nodes for the iteration (sprint) list.
 */
export class WorkItemService {
  constructor(
    private readonly client: AzureDevOpsClient,
    private readonly orgBaseUrl: string,
    private readonly projectId: string,
    private readonly analyticsBaseUrl?: string,
  ) {}

  private get projectSegment(): string {
    return encodeURIComponent(this.projectId);
  }

  private async wiqlIds(): Promise<number[]> {
    const query =
      'SELECT [System.Id] FROM WorkItems ' +
      'WHERE [System.TeamProject] = @project ' +
      'ORDER BY [System.ChangedDate] DESC';
    const response = await this.client.request<WiqlResponse>(
      this.orgBaseUrl,
      `${this.projectSegment}/_apis/wit/wiql`,
      { method: 'POST', apiVersion: WIQL_VERSION, body: { query } },
    );
    return (response?.workItems ?? []).map((w) => w.id).filter((id) => Number.isFinite(id));
  }

  private async batch(
    ids: number[],
    fields: string[] = FIELDS,
  ): Promise<{ id: number; fields: WorkItemFields }[]> {
    const out: { id: number; fields: WorkItemFields }[] = [];
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const chunk = ids.slice(i, i + BATCH_SIZE);
      const response = await this.client.request<BatchResponse>(
        this.orgBaseUrl,
        '_apis/wit/workitemsbatch',
        { method: 'POST', apiVersion: WIQL_VERSION, body: { ids: chunk, fields } },
      );
      for (const item of response?.value ?? []) {
        out.push({ id: item.id, fields: item.fields ?? {} });
      }
    }
    return out;
  }

  /** Resolve custom-field reference names by display name (once, cached). */
  private fieldRefsCache: Record<string, string> | undefined;
  private async fieldRefs(): Promise<Record<string, string>> {
    if (this.fieldRefsCache) {
      return this.fieldRefsCache;
    }
    const wanted = [
      'epic type',
      'feature type',
      'user story type',
      'revised target date',
      'revised date count',
      'lead',
      'raised to',
    ];
    const map: Record<string, string> = {};
    try {
      const response = await this.client.request<{
        value?: { name?: string; referenceName?: string }[];
      }>(this.orgBaseUrl, '_apis/wit/fields', { method: 'GET', apiVersion: WIQL_VERSION });
      for (const f of response?.value ?? []) {
        const name = (f.name ?? '').trim().toLowerCase();
        if (wanted.includes(name) && f.referenceName) {
          map[name] = f.referenceName;
        }
      }
    } catch (err) {
      console.warn('Failed to resolve custom field reference names.', err);
    }
    this.fieldRefsCache = map;
    return map;
  }

  /** Build the phase milestone list for a set of work items (all descendants of
   *  one Epic, or every item in the project when there is no Epic scoping). */
  private buildMilestones(
    scope: { id: number; fields: WorkItemFields }[],
    refs: Record<string, string>,
    today: string,
  ): Milestone[] {
    const featureTypeRef = refs['feature type'];
    const userStoryTypeRef = refs['user story type'];
    const revisedDateRef = refs['revised target date'];
    const revisedCountRef = refs['revised date count'];

    // Pick the first matching Feature per phase.
    const byPhase = new Map<string, { id: number; fields: WorkItemFields }>();
    if (featureTypeRef) {
      for (const it of scope) {
        if (str(it.fields, 'System.WorkItemType') !== 'Feature') continue;
        const phase = matchPhase(str(it.fields, featureTypeRef));
        if (phase && !byPhase.has(phase)) {
          byPhase.set(phase, it);
        }
      }
    }

    const milestones: Milestone[] = MILESTONE_PHASES.map((phase) => {
      const item = byPhase.get(phase);
      if (!item) {
        return { phase, revisedCount: 0, status: 'not-set' as MilestoneStatus, overdue: false };
      }
      return milestoneFrom(
        phase,
        item,
        toDateOnly(str(item.fields, 'Microsoft.VSTS.Scheduling.TargetDate')),
        revisedDateRef,
        revisedCountRef,
        today,
      );
    });

    // Final "Sign-Off": a User Story with User Story Type = "Sign Off",
    // dated by its Due Date (or Revised Target Date).
    if (userStoryTypeRef) {
      const us = scope.find(
        (it) =>
          str(it.fields, 'System.WorkItemType') === 'User Story' &&
          /sign\s*off/i.test(str(it.fields, userStoryTypeRef)),
      );
      if (us) {
        milestones.push(
          milestoneFrom(
            'Sign-Off',
            us,
            toDateOnly(str(us.fields, 'Microsoft.VSTS.Scheduling.DueDate')),
            revisedDateRef,
            revisedCountRef,
            today,
          ),
        );
      }
    }
    return milestones;
  }

  /** Map a "Blocker"/"Clarifications" work item onto an OpenItem row. */
  private toOpenItem(
    item: { id: number; fields: WorkItemFields },
    today: string,
    raisedToRef?: string,
  ): OpenItem {
    const type = str(item.fields, 'System.WorkItemType') || 'Blocker';
    const created = toDateOnly(str(item.fields, 'System.CreatedDate'));
    const raisedTo = raisedToRef ? str(item.fields, raisedToRef).trim() : '';
    const kind: OpenItem['kind'] = /clarif/i.test(type) ? 'Clarification' : 'Blocker';
    return {
      id: item.id,
      type,
      kind,
      title: str(item.fields, 'System.Title'),
      state: str(item.fields, 'System.State'),
      owner: assignedName(item.fields),
      raisedTo: raisedTo || undefined,
      ageDays: created ? daysBetween(created, today) : 0,
    };
  }

  /**
   * Build one EpicSummary per Epic in the project. Development-type Epics carry
   * their own phase milestone timeline (from descendant Features by Feature
   * Type); every Epic reports its lead, board state, Go-Live and open
   * blockers/clarifications (from descendant Open Items / Clarifications).
   */
  private buildEpics(
    items: { id: number; fields: WorkItemFields }[],
    childrenByParent: Map<number, { id: number; fields: WorkItemFields }[]>,
    refs: Record<string, string>,
    today: string,
  ): EpicSummary[] {
    const epicTypeRef = refs['epic type'];
    const leadRef = refs['lead'];
    const epics = items.filter((it) => str(it.fields, 'System.WorkItemType') === 'Epic');

    return epics
      .map((epic) => {
        const epicType = epicTypeRef ? str(epic.fields, epicTypeRef) : '';
        // Without an EPIC Type field we cannot tell — assume phased (show timeline).
        const isDevelopment = epicTypeRef ? isDevelopmentValue(epicType) : true;
        const epicDone = isDone(str(epic.fields, 'System.State'));
        const descendants = collectDescendants(epic.id, childrenByParent);

        const milestones = isDevelopment ? this.buildMilestones(descendants, refs, today) : [];
        const openItems = descendants
          .filter((d) => OPEN_ITEM_TYPES.includes(str(d.fields, 'System.WorkItemType')))
          .map((d) => this.toOpenItem(d, today, refs['raised to']))
          .sort((a, b) => b.ageDays - a.ageDays);

        const openBlockers = openItems.filter(
          (o) => o.kind === 'Blocker' && !isDone(o.state),
        ).length;
        const openClarifications = openItems.filter(
          (o) => o.kind === 'Clarification' && !isDone(o.state),
        ).length;

        const goLive = milestones.find((m) => m.phase === 'Go-Live');
        const goLiveDate = goLive?.revisedDate ?? goLive?.targetDate;
        // A Closed/Completed Epic is done regardless of any Go-Live milestone.
        const goLiveStatus = epicDone
          ? 'Completed'
          : !isDevelopment
            ? 'Ongoing'
            : goLive?.status === 'completed'
              ? 'Completed'
              : goLive?.status === 'overdue'
                ? 'Overdue'
                : goLive?.targetDate || goLive?.revisedDate
                  ? 'Ongoing'
                  : 'Not set';

        return {
          id: epic.id,
          title: str(epic.fields, 'System.Title'),
          epicType,
          isDevelopment,
          track: isDevelopment ? 'Phased delivery' : 'Continuous / Activity-based',
          lead: identityName(epic.fields, leadRef) ?? assignedName(epic.fields),
          state: str(epic.fields, 'System.State'),
          completed: epicDone,
          goLiveDate,
          goLiveStatus,
          openBlockers,
          openClarifications,
          milestones,
          milestonesOverdue: milestones.filter((m) => m.overdue).length,
          openItems,
        };
      })
      .sort((a, b) => Number(b.isDevelopment) - Number(a.isDevelopment) || a.id - b.id);
  }

  private async getSprints(): Promise<SprintSummary[]> {
    try {
      const root = await this.client.request<ClassificationNode>(
        this.orgBaseUrl,
        `${this.projectSegment}/_apis/wit/classificationnodes/iterations`,
        { method: 'GET', apiVersion: WIQL_VERSION, query: { $depth: 10 } },
      );
      const today = todayLocal();
      const sprints: SprintSummary[] = [];
      const walk = (node: ClassificationNode | undefined): void => {
        if (!node) {
          return;
        }
        const start = toDateOnly(node.attributes?.startDate ?? '');
        const finish = toDateOnly(node.attributes?.finishDate ?? '');
        // Only nodes with dates are real sprints (not the root/grouping nodes).
        if (start || finish) {
          let timeframe: SprintSummary['timeframe'] = 'current';
          if (finish && finish < today) {
            timeframe = 'past';
          } else if (start && start > today) {
            timeframe = 'future';
          }
          sprints.push({
            name: node.name ?? 'Iteration',
            path: node.path ?? node.name ?? '',
            startDate: start,
            finishDate: finish,
            timeframe,
          });
        }
        (node.children ?? []).forEach(walk);
      };
      walk(root);
      return sprints;
    } catch (err) {
      console.warn('Failed to load iterations for the report.', err);
      return [];
    }
  }

  /**
   * Real weekly remaining-work snapshots from the Analytics OData service
   * (`WorkItemSnapshot`) for the burn-down. Returns a map of week-end date →
   * summed Remaining Work hours, or undefined if Analytics is unavailable /
   * not enabled (the caller then falls back to the best-effort trend).
   */
  private async fetchWeeklyRemaining(weekEnds: string[]): Promise<Map<string, number> | undefined> {
    if (!this.analyticsBaseUrl || weekEnds.length === 0) {
      return undefined;
    }
    try {
      const apply =
        `filter(DateValue in (${weekEnds.join(',')}))` +
        `/groupby((DateValue),aggregate(RemainingWork with sum as Remaining))`;
      const res = await this.client.request<{
        value?: { DateValue?: string; Remaining?: number }[];
      }>(this.analyticsBaseUrl, `${this.projectSegment}/_odata/v4.0-preview/WorkItemSnapshot`, {
        method: 'GET',
        query: { $apply: apply },
        skipApiVersion: true,
        retry: false,
        timeoutMs: 15_000,
      });
      const map = new Map<string, number>();
      for (const row of res?.value ?? []) {
        const d = (row.DateValue ?? '').slice(0, 10);
        if (d) map.set(d, Math.round(Number(row.Remaining) || 0));
      }
      return map.size > 0 ? map : undefined;
    } catch (err) {
      console.warn('Analytics burn-down unavailable; using best-effort trend.', err);
      return undefined;
    }
  }

  /**
   * Team capacity → planned time-off (leave) hours for the current iteration,
   * via the Work REST API (default team). Returns total + per-member hours, or
   * undefined if capacity is not configured / not permitted.
   */
  private async fetchCapacityLeave(): Promise<
    { total: number; byMember: Map<string, number> } | undefined
  > {
    try {
      const project = await this.client.request<{ defaultTeam?: { id?: string } }>(
        this.orgBaseUrl,
        `_apis/projects/${this.projectSegment}`,
        { method: 'GET', apiVersion: '7.1', retry: false },
      );
      const teamId = project?.defaultTeam?.id;
      if (!teamId) return undefined;
      const teamSeg = encodeURIComponent(teamId);

      const iters = await this.client.request<{ value?: { id?: string }[] }>(
        this.orgBaseUrl,
        `${this.projectSegment}/${teamSeg}/_apis/work/teamsettings/iterations`,
        { method: 'GET', apiVersion: '7.1', query: { $timeframe: 'current' }, retry: false },
      );
      const iterationId = iters?.value?.[0]?.id;
      if (!iterationId) return undefined;
      const base = `${this.projectSegment}/${teamSeg}/_apis/work/teamsettings/iterations/${encodeURIComponent(
        iterationId,
      )}`;

      const [caps, teamOff] = await Promise.all([
        this.client.request<{
          value?: {
            teamMember?: { displayName?: string };
            activities?: { capacityPerDay?: number }[];
            daysOff?: { start?: string; end?: string }[];
          }[];
        }>(this.orgBaseUrl, `${base}/capacities`, {
          method: 'GET',
          apiVersion: '7.1',
          retry: false,
        }),
        this.client.request<{ daysOff?: { start?: string; end?: string }[] }>(
          this.orgBaseUrl,
          `${base}/teamdaysoff`,
          { method: 'GET', apiVersion: '7.1', retry: false },
        ),
      ]);

      const teamOffDays = countWorkdays(teamOff?.daysOff ?? []);
      const byMember = new Map<string, number>();
      let total = 0;
      for (const row of caps?.value ?? []) {
        const name = row.teamMember?.displayName ?? '';
        const perDay = (row.activities ?? []).reduce(
          (a, x) => a + (Number(x.capacityPerDay) || 0),
          0,
        );
        const offDays = countWorkdays(row.daysOff ?? []) + teamOffDays;
        const hrs = Math.round(perDay * offDays);
        if (name) byMember.set(name, hrs);
        total += hrs;
      }
      return { total, byMember };
    } catch (err) {
      console.warn('Team capacity/leave unavailable.', err);
      return undefined;
    }
  }

  /**
   * Lightweight portfolio roll-up (single WIQL + batch, no analytics/capacity/
   * sprints/per-epic reports) for the organisation Overview across many projects.
   */
  async getPortfolioSummary(): Promise<PortfolioSummary> {
    const refs = await this.fieldRefs();
    const customRefs = Object.values(refs).filter((r): r is string => !!r);
    const fieldList = [...new Set([...FIELDS, ...customRefs])];
    const allIds = await this.wiqlIds();
    const items =
      allIds.length > 0 ? await this.batch(allIds.slice(0, MAX_ITEMS), fieldList) : [];
    const today = todayLocal();

    const childrenByParent = new Map<number, { id: number; fields: WorkItemFields }[]>();
    for (const it of items) {
      const parent = num(it.fields, 'System.Parent');
      if (parent > 0) {
        const list = childrenByParent.get(parent) ?? [];
        list.push(it);
        childrenByParent.set(parent, list);
      }
    }

    const s = this.computeScoped(items, today, refs);
    const epics = this.buildEpics(items, childrenByParent, refs, today);
    const openItems = items
      .filter((it) => OPEN_ITEM_TYPES.includes(str(it.fields, 'System.WorkItemType')))
      .map((it) => this.toOpenItem(it, today, refs['raised to']));

    const task = s.typeBreakdown.find((t) => t.type === 'Task');
    const bug = s.typeBreakdown.find((t) => t.type === 'Bug');
    const openWork =
      (task ? task.open + task.inProgress : 0) + (bug ? bug.open + bug.inProgress : 0);

    // Age of the most overdue open item (how long problems sit unattended).
    let overdueMaxAgeDays = 0;
    for (const w of s.workItems) {
      if (w.overdue && w.dueDate) {
        overdueMaxAgeDays = Math.max(overdueMaxAgeDays, daysBetween(w.dueDate, today));
      }
    }
    const openBlockers = openItems.filter((o) => o.kind === 'Blocker' && !isDone(o.state));

    return {
      total: s.total,
      completed: s.completed,
      inProgress: s.inProgress,
      notStarted: s.notStarted,
      completionPct: s.completionPct,
      overdue: s.overdue,
      overdueMaxAgeDays,
      blockers: openBlockers.length,
      oldestBlockerDays: openBlockers.reduce((a, o) => Math.max(a, o.ageDays), 0),
      bugsReopened: s.bugs.reopened,
      bugsClosed: s.bugs.closed,
      openItemsCount: openItems.filter((o) => !isDone(o.state)).length,
      closedCount: s.completed,
      openWork,
      tasksTotal: task?.total ?? 0,
      tasksOpen: task ? task.open + task.inProgress : 0,
      tasksOverdue: task?.overdue ?? 0,
      bugsOpen: s.bugs.open,
      bugsTotal: s.bugs.total,
      epics: epics.map((e) => ({
        id: e.id,
        name: e.title,
        isDevelopment: e.isDevelopment,
        completed: e.completed,
      })),
      milestonesOverdue: epics.reduce((a, e) => a + e.milestonesOverdue, 0),
    };
  }

  /**
   * Per-assignee open workload for the Resource Allocation page: every open
   * (not done) Task/Bug/User Story with an assignee, with its scheduling window
   * and effort fields. One WIQL + one batch per project.
   */
  async getAssignments(): Promise<AssignmentItem[]> {
    const allIds = await this.wiqlIds();
    const fields = [
      'System.Id',
      'System.Title',
      'System.WorkItemType',
      'System.State',
      'System.AssignedTo',
      'Microsoft.VSTS.Scheduling.StartDate',
      'Microsoft.VSTS.Scheduling.DueDate',
      'Microsoft.VSTS.Scheduling.OriginalEstimate',
      'Microsoft.VSTS.Scheduling.RemainingWork',
      'Microsoft.VSTS.Scheduling.CompletedWork',
      'Microsoft.VSTS.Common.ClosedDate',
      'Microsoft.VSTS.Common.StateChangeDate',
    ];
    const items = allIds.length > 0 ? await this.batch(allIds.slice(0, MAX_ITEMS), fields) : [];
    const out: AssignmentItem[] = [];
    for (const { id, fields: f } of items) {
      const type = str(f, 'System.WorkItemType');
      if (type !== 'Task' && type !== 'Bug' && type !== 'User Story') continue;
      const assignee = assignedName(f);
      if (!assignee) continue;
      const state = str(f, 'System.State');
      out.push({
        id,
        title: str(f, 'System.Title'),
        assignee,
        type,
        state,
        done: isDone(state),
        startDate: toDateOnly(str(f, 'Microsoft.VSTS.Scheduling.StartDate')),
        dueDate: toDateOnly(str(f, 'Microsoft.VSTS.Scheduling.DueDate')),
        closedDate: toDateOnly(
          str(f, 'Microsoft.VSTS.Common.ClosedDate') ||
            str(f, 'Microsoft.VSTS.Common.StateChangeDate'),
        ),
        originalEstimate: num(f, 'Microsoft.VSTS.Scheduling.OriginalEstimate'),
        remainingWork: num(f, 'Microsoft.VSTS.Scheduling.RemainingWork'),
        completedWork: num(f, 'Microsoft.VSTS.Scheduling.CompletedWork'),
      });
    }
    return out;
  }

  async getReport(opts: ReportOptions = {}): Promise<ProjectReportMetrics> {
    const refs = await this.fieldRefs();
    // Include resolved custom fields (EPIC/Feature/User Story Type, Lead, revised
    // dates) in the single batch so milestones/epics compute in-memory.
    const customRefs = Object.values(refs).filter((r): r is string => !!r);
    const fieldList = [...new Set([...FIELDS, ...customRefs])];

    const allIds = await this.wiqlIds();
    const truncated = allIds.length > MAX_ITEMS;
    const items =
      allIds.length > 0 ? await this.batch(allIds.slice(0, MAX_ITEMS), fieldList) : [];

    const today = todayLocal();
    const asOf = new Date().toISOString();

    // Parent → children index (for Epic descendant roll-ups).
    const childrenByParent = new Map<number, { id: number; fields: WorkItemFields }[]>();
    for (const it of items) {
      const parent = num(it.fields, 'System.Parent');
      if (parent > 0) {
        const list = childrenByParent.get(parent) ?? [];
        list.push(it);
        childrenByParent.set(parent, list);
      }
    }

    // Shared, project/team-level data (fetched once; reused by every scope).
    const weekEnds = Array.from({ length: REPORT_WEEKS }, (_, i) =>
      addDaysStr(today, -((REPORT_WEEKS - 1 - i) * 7)),
    );
    const [sprints, remainingMap, capacity] = await Promise.all([
      this.getSprints(),
      this.fetchWeeklyRemaining(weekEnds),
      this.fetchCapacityLeave(),
    ]);
    const sprintStats: SprintStats = {
      total: sprints.length,
      done: sprints.filter((s) => s.timeframe === 'past').length,
      inProgress: sprints.filter((s) => s.timeframe === 'current').length,
      pending: sprints.filter((s) => s.timeframe === 'future').length,
    };

    const epics = this.buildEpics(items, childrenByParent, refs, today);

    // Project-level open items + milestone gating.
    const projectOpenItems = items
      .filter((it) => OPEN_ITEM_TYPES.includes(str(it.fields, 'System.WorkItemType')))
      .map((it) => this.toOpenItem(it, today, refs['raised to']))
      .sort((a, b) => b.ageDays - a.ageDays);

    const devEpics = epics.filter((e) => e.isDevelopment && e.milestones.length > 0);
    const projectIsPhased =
      !!matchPhase(opts.currentPhase ?? '') || isDevelopmentValue(opts.projectType ?? '');
    let projMilestones: Milestone[] = [];
    let projMilestonesAvailable = false;
    if (devEpics.length > 0) {
      projMilestones = devEpics[0].milestones;
      projMilestonesAvailable = true;
    } else if (projectIsPhased && (refs['feature type'] || refs['user story type'])) {
      projMilestones = this.buildMilestones(items, refs, today);
      projMilestonesAvailable = true;
    }

    // Assemble a full report for a given set of work items (whole project, or a
    // single Epic's descendants). Analytics history is used only at the project
    // level; every other section is computed from the supplied scope.
    const assemble = (
      scopeItems: { id: number; fields: WorkItemFields }[],
      openItemsScoped: OpenItem[],
      milestonesScoped: Milestone[],
      milestonesAvailableScoped: boolean,
      epicsList: EpicSummary[],
      useAnalytics: boolean,
    ): ProjectReportMetrics => {
      const s = this.computeScoped(scopeItems, today, refs);

      let weekly = s.weekly;
      let remainingHrs = s.remainingHrs;
      let analyticsUsed = false;
      if (useAnalytics && remainingMap) {
        analyticsUsed = true;
        weekly = weekly.map((p, i) => {
          const real = remainingMap.get(weekEnds[i]);
          return real !== undefined ? { ...p, remainingHrs: real } : p;
        });
        const base0 = weekly[0]?.remainingHrs ?? 0;
        weekly = weekly.map((p, i) => ({
          ...p,
          idealHrs: round2(base0 * (1 - (i + 1) / REPORT_WEEKS)),
        }));
        remainingHrs = weekly[weekly.length - 1]?.remainingHrs ?? remainingHrs;
      }

      // Attach planned time-off (leave) from team capacity to the scoped members.
      let teamLeaveHrs = 0;
      const team = s.team.map((t) => {
        const h = capacity?.byMember.get(t.name);
        if (h !== undefined) {
          teamLeaveHrs += h;
          return { ...t, leaveHrs: round2(h) };
        }
        return t;
      });
      teamLeaveHrs = round2(teamLeaveHrs);

      const blockers = openItemsScoped.filter(
        (o) => o.kind === 'Blocker' && !isDone(o.state),
      ).length;
      const signOffMs = milestonesScoped.find((m) => m.phase === 'Sign-Off');
      const pendingApprovals = signOffMs && signOffMs.status !== 'completed' ? 1 : 0;
      const signOff: SignOffReadiness = {
        criticalOpen: s.criticalOpen,
        blockedItems: blockers,
        overdueOpen: s.overdue,
        openBugs: s.bugs.open,
        pendingApprovals,
        status:
          blockers > 0
            ? 'Blocked'
            : s.criticalOpen + s.overdue + pendingApprovals + s.bugs.open > 0
              ? 'Pending'
              : 'Ready',
      };

      return {
        asOf,
        truncated,
        total: s.total,
        completed: s.completed,
        inProgress: s.inProgress,
        notStarted: s.notStarted,
        completionPct: s.completionPct,
        overdue: s.overdue,
        blockers,
        byState: s.byState,
        byType: s.byType,
        typeBreakdown: s.typeBreakdown,
        bugs: s.bugs,
        effort: s.effort,
        team,
        teamLoggedHrs: s.teamLoggedHrs,
        weekly,
        remainingHrs,
        teamLeaveHrs,
        analyticsUsed,
        signOff,
        dataQuality: s.dataQuality,
        sprints,
        sprintStats,
        epics: epicsList,
        milestones: milestonesScoped,
        milestonesOverdue: milestonesScoped.filter((m) => m.overdue).length,
        milestonesAvailable: milestonesAvailableScoped,
        openItems: openItemsScoped,
        openItemsTree: s.openItemsTree,
        workItems: s.workItems,
      };
    };

    // Per-Epic scoped reports (all sections filtered to the Epic's descendants).
    for (const epic of epics) {
      const descendants = collectDescendants(epic.id, childrenByParent);
      epic.report = assemble(
        descendants,
        epic.openItems,
        epic.milestones,
        epic.isDevelopment,
        [],
        false,
      );
    }

    // The returned (default) report is project-wide.
    return assemble(items, projectOpenItems, projMilestones, projMilestonesAvailable, epics, true);
  }

  /** Aggregate all per-item report sections for a scope (project or one Epic). */
  private computeScoped(
    scopeItems: { id: number; fields: WorkItemFields }[],
    today: string,
    refs: Record<string, string>,
  ): ScopedData {
    const revisedDateRef = refs['revised target date'];
    const revisedCountRef = refs['revised date count'];
    const staleThresholdDays = 1;
    let completed = 0;
    let notStarted = 0;
    let overdue = 0;
    let criticalOpen = 0;
    const stateCounts = new Map<string, number>();
    const typeCounts = new Map<string, number>();
    const typeBreakdownMap = new Map<string, TypeBreakdown>();
    const bugs: BugMetrics = { total: 0, open: 0, closed: 0, reopened: 0, reworkRate: 0 };
    const effort: EffortMetrics = {
      plannedHrs: 0,
      actualHrs: 0,
      enteredHrs: 0,
      gapAccuracyPct: 0,
      gapHygienePct: 0,
      gapBudgetPct: 0,
    };
    const teamMap = new Map<string, number>();
    const dataQuality: DataQualityItem[] = [];
    const rows: WorkItemRow[] = [];

    const weekBuckets = Array.from({ length: REPORT_WEEKS }, () => ({
      opened: 0,
      closed: 0,
      completed: 0,
    }));
    let completedBeforeWindow = 0;
    const weekIndex = (d?: string): number => {
      if (!d) return -1;
      const ago = daysBetween(d, today);
      if (ago < 0) return REPORT_WEEKS - 1;
      return REPORT_WEEKS - 1 - Math.floor(ago / 7);
    };

    const bump = (type: string, key: keyof Omit<TypeBreakdown, 'type'>): void => {
      const tb =
        typeBreakdownMap.get(type) ??
        (() => {
          const created: TypeBreakdown = {
            type,
            open: 0,
            inProgress: 0,
            completed: 0,
            overdue: 0,
            total: 0,
          };
          typeBreakdownMap.set(type, created);
          return created;
        })();
      tb[key] += 1;
    };

    for (const { id, fields } of scopeItems) {
      const type = str(fields, 'System.WorkItemType') || 'Unknown';
      const state = str(fields, 'System.State') || 'Unknown';
      const title = str(fields, 'System.Title');
      const reason = str(fields, 'System.Reason').toLowerCase();
      const start = toDateOnly(str(fields, 'Microsoft.VSTS.Scheduling.StartDate'));
      const due = toDateOnly(str(fields, 'Microsoft.VSTS.Scheduling.DueDate'));
      const changed = toDateOnly(str(fields, 'System.ChangedDate'));
      const iteration = str(fields, 'System.IterationPath');
      const priority = num(fields, 'Microsoft.VSTS.Common.Priority');
      const parentRaw = num(fields, 'System.Parent');
      const done = isDone(state);
      const started = isNotStarted(state);

      stateCounts.set(state, (stateCounts.get(state) ?? 0) + 1);
      typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
      bump(type, 'total');

      if (done) {
        completed += 1;
        bump(type, 'completed');
      } else if (started) {
        notStarted += 1;
        bump(type, 'open');
      } else {
        bump(type, 'inProgress');
      }

      const isOverdue = !!due && due < today && !done;
      if (isOverdue) {
        overdue += 1;
        bump(type, 'overdue');
      }
      if (!done && priority > 0 && priority <= 2) {
        criticalOpen += 1;
      }

      effort.plannedHrs += num(fields, 'Microsoft.VSTS.Scheduling.OriginalEstimate');
      const comp = num(fields, 'Microsoft.VSTS.Scheduling.CompletedWork');
      const rem = num(fields, 'Microsoft.VSTS.Scheduling.RemainingWork');
      effort.actualHrs += comp;
      effort.enteredHrs += comp + rem;
      const assignee = assignedName(fields);
      if (assignee && comp > 0) {
        teamMap.set(assignee, (teamMap.get(assignee) ?? 0) + comp);
      }

      const created = toDateOnly(str(fields, 'System.CreatedDate'));
      const oi = weekIndex(created);
      if (oi >= 0 && oi < REPORT_WEEKS) {
        weekBuckets[oi].opened += 1;
      }
      if (done) {
        const closedRaw =
          str(fields, 'Microsoft.VSTS.Common.ClosedDate') ||
          str(fields, 'Microsoft.VSTS.Common.StateChangeDate');
        const wi = weekIndex(toDateOnly(closedRaw));
        if (wi >= 0 && wi < REPORT_WEEKS) {
          weekBuckets[wi].closed += 1;
          weekBuckets[wi].completed += comp;
        } else if (wi < 0) {
          completedBeforeWindow += comp;
        }
      }

      if (type === 'Bug') {
        bugs.total += 1;
        if (done) bugs.closed += 1;
        else bugs.open += 1;
        if (reason.includes('reopen')) bugs.reopened += 1;
      }

      if (!done) {
        const issues: string[] = [];
        if (!start) issues.push('No start date');
        const estimatable = type === 'Task' || type === 'Bug' || type === 'User Story';
        if (estimatable && num(fields, 'Microsoft.VSTS.Scheduling.OriginalEstimate') === 0) {
          issues.push('No original estimate');
        }
        if (changed) {
          const age = daysBetween(changed, today);
          if (age > staleThresholdDays) issues.push(`Stale ${age}d`);
        }
        if (issues.length > 0 && dataQuality.length < 25) {
          dataQuality.push({ id, type, title, state, issues });
        }
      }

      const targetDate = toDateOnly(str(fields, 'Microsoft.VSTS.Scheduling.TargetDate'));
      const revisedDate = revisedDateRef ? toDateOnly(str(fields, revisedDateRef)) : undefined;
      const rcRaw = revisedCountRef ? Number(fields[revisedCountRef]) : NaN;
      const revisedCount = Number.isFinite(rcRaw) ? Math.max(0, rcRaw) : undefined;
      const origEst = num(fields, 'Microsoft.VSTS.Scheduling.OriginalEstimate');

      rows.push({
        id,
        type,
        title,
        state,
        assignedTo: assignee,
        dueDate: due,
        iteration,
        overdue: isOverdue,
        startDate: start,
        closedDate: done
          ? toDateOnly(
              str(fields, 'Microsoft.VSTS.Common.ClosedDate') ||
                str(fields, 'Microsoft.VSTS.Common.StateChangeDate'),
            )
          : undefined,
        targetDate,
        revisedDate,
        revisedCount,
        originalEstimate: origEst > 0 ? round2(origEst) : undefined,
        remainingWork: rem > 0 ? round2(rem) : undefined,
        completedWork: comp > 0 ? round2(comp) : undefined,
        parentId: parentRaw > 0 ? parentRaw : undefined,
        depth: 0,
      });
    }

    bugs.reworkRate = bugs.closed > 0 ? bugs.reopened / bugs.closed : 0;

    const total = scopeItems.length;
    const inProgress = Math.max(0, total - completed - notStarted);
    const completionPct = total > 0 ? Math.round((completed / total) * 100) : 0;

    effort.plannedHrs = round2(effort.plannedHrs);
    effort.actualHrs = round2(effort.actualHrs);
    effort.enteredHrs = round2(effort.enteredHrs);

    effort.gapAccuracyPct =
      effort.plannedHrs > 0
        ? Math.round(((effort.actualHrs - effort.plannedHrs) / effort.plannedHrs) * 100)
        : 0;
    effort.gapHygienePct =
      effort.actualHrs > 0
        ? Math.round(((effort.enteredHrs - effort.actualHrs) / effort.actualHrs) * 100)
        : 0;
    effort.gapBudgetPct =
      effort.plannedHrs > 0
        ? Math.round(((effort.enteredHrs - effort.plannedHrs) / effort.plannedHrs) * 100)
        : 0;

    const startRemaining = Math.max(0, effort.enteredHrs - completedBeforeWindow);
    let cumCompleted = 0;
    const weekly: WeeklyPoint[] = weekBuckets.map((w, i) => {
      cumCompleted += w.completed;
      return {
        label: `W${i + 1}`,
        opened: w.opened,
        closed: w.closed,
        remainingHrs: round2(Math.max(0, startRemaining - cumCompleted)),
        idealHrs: round2(startRemaining * (1 - (i + 1) / REPORT_WEEKS)),
      };
    });
    const remainingHrs = round2(Math.max(0, effort.enteredHrs - effort.actualHrs));

    const teamLoggedHrs = round2([...teamMap.values()].reduce((a, b) => a + b, 0));
    const rawTeamLogged = [...teamMap.values()].reduce((a, b) => a + b, 0);
    const team: TeamMemberEffort[] = [...teamMap.entries()]
      .map(([name, loggedHrs]) => ({
        name,
        initials: initialsOf(name),
        loggedHrs: round2(loggedHrs),
        effortPct: rawTeamLogged > 0 ? Math.round((loggedHrs / rawTeamLogged) * 100) : 0,
      }))
      .sort((a, b) => b.loggedHrs - a.loggedHrs);

    const toBuckets = (m: Map<string, number>): CountBucket[] =>
      [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);

    const workItems = buildTree(rows).slice(0, 300);
    const openItemsTree = buildOpenItemsTree(rows).slice(0, 500);

    const typeOrder = ['Epic', 'Feature', 'User Story', 'Task', 'Bug'];
    const typeBreakdown = [...typeBreakdownMap.values()].sort((a, b) => {
      const ia = typeOrder.indexOf(a.type);
      const ib = typeOrder.indexOf(b.type);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || b.total - a.total;
    });

    return {
      total,
      completed,
      inProgress,
      notStarted,
      completionPct,
      overdue,
      criticalOpen,
      byState: toBuckets(stateCounts),
      byType: toBuckets(typeCounts),
      typeBreakdown,
      bugs,
      effort,
      team,
      teamLoggedHrs,
      weekly,
      remainingHrs,
      dataQuality,
      workItems,
      openItemsTree,
    };
  }
}

/** Intermediate per-scope aggregation produced by computeScoped(). */
interface ScopedData {
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  completionPct: number;
  overdue: number;
  criticalOpen: number;
  byState: CountBucket[];
  byType: CountBucket[];
  typeBreakdown: TypeBreakdown[];
  bugs: BugMetrics;
  effort: EffortMetrics;
  team: TeamMemberEffort[];
  teamLoggedHrs: number;
  weekly: WeeklyPoint[];
  remainingHrs: number;
  dataQuality: DataQualityItem[];
  workItems: WorkItemRow[];
  openItemsTree: WorkItemRow[];
}

/** Compute a Milestone from a work item given its effective target date. */
function milestoneFrom(
  phase: string,
  item: { id: number; fields: WorkItemFields },
  target: string | undefined,
  revisedDateRef: string | undefined,
  revisedCountRef: string | undefined,
  today: string,
): Milestone {
  const state = str(item.fields, 'System.State');
  const done = isDone(state);
  const revised = revisedDateRef ? toDateOnly(str(item.fields, revisedDateRef)) : undefined;
  const rcRaw = revisedCountRef ? Number(item.fields[revisedCountRef]) : 0;
  const revisedCount = Number.isFinite(rcRaw) ? Math.max(0, rcRaw) : 0;
  const effective = revised ?? target;
  const overdue = !!effective && effective < today && !done;
  let status: MilestoneStatus = 'upcoming';
  if (done) {
    status = 'completed';
  } else if (overdue) {
    status = 'overdue';
  } else if (!effective) {
    status = 'not-set';
  } else if (effective >= today) {
    status = 'in-progress';
  }
  return {
    phase,
    featureId: item.id,
    targetDate: target,
    revisedDate: revised,
    revisedCount,
    status,
    overdue,
    slipDays: overdue && effective ? daysBetween(effective, today) : undefined,
  };
}

/** All descendant work items of a root id (breadth-first over the parent map). */
function collectDescendants(
  rootId: number,
  childrenByParent: Map<number, { id: number; fields: WorkItemFields }[]>,
): { id: number; fields: WorkItemFields }[] {
  const out: { id: number; fields: WorkItemFields }[] = [];
  const seen = new Set<number>([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.shift() as number;
    for (const child of childrenByParent.get(id) ?? []) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      out.push(child);
      queue.push(child.id);
    }
  }
  return out;
}

/**
 * Build the open-items branch as a tree: keep every Blocker/Clarification leaf
 * plus its ancestor chain (Open Items container → Feature → Epic), then flatten
 * to a pre-order list. Branches without any open items are dropped.
 */
function buildOpenItemsTree(rows: WorkItemRow[]): WorkItemRow[] {
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  const keep = new Set<number>();
  for (const r of rows) {
    if (!OPEN_ITEM_TYPES.includes(r.type)) continue;
    keep.add(r.id);
    let p = r.parentId;
    const guard = new Set<number>();
    while (p !== undefined && byId.has(p) && !guard.has(p)) {
      keep.add(p);
      guard.add(p);
      p = byId.get(p)?.parentId;
    }
  }
  return buildTree(rows.filter((r) => keep.has(r.id)));
}

/** Flatten work items into a parent→child pre-order list with computed depth. */
function buildTree(rows: WorkItemRow[]): WorkItemRow[] {
  const byId = new Map<number, WorkItemRow>();
  rows.forEach((r) => byId.set(r.id, r));
  const children = new Map<number, WorkItemRow[]>();
  const roots: WorkItemRow[] = [];
  for (const r of rows) {
    if (r.parentId && byId.has(r.parentId)) {
      const list = children.get(r.parentId) ?? [];
      list.push(r);
      children.set(r.parentId, list);
    } else {
      roots.push(r);
    }
  }
  const ordered: WorkItemRow[] = [];
  const visited = new Set<number>();
  const walk = (row: WorkItemRow, depth: number): void => {
    if (visited.has(row.id)) {
      return; // guard against cycles
    }
    visited.add(row.id);
    ordered.push({ ...row, depth });
    for (const child of children.get(row.id) ?? []) {
      walk(child, depth + 1);
    }
  };
  roots.forEach((r) => walk(r, 0));
  // Include any orphans not reached (defensive).
  for (const r of rows) {
    if (!visited.has(r.id)) {
      ordered.push({ ...r, depth: 0 });
    }
  }
  return ordered;
}
