import { buildProjectServices, type OrgContext, type ProjectRef } from './orgServices';
import { fromProperties } from '@/utils/propertyMapper';
import { BILLING_TYPE_OPTIONS, PROJECT_STATUS_OPTIONS } from '@/constants/dropdownOptions';
import type { AttentionScore, AttnReason, PortfolioProject, Rag } from '@/models/Portfolio';
import type { PortfolioSummary } from '@/models/ProjectReport';

/**
 * Importance weights (the "does this project matter right now" lens):
 * Development and client-facing fixed-price work is escalated; internships and
 * internal training are deprioritised even when their boards look messy.
 */
const TYPE_WEIGHT: Record<string, number> = {
  Development: 1.0,
  ResourcingModel: 0.9,
  POC: 0.85,
  Support: 0.7,
  Other: 0.7,
  Internal: 0.55,
  TrainingAndLearning: 0.45,
  Internship: 0.35,
};
const BILLING_WEIGHT: Record<string, number> = {
  FixedPrice: 1.2,
  TimeAndMaterial: 1.05,
  Retainer: 1.0,
  InternalProject: 0.85,
  NonBillable: 0.85,
};

/**
 * Urgency (0..100): what is on fire —
 *  schedule slip · blocker load & age · overdue-item volume & age · human RAG ·
 *  rework loops · plus a "push to closure" boost for nearly-done projects.
 * Final priority = urgency × importance multiplier.
 */
function scoreAttention(p: Omit<PortfolioProject, 'attention'>): AttentionScore {
  const s = p.summary;
  const breakdown: string[] = [];
  let urgency = 0;
  const add = (points: number, label: string): void => {
    if (points > 0) {
      urgency += points;
      breakdown.push(`+${Math.round(points)} ${label}`);
    }
  };

  // Schedule: past the committed end date (the strongest client-facing signal).
  if (p.isOverdue) {
    add(15 + Math.min(1, p.overdueDays / 90) * 15, `project ${p.overdueDays}d past due`);
  }
  // Blockers: work someone is actively waiting on; age compounds it.
  if (s.blockers > 0) {
    add(Math.min(1, s.blockers / 5) * 15, `${s.blockers} open blocker${s.blockers === 1 ? '' : 's'}`);
    add(Math.min(1, s.oldestBlockerDays / 30) * 8, `oldest blocker ${s.oldestBlockerDays}d`);
  }
  // Overdue items: volume + how long the oldest has sat unattended.
  if (s.overdue > 0) {
    add(Math.min(1, s.overdue / 25) * 12, `${s.overdue} overdue items`);
    add(Math.min(1, s.overdueMaxAgeDays / 60) * 10, `oldest overdue ${s.overdueMaxAgeDays}d`);
  }
  // Human signal: the PM's own health call outranks derived numbers.
  if (p.health === 'Red') add(15, 'health marked Red');
  else if (p.health === 'Amber') add(8, 'health marked Amber');
  // Recurring quality issues: bugs bouncing back.
  const rework = s.bugsClosed > 0 ? s.bugsReopened / s.bugsClosed : 0;
  if (rework > 0.1) add(Math.min(1, rework / 0.4) * 10, `rework ${Math.round(rework * 100)}% (bugs reopen)`);
  // Push to closure: nearly done with a handful of stragglers — cheap win.
  const closeOut = p.progress >= 85 && s.openWork > 0 && s.openWork <= 8;
  if (closeOut) add(12, `close-out: only ${s.openWork} items left at ${p.progress}%`);

  urgency = Math.min(100, urgency);

  // Importance: project type × client-facing × billing model. Internal /
  // learning / internship work is hard-deprioritised — client delivery first.
  const typeW = TYPE_WEIGHT[p.projectTypeRaw] ?? 0.8;
  const clientW = p.billable && !p.isInternalish ? 1.15 : 0.85;
  const billingW = BILLING_WEIGHT[p.typeRaw] ?? 1.0;
  const internalW = p.isInternalish ? 0.4 : 1;
  const multiplier = Math.round(typeW * clientW * billingW * internalW * 100) / 100;
  breakdown.push(
    `× ${multiplier} importance (${p.projectTypeRaw || 'type not set'} · ${p.isInternalish ? 'internal/learning' : p.billable ? 'client' : 'internal'} · ${p.typeRaw || 'billing not set'})`,
  );

  return {
    score: Math.min(100, Math.round(urgency * multiplier)),
    urgency: Math.round(urgency),
    multiplier,
    breakdown,
    closeOut,
  };
}

const NON_BILLABLE_TYPES = new Set(['Internal', 'Internship']);
const NON_BILLABLE_BILLING = new Set(['InternalProject', 'NonBillable']);
// Perpetual = continuous engagement with no committed end date, so it can never
// be "overdue by planned end"; Completed/Cancelled are simply done.
const DONE_STATUSES = new Set(['Completed', 'Cancelled', 'Perpetual']);

function labelOf<T extends string>(opts: { value: T; label: string }[], v?: string): string {
  return (v && opts.find((o) => o.value === v)?.label) || '';
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Number.isNaN(a) || Number.isNaN(b) ? 0 : Math.round((b - a) / 86_400_000);
}

/** Map one project's Project Information + Boards summary into a PortfolioProject. */
function toPortfolioProject(
  project: ProjectRef,
  summary: PortfolioSummary,
  info: ReturnType<typeof fromProperties>,
  today: string,
): PortfolioProject {
  const statusRaw = info.projectStatus || '';
  const health = (info.projectHealth || '') as PortfolioProject['health'];
  const plannedDue = info.plannedEndDate || info.actualEndDate || undefined;
  const done = DONE_STATUSES.has(statusRaw);
  const isOverdue = !!plannedDue && plannedDue < today && !done;
  const overdueDays = isOverdue && plannedDue ? daysBetween(plannedDue, today) : 0;

  let rag: Rag;
  if (isOverdue || health === 'Red') rag = 'off';
  else if (health === 'Amber' || summary.blockers > 0 || summary.overdue > 0) rag = 'risk';
  else rag = 'on';

  const reasons: AttnReason[] = [];
  if (isOverdue) reasons.push({ t: `${overdueDays}d overdue`, tone: 'red' });
  if (health === 'Red') reasons.push({ t: 'Off track', tone: 'red' });
  if (summary.blockers > 0)
    reasons.push({ t: `${summary.blockers} blocker${summary.blockers === 1 ? '' : 's'}`, tone: 'amber' });
  if (summary.overdue > 0) {
    reasons.push({
      t: `${summary.overdue} overdue · oldest ${summary.overdueMaxAgeDays}d`,
      tone: 'red',
    });
  }
  if (summary.bugsClosed > 0 && summary.bugsReopened / summary.bugsClosed > 0.1)
    reasons.push({
      t: `rework ${Math.round((summary.bugsReopened / summary.bugsClosed) * 100)}%`,
      tone: 'amber',
    });
  if (summary.milestonesOverdue > 0)
    reasons.push({ t: `${summary.milestonesOverdue} milestone slip`, tone: 'amber' });

  const billable = info.billingType
    ? !NON_BILLABLE_BILLING.has(info.billingType)
    : !NON_BILLABLE_TYPES.has(info.projectType ?? '');

  // Internal / learning / internship detection. When Project Information is not
  // filled we fall back to a name/client heuristic so obvious internal projects
  // don't masquerade as client work in the attention ranking.
  const isInternalish =
    NON_BILLABLE_TYPES.has(info.projectType ?? '') ||
    info.projectType === 'TrainingAndLearning' ||
    (!!info.billingType && NON_BILLABLE_BILLING.has(info.billingType)) ||
    /\b(internal|learning|training|intern(ship)?s?|freshers?)\b/i.test(project.name) ||
    /^internal$/i.test(info.clientName ?? '');

  const base: Omit<PortfolioProject, 'attention'> = {
    id: project.id,
    name: project.name,
    lead: info.projectManager?.displayName || info.deliveryManager?.displayName || '—',
    // Type = Billing Type from Project Information (Fixed Price / T&M / …).
    type: labelOf(BILLING_TYPE_OPTIONS, info.billingType) || 'Unspecified',
    typeRaw: info.billingType ?? '',
    projectTypeRaw: info.projectType ?? '',
    region: info.clientRegion || 'Not set',
    client: info.clientName || '—',
    status: labelOf(PROJECT_STATUS_OPTIONS, statusRaw) || statusRaw || '—',
    statusRaw,
    phaseRaw: info.currentPhase ?? '',
    health,
    billable,
    isInternalish,
    plannedStart: info.projectStartDate || undefined,
    plannedDue,
    closureDate: info.actualEndDate || info.plannedEndDate || undefined,
    progress: summary.completionPct,
    rag,
    isOverdue,
    overdueDays,
    reasons: reasons.slice(0, 4),
    summary,
  };
  const attention = scoreAttention(base);
  if (attention.closeOut) {
    const closeReason: AttnReason = { t: `push to closure · ${summary.openWork} left`, tone: 'amber' };
    base.reasons = [closeReason, ...base.reasons].slice(0, 4);
  }
  return { ...base, attention };
}

/**
 * Load the portfolio: for each project, fetch its Boards summary + Project
 * Information in parallel (bounded concurrency) and merge. Failures per project
 * are skipped so one bad project never breaks the dashboard.
 */
export async function loadPortfolio(
  org: OrgContext,
  projects: ProjectRef[],
  onProgress?: (done: number, total: number) => void,
): Promise<PortfolioProject[]> {
  const today = todayStr();
  const results: PortfolioProject[] = [];
  let done = 0;
  const total = projects.length;
  const POOL = 5;

  const queue = [...projects];
  const worker = async (): Promise<void> => {
    for (;;) {
      const project = queue.shift();
      if (!project) return;
      try {
        const services = buildProjectServices(org, project);
        const [summary, bag] = await Promise.all([
          services.workItems.getPortfolioSummary(),
          services.properties.load(),
        ]);
        results.push(toPortfolioProject(project, summary, fromProperties(bag), today));
      } catch (err) {
        console.warn(`Portfolio: skipped project ${project.name}.`, err);
      } finally {
        done += 1;
        onProgress?.(done, total);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(POOL, total || 1) }, worker));
  return results.sort((a, b) => a.name.localeCompare(b.name));
}
