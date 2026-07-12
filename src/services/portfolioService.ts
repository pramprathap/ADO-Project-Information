import { buildProjectServices, type OrgContext, type ProjectRef } from './orgServices';
import { fromProperties } from '@/utils/propertyMapper';
import { BILLING_TYPE_OPTIONS, PROJECT_STATUS_OPTIONS } from '@/constants/dropdownOptions';
import type { AttnReason, PortfolioProject, Rag } from '@/models/Portfolio';
import type { PortfolioSummary } from '@/models/ProjectReport';

const NON_BILLABLE_TYPES = new Set(['Internal', 'Internship']);
const NON_BILLABLE_BILLING = new Set(['InternalProject', 'NonBillable']);
const DONE_STATUSES = new Set(['Completed', 'Cancelled']);

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
  if (summary.overdue > 0) reasons.push({ t: `${summary.overdue} overdue items`, tone: 'red' });
  if (summary.milestonesOverdue > 0)
    reasons.push({ t: `${summary.milestonesOverdue} milestone slip`, tone: 'amber' });

  const billable = info.billingType
    ? !NON_BILLABLE_BILLING.has(info.billingType)
    : !NON_BILLABLE_TYPES.has(info.projectType ?? '');

  return {
    id: project.id,
    name: project.name,
    lead: info.projectManager?.displayName || info.deliveryManager?.displayName || '—',
    // Type = Billing Type from Project Information (Fixed Price / T&M / …).
    type: labelOf(BILLING_TYPE_OPTIONS, info.billingType) || 'Unspecified',
    typeRaw: info.billingType ?? '',
    region: info.clientRegion || '—',
    client: info.clientName || '—',
    status: labelOf(PROJECT_STATUS_OPTIONS, statusRaw) || statusRaw || '—',
    statusRaw,
    health,
    billable,
    plannedStart: info.projectStartDate || undefined,
    plannedDue,
    progress: summary.completionPct,
    rag,
    isOverdue,
    overdueDays,
    reasons: reasons.slice(0, 3),
    summary,
  };
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
