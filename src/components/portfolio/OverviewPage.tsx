import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as SDK from 'azure-devops-extension-sdk';
import { ErrorState } from '@/components/ErrorState';
import { ProgressLoader } from './ProgressLoader';
import { useVlDark, vlCanvasClass } from './vlTheme';
import { ProjectHealthPage } from '@/components/health/ProjectHealthPage';
import { buildProjectServices, listProjects, resolveOrgContext, type OrgContext } from '@/services/orgServices';
import { loadPortfolio } from '@/services/portfolioService';
import { MOCK_PORTFOLIO } from '@/services/mockPortfolio';
import { createMockAppServices } from '@/services/mockServices';
import type { AppServices } from '@/services/appServices';
import type { PortfolioProject } from '@/models/Portfolio';

const C = {
  navy: '#323F7C',
  orange: '#F47C20',
  green: '#2E7D32',
  greenSoft: '#1f8a5b',
  red: '#D64545',
  redHard: '#C0291C',
  amber: '#ED9B00',
  amberText: '#C25E00',
  purple: '#9c5cc4',
  ink: 'var(--vl-ink)',
  sub: 'var(--vl-sub)',
  faint: 'var(--vl-faint)',
  line: 'var(--vl-line)',
  line2: 'var(--vl-line2)',
  pageBg: 'var(--vl-page)',
};

const RAG_COLOR: Record<string, string> = { on: C.green, risk: C.amber, off: C.red };
const REGION_COLOR: Record<string, string> = {
  NA: '#323F7C',
  EMEA: '#F47C20',
  India: '#2E7D32',
  APAC: '#0a6cc2',
  LATAM: '#9c5cc4',
  Internal: 'var(--vl-faint)',
};
const EPIC_PALETTE = ['#2E7D32', '#F47C20', '#0a6cc2', '#9c5cc4', '#D64545', '#14b8a6', '#e3b341'];
/** Tag palette keyed by Billing Type display label. */
const TYPE_TAG: Record<string, { bg: string; fg: string }> = {
  'Fixed Price': { bg: '#eef0f8', fg: '#323F7C' },
  'Time and Material': { bg: '#e3edfb', fg: '#0a6cc2' },
  Retainer: { bg: '#f3e9fb', fg: '#9c5cc4' },
  'Internal Project': { bg: '#f3f2f1', fg: '#605e5c' },
  'Non-Billable': { bg: '#fdeede', fg: '#C25E00' },
  Unspecified: { bg: '#f3f2f1', fg: 'var(--vl-faint)' },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(d?: string): string {
  if (!d || !/^\d{4}-\d{2}-\d{2}/.test(d)) return '—';
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return `${String(day).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`;
}
function initialsOf(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  return ((p[0][0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

// ------------------------------------------------------------------ bootstrap
type Status = 'loading' | 'ready' | 'error';

export function OverviewPage() {
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [org, setOrg] = useState<OrgContext | null>(null);
  const [projects, setProjects] = useState<PortfolioProject[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [drill, setDrill] = useState<PortfolioProject | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const notified = useRef(false);

  // Soft refresh: re-fetch everything in the background while the current data
  // stays on screen; swap in the new snapshot when it lands.
  const refresh = async (): Promise<void> => {
    if (refreshing) return;
    if (import.meta.env.DEV) return;
    if (!org) return;
    setRefreshing(true);
    try {
      const list = await listProjects(org);
      setProgress({ done: 0, total: list.length });
      const data = await loadPortfolio(org, list, (done, total) => setProgress({ done, total }));
      setProjects(data);
    } catch (err) {
      console.error('Overview refresh failed.', err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (import.meta.env.DEV) {
          if (!cancelled) {
            setProjects(MOCK_PORTFOLIO);
            setStatus('ready');
          }
          return;
        }
        await SDK.init({ loaded: false, applyTheme: true });
        await SDK.ready();
        const resolved = await resolveOrgContext();
        const list = await listProjects(resolved);
        setProgress({ done: 0, total: list.length });
        const data = await loadPortfolio(resolved, list, (done, total) => {
          if (!cancelled) setProgress({ done, total });
        });
        if (!cancelled) {
          setOrg(resolved);
          setProjects(data);
          setStatus('ready');
        }
      } catch (err) {
        console.error('Overview initialization failed.', err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'The Overview failed to load.');
          setStatus('error');
          void SDK.notifyLoadFailed(err instanceof Error ? err : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!notified.current && status !== 'loading') {
      notified.current = true;
      if (!import.meta.env.DEV) void SDK.notifyLoadSucceeded();
    }
  }, [status]);

  // Services for the drilled-in project's full health report.
  const drillServices: AppServices | null = useMemo(() => {
    if (!drill) return null;
    if (import.meta.env.DEV) return createMockAppServices();
    if (!org) return null;
    return buildProjectServices(org, { id: drill.id, name: drill.name });
  }, [drill, org]);

  if (status === 'loading') {
    return <ProgressLoader done={progress.done} total={progress.total} label="Loading Portfolio Overview" />;
  }
  if (status === 'error') {
    return <ErrorState title="Failed to load Overview" message={error ?? 'An error occurred.'} />;
  }

  if (drill && drillServices) {
    return (
      <div className={vlCanvasClass(document.documentElement.getAttribute('data-appearance') === 'dark')} style={{ minHeight: '100vh' }}>
        {/* breadcrumb / back bar (as in the prototype page header) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--vl-card)', borderBottom: '1px solid var(--vl-line)', padding: '10px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontFamily: '"Segoe UI","Open Sans",system-ui,sans-serif' }}>
            <span onClick={() => setDrill(null)} style={{ color: C.sub, cursor: 'pointer' }}>Overview</span>
            <span style={{ color: 'var(--vl-borderStrong)' }}>›</span>
            <span style={{ color: 'var(--vl-brandText)', fontWeight: 700 }}>Project Health</span>
            <span style={{ color: 'var(--vl-borderStrong)' }}>›</span>
            <span style={{ color: C.orange, fontWeight: 700 }}>{drill.name}</span>
          </div>
          <div onClick={() => setDrill(null)} style={{ cursor: 'pointer', fontSize: 12, color: 'var(--vl-brandText)', border: '1px solid var(--vl-borderStrong)', borderRadius: 4, padding: '5px 11px', fontWeight: 600 }}>
            ‹ Back to Overview
          </div>
        </div>
        <ProjectHealthPage key={drill.id} services={drillServices} />
      </div>
    );
  }

  return (
    <OverviewBody
      projects={projects}
      onOpenProject={setDrill}
      onRefresh={() => void refresh()}
      refreshing={refreshing}
      refreshProgress={progress}
    />
  );
}

// ------------------------------------------------------------------ presentational
function OverviewBody({
  projects,
  onOpenProject,
  onRefresh,
  refreshing,
  refreshProgress,
}: {
  projects: PortfolioProject[];
  onOpenProject: (p: PortfolioProject) => void;
  onRefresh: () => void;
  refreshing: boolean;
  refreshProgress: { done: number; total: number };
}) {
  const dark = useVlDark();
  // Projects whose Current Phase is Closed are excluded from every metric and
  // list — they only appear in the Closed Projects card and the region donut.
  const closedProjects = useMemo(() => projects.filter((p) => p.phaseRaw === 'Closed'), [projects]);
  const active = useMemo(() => projects.filter((p) => p.phaseRaw !== 'Closed'), [projects]);
  const [fClient, setFClient] = useState('');
  const [fLead, setFLead] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fType, setFType] = useState('');
  const [fRegion, setFRegion] = useState('');
  const [attnOnly, setAttnOnly] = useState(false);

  const kpi = useMemo(() => {
    const billable = active.filter((p) => p.billable).length;
    const sum = (f: (p: PortfolioProject) => number): number => active.reduce((a, p) => a + f(p), 0);
    const tasksTotal = sum((p) => p.summary.tasksTotal);
    const bugsTotal = sum((p) => p.summary.bugsTotal);
    return {
      totalProjects: active.length,
      billable,
      nonBillable: active.length - billable,
      active: active.filter((p) => p.statusRaw === 'InProgress').length,
      noStatus: active.filter((p) => !p.statusRaw).length,
      development: active.filter((p) => p.projectTypeRaw === 'Development').length,
      support: active.filter((p) => p.projectTypeRaw === 'Support').length,
      resourcing: active.filter((p) => p.projectTypeRaw === 'ResourcingModel').length,
      internal: active.filter((p) => p.projectTypeRaw === 'Internal').length,
      learning: active.filter(
        (p) => p.projectTypeRaw === 'TrainingAndLearning' || p.projectTypeRaw === 'Internship',
      ).length,
      noType: active.filter((p) => !p.projectTypeRaw).length,
      overdue: active.filter((p) => p.isOverdue).length,
      openTask: sum((p) => p.summary.tasksOpen),
      overdueTask: sum((p) => p.summary.tasksOverdue),
      openBug: sum((p) => p.summary.bugsOpen),
      taskBugRatio: bugsTotal > 0 ? `${(tasksTotal / bugsTotal).toFixed(1)} : 1` : '—',
      openItems: sum((p) => p.summary.openItemsCount),
    };
  }, [active]);

  // Region breakdown counts ALL projects (incl. closed — the user's region-wise
  // census); the RAG health split is computed from active projects only.
  const regions = useMemo(() => {
    const map = new Map<
      string,
      { total: number; closed: number; on: number; risk: number; off: number; overdue: number }
    >();
    for (const p of projects) {
      const r = map.get(p.region) ?? { total: 0, closed: 0, on: 0, risk: 0, off: 0, overdue: 0 };
      r.total += 1;
      if (p.phaseRaw === 'Closed') {
        r.closed += 1;
      } else {
        r[p.rag] += 1;
        if (p.isOverdue) r.overdue += 1;
      }
      map.set(p.region, r);
    }
    return [...map.entries()]
      .map(([region, v]) => ({ region, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [projects]);

  const leads = useMemo(() => {
    const map = new Map<
      string,
      { total: number; on: number; risk: number; off: number; overdue: number; slip: number; blockers: number }
    >();
    for (const p of active) {
      const l = map.get(p.lead) ?? { total: 0, on: 0, risk: 0, off: 0, overdue: 0, slip: 0, blockers: 0 };
      l.total += 1;
      l[p.rag] += 1;
      if (p.isOverdue) {
        l.overdue += 1;
        l.slip += p.overdueDays;
      }
      l.blockers += p.summary.blockers;
      map.set(p.lead, l);
    }
    return [...map.entries()]
      .map(([lead, v]) => ({ lead, ...v, avgSlip: v.overdue ? Math.round(v.slip / v.overdue) : 0 }))
      .sort((a, b) => b.off - a.off || b.overdue - a.overdue || b.total - a.total);
  }, [active]);

  // Ranked by the attention engine: urgency (slip, blockers, aging, rework,
  // close-out) × importance (Development & client fixed-price weighted up).
  // Internal / learning / internship projects are EXCLUDED — client work first.
  const attentionAll = useMemo(
    () =>
      active
        .filter((p) => !p.isInternalish && p.attention.score > 0)
        .sort((a, b) => b.attention.score - a.attention.score),
    [active],
  );
  const attention = attentionAll.slice(0, 6);
  const attnOff = attentionAll.filter((p) => p.rag === 'off').length;
  const internalHidden = useMemo(
    () => active.filter((p) => p.isInternalish && p.attention.score > 0).length,
    [active],
  );
  const projectsWithOverdueItems = useMemo(
    () => active.filter((p) => p.summary.overdue > 0).length,
    [active],
  );
  // "Overdue" as a delivery manager reads it: past its committed end date OR
  // carrying overdue work items (excluding internal/learning noise).
  const overdueClientProjects = useMemo(
    () => active.filter((p) => !p.isInternalish && (p.isOverdue || p.summary.overdue > 0)).length,
    [active],
  );

  // Card-driven grid filter: clicking a KPI card scopes the Projects grid to
  // the projects behind that number (click again to clear).
  type CardFilter =
    | ''
    | 'inDelivery'
    | 'support'
    | 'resourcing'
    | 'internal'
    | 'closed'
    | 'overdue'
    | 'tasks'
    | 'bugs'
    | 'items';
  const [cardFilter, setCardFilter] = useState<CardFilter>('');
  const gridRef = useRef<HTMLDivElement | null>(null);
  const CARD_LABEL: Record<Exclude<CardFilter, ''>, string> = {
    inDelivery: 'In Delivery',
    support: 'Support',
    resourcing: 'Resourcing Model',
    internal: 'Internal',
    closed: 'Closed Projects',
    overdue: 'Overdue Projects',
    tasks: 'with open tasks',
    bugs: 'with open bugs',
    items: 'with open items',
  };
  const pickCard = (f: Exclude<CardFilter, ''>): void => {
    setCardFilter((cur) => (cur === f ? '' : f));
    gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const cardMatch = (p: PortfolioProject): boolean => {
    switch (cardFilter) {
      case 'inDelivery':
        return p.statusRaw === 'InProgress';
      case 'support':
        return p.projectTypeRaw === 'Support';
      case 'resourcing':
        return p.projectTypeRaw === 'ResourcingModel';
      case 'internal':
        return p.projectTypeRaw === 'Internal';
      case 'overdue':
        return !p.isInternalish && (p.isOverdue || p.summary.overdue > 0);
      case 'tasks':
        return p.summary.tasksOpen > 0;
      case 'bugs':
        return p.summary.bugsOpen > 0;
      case 'items':
        return p.summary.openItemsCount > 0;
      default:
        return true;
    }
  };

  const rows = useMemo(() => {
    // The Closed card swaps the grid to the (otherwise hidden) closed projects.
    const base = cardFilter === 'closed' ? closedProjects : active;
    return base.filter(
      (p) =>
        cardMatch(p) &&
        (!fClient || p.client === fClient) &&
        (!fLead || p.lead === fLead) &&
        (!fStatus || p.statusRaw === fStatus) &&
        (!fType || p.typeRaw === fType) &&
        (!fRegion || p.region === fRegion) &&
        (!attnOnly || p.rag !== 'on'),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, closedProjects, cardFilter, fClient, fLead, fStatus, fType, fRegion, attnOnly]);

  const uniq = (arr: string[]): string[] => [...new Set(arr.filter(Boolean))].sort();
  const hasFilters = !!(fClient || fLead || fStatus || fType || fRegion || attnOnly || cardFilter);
  const clearFilters = (): void => {
    setFClient('');
    setFLead('');
    setFStatus('');
    setFType('');
    setFRegion('');
    setAttnOnly(false);
    setCardFilter('');
  };

  return (
    <div
      className={vlCanvasClass(dark)}
      style={{
        background: C.pageBg,
        color: C.ink,
        fontFamily: '"Segoe UI","Open Sans",system-ui,sans-serif',
        padding: '16px clamp(12px,2vw,28px) 40px',
        minHeight: '100vh',
      }}
    >
      {/* intro */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ font: '800 22px "Open Sans",sans-serif' }}>Portfolio Overview</div>
              <div style={{ fontSize: 12, color: 'var(--vl-faint)', marginTop: 2 }}>
                Delivery health across {kpi.totalProjects} active projects · what needs attention this week
                {closedProjects.length > 0 && ` · ${closedProjects.length} closed projects excluded (regions only)`}
              </div>
            </div>
            <div
              onClick={refreshing ? undefined : onRefresh}
              title="Re-fetch all projects in the background — the page stays interactive"
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: refreshing ? 'default' : 'pointer', border: `1px solid ${refreshing ? C.orange : 'var(--vl-borderStrong)'}`, background: 'var(--vl-card)', color: refreshing ? C.amberText : 'var(--vl-brandText)', borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 700 }}
            >
              <span style={{ display: 'inline-block', animation: refreshing ? 'vlSpin 1s linear infinite' : undefined }}>↻</span>
              {refreshing
                ? `Refreshing… ${refreshProgress.done}/${refreshProgress.total}`
                : 'Refresh'}
            </div>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 11, marginBottom: 14 }}>
        <Kpi
          icon={<IconGrid />}
          iconBg="#eef0f8"
          label="Active Projects"
          value={kpi.totalProjects}
          sub={
            <span title="All projects except those whose Current Phase is Closed in Project Information.">
              {kpi.billable} billable · {kpi.nonBillable} internal
            </span>
          }
        />
        <Kpi
          icon={<IconPulse />}
          iconBg="#e7f3ec"
          label="In Delivery"
          value={kpi.active}
          onClick={() => pickCard('inDelivery')}
          selected={cardFilter === 'inDelivery'}
          sub={
            <span title="Projects whose Project Status is set to 'In Progress' in Project Information. Projects with no status set are not counted here — filling Delivery Status makes this number meaningful.">
              Project Status = In Progress · {kpi.noStatus} not set
            </span>
          }
        />
        <Kpi
          icon={<IconWrench />}
          iconBg="#e3edfb"
          label="Support"
          value={kpi.support}
          onClick={() => pickCard('support')}
          selected={cardFilter === 'support'}
          sub={<span title="Active projects whose Project Type is 'Support' in Project Information.">Project Type = Support</span>}
        />
        <Kpi
          icon={<IconPeople />}
          iconBg="#f3e9fb"
          label="Resourcing Model"
          value={kpi.resourcing}
          onClick={() => pickCard('resourcing')}
          selected={cardFilter === 'resourcing'}
          sub={<span title="Active projects whose Project Type is 'Resourcing Model' in Project Information.">staff augmentation</span>}
        />
        <Kpi
          icon={<IconHome />}
          iconBg="#f3f2f1"
          label="Internal"
          value={kpi.internal}
          onClick={() => pickCard('internal')}
          selected={cardFilter === 'internal'}
          sub={
            <span title={`Active projects tagged Project Type = Internal. Learning/internship: ${kpi.learning}. Projects with no Project Type set: ${kpi.noType}.`}>
              +{kpi.learning} learning · {kpi.noType} untyped
            </span>
          }
        />
        <Kpi
          icon={<IconDone />}
          iconBg="#e7f3ec"
          label="Closed Projects"
          value={closedProjects.length}
          onClick={() => pickCard('closed')}
          selected={cardFilter === 'closed'}
          valueColor={C.greenSoft}
          sub="phase Closed · counted in regions only"
        />
        <Kpi
          icon={<IconClock />}
          iconBg="#fde0db"
          label="Overdue Projects"
          labelColor={C.redHard}
          value={overdueClientProjects}
          valueColor="#B3261E"
          sub={
            <span
              title={`Client projects past their planned end date OR carrying overdue work items (internal/learning excluded).\n${kpi.overdue} past planned end date · ${projectsWithOverdueItems} with overdue items (all projects).`}
            >
              client work · past end date or overdue items
            </span>
          }
          subColor={C.redHard}
          topBar={C.red}
          onClick={() => pickCard('overdue')}
          selected={cardFilter === 'overdue'}
        />
        <Kpi icon={<IconList />} iconBg="#eef0f8" label="Open Tasks" value={kpi.openTask} sub={<><b>{kpi.overdueTask}</b> overdue</>} subColor={C.redHard} onClick={() => pickCard('tasks')} selected={cardFilter === 'tasks'} />
        <Kpi icon={<IconBug />} iconBg="#fdeede" label="Open Bugs" value={kpi.openBug} sub={`Task : Bug = ${kpi.taskBugRatio}`} onClick={() => pickCard('bugs')} selected={cardFilter === 'bugs'} />
        <Kpi icon={<IconChat />} iconBg="#fdeede" label="Open Items" value={kpi.openItems} sub="clarifications & blockers" onClick={() => pickCard('items')} selected={cardFilter === 'items'} />
      </div>

      {/* insights: needs attention + region */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 12, marginBottom: 12 }}>
        <Card pad="12px 14px">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ font: '600 13px "Open Sans",sans-serif', color: C.redHard }}>
              ⚠ Needs attention <span style={{ color: C.faint, fontWeight: 400 }}>· ranked by urgency</span>
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.redHard, background: '#fde0db', borderRadius: 9, padding: '2px 9px' }}>
              {attentionAll.length} flagged
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--vl-sub)', marginBottom: 10 }}>
            Top {attention.length} of {attentionAll.length} <b>client</b> projects by priority score · {attnOff} off-track — urgency (slip, blockers, aging, rework, close-out) × importance (Development &amp; fixed-price first). Hover a score for the math.
            {internalHidden > 0 && <> · <span style={{ color: 'var(--vl-faint)' }}>{internalHidden} internal / learning projects hidden</span></>}
          </div>
          {attention.length === 0 ? (
            <div style={{ padding: 18, textAlign: 'center', color: C.greenSoft, fontSize: 12, background: '#e7f3ec', borderRadius: 6 }}>
              ✓ Nothing needs attention — all projects on track
            </div>
          ) : (
            attention.map((a, i) => (
              <div
                key={a.id}
                onClick={() => onOpenProject(a)}
                className="vl-row"
                style={{ display: 'flex', alignItems: 'stretch', marginBottom: 7, border: '1px solid var(--vl-line)', borderRadius: 7, overflow: 'hidden', cursor: 'pointer', background: i === 0 ? 'var(--vl-hover)' : 'var(--vl-card)' }}
              >
                <div style={{ width: 4, background: RAG_COLOR[a.rag], flexShrink: 0 }} />
                <div
                  style={{
                    width: 30,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: i === 0 ? C.redHard : a.rag === 'off' ? '#fde0db' : 'var(--vl-line2)',
                    color: i === 0 ? '#fff' : a.rag === 'off' ? C.redHard : C.sub,
                    font: '800 13px "Open Sans",sans-serif',
                  }}
                >
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0, padding: '8px 11px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--vl-ink2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: 10, color: C.sub }}>{a.progress}% complete</span>
                      <span
                        title={`Priority ${a.attention.score} = urgency ${a.attention.urgency} × importance ${a.attention.multiplier}\n${a.attention.breakdown.join('\n')}`}
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          color: '#fff',
                          background: a.attention.score >= 60 ? C.redHard : a.attention.score >= 35 ? '#ED9B00' : '#8a94a6',
                          borderRadius: 9,
                          padding: '2px 8px',
                          cursor: 'help',
                        }}
                      >
                        {a.attention.score}
                      </span>
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--vl-sub)', margin: '2px 0 6px' }}>
                    {a.lead} · {a.region} · {a.projectTypeRaw || 'type not set'} · {a.billable ? 'client' : 'internal'}
                  </div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {a.reasons.map((rs, k) => (
                      <span key={k} style={{ fontSize: 10, fontWeight: 700, color: rs.tone === 'red' ? C.redHard : C.amberText, background: rs.tone === 'red' ? '#fde0db' : '#fdeede', borderRadius: 3, padding: '2px 7px', whiteSpace: 'nowrap' }}>{rs.t}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </Card>

        <Card pad="12px 14px">
          <div style={{ font: '600 13px "Open Sans",sans-serif', marginBottom: 10 }}>Region breakdown</div>
          <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${C.line2}` }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
              <Donut segments={regions.map((r) => ({ value: r.total, color: REGION_COLOR[r.region] ?? C.navy }))} total={projects.length} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
              {regions.map((r) => (
                <div key={r.region} onClick={() => setFRegion(r.region)} className="vl-row" style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px', cursor: 'pointer', borderRadius: 3 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: REGION_COLOR[r.region] ?? C.navy, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 11, color: 'var(--vl-ink2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.region}</span>
                  <span style={{ fontSize: 11, fontWeight: 700 }}>{r.total}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--vl-sub)', marginBottom: 8, fontWeight: 600 }}>
            Health by region <span style={{ fontWeight: 400 }}> · <span style={{ color: C.greenSoft }}>■</span> On track <span style={{ color: C.amber }}>■</span> At risk <span style={{ color: C.red }}>■</span> Off track</span>
          </div>
          {regions.map((r) => {
            const activeCount = r.on + r.risk + r.off;
            return (
              <div key={r.region} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '8px 0', borderBottom: `1px solid ${C.line2}` }}>
                <div style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 7, background: 'var(--vl-soft2)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '800 15px "Open Sans",sans-serif', color: 'var(--vl-brandText)' }}>{r.total}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--vl-ink2)' }}>
                      {r.region}
                      {r.closed > 0 && <span style={{ fontSize: 10, fontWeight: 400, color: C.faint }}> · {r.closed} closed</span>}
                    </span>
                    {r.overdue > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: C.red, borderRadius: 9, padding: '1px 8px' }}>{r.overdue} overdue</span>}
                  </div>
                  <StackBar segs={[{ w: pct(r.on, activeCount), c: C.green }, { w: pct(r.risk, activeCount), c: C.amber }, { w: pct(r.off, activeCount), c: C.red }]} h={12} />
                </div>
              </div>
            );
          })}
        </Card>
      </div>

      {/* lead performance */}
      <Card pad="12px 14px" style={{ marginBottom: 12 }}>
        <div style={{ font: '600 13px "Open Sans",sans-serif', marginBottom: 4 }}>
          Lead delivery performance <span style={{ color: C.faint, fontWeight: 400 }}>· who needs help — sorted by off-track & overdue load · click a lead to filter</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--vl-sub)', marginBottom: 12 }}>
          Portfolio mix per lead: <span style={{ color: C.green, fontWeight: 700 }}>■</span> on track <span style={{ color: C.amber, fontWeight: 700 }}>■</span> at risk <span style={{ color: C.red, fontWeight: 700 }}>■</span> off track
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 720 }}>
            <thead>
              <tr style={{ background: 'var(--vl-soft)', color: C.sub, textAlign: 'left', borderBottom: '2px solid var(--vl-line)' }}>
                <Th>Lead</Th>
                <Th w={230}>Portfolio mix</Th>
                <Th center>Projects</Th>
                <Th center>Off track</Th>
                <Th center>Overdue</Th>
                <Th center>Avg slip</Th>
                <Th center>Blockers</Th>
                <Th right>Status</Th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lp) => {
                const st = leadStatus(lp);
                return (
                  <tr key={lp.lead} onClick={() => setFLead(lp.lead)} className="vl-row" style={{ borderBottom: `1px solid ${C.line2}`, cursor: 'pointer' }}>
                    <Td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <span style={{ width: 28, height: 28, borderRadius: '50%', background: st.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{initialsOf(lp.lead)}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--vl-ink2)' }}>{lp.lead}</span>
                      </span>
                    </Td>
                    <Td><div style={{ width: 200 }}><StackBar segs={[{ w: pct(lp.on, lp.total), c: C.green }, { w: pct(lp.risk, lp.total), c: C.amber }, { w: pct(lp.off, lp.total), c: C.red }]} h={14} /></div></Td>
                    <Td center bold>{lp.total}</Td>
                    <Td center bold color={lp.off ? C.red : C.sub}>{lp.off}</Td>
                    <Td center bold color={lp.overdue ? C.redHard : C.sub}>{lp.overdue}</Td>
                    <Td center color={C.sub}>{lp.avgSlip ? `${lp.avgSlip}d` : '—'}</Td>
                    <Td center color={C.sub}>{lp.blockers}</Td>
                    <Td right><span style={{ fontSize: 10, fontWeight: 700, color: st.color, background: st.bg, borderRadius: 4, padding: '3px 10px', whiteSpace: 'nowrap' }}>{st.label}</span></Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* projects table */}
      <div ref={gridRef}>
      <Card style={{ overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', padding: '11px 14px', borderBottom: `1px solid ${C.line2}` }}>
          <div style={{ font: '600 13px "Open Sans",sans-serif', alignSelf: 'center' }}>
            Projects <span style={{ color: C.faint, fontWeight: 400 }}>· {rows.length} shown · click a row to drill in</span>
            {cardFilter && (
              <span
                onClick={() => setCardFilter('')}
                style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: C.amberText, background: '#fdeede', border: `1px solid ${C.orange}`, borderRadius: 9, padding: '2px 9px', cursor: 'pointer' }}
                title="Click to clear this card filter"
              >
                {CARD_LABEL[cardFilter]} ✕
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
            <Filter label="Client Name" value={fClient} onChange={setFClient} options={uniq(active.map((p) => p.client))} />
            <Filter label="Project Lead" value={fLead} onChange={setFLead} options={uniq(active.map((p) => p.lead))} />
            <Filter label="Status" value={fStatus} onChange={setFStatus} options={uniq(active.map((p) => p.statusRaw))} render={(v) => labelStatus(v)} />
            <Filter label="Type" value={fType} onChange={setFType} options={uniq(active.map((p) => p.typeRaw))} render={labelBilling} />
            <Filter label="Region" value={fRegion} onChange={setFRegion} options={uniq(active.map((p) => p.region))} />
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              <div style={{ fontSize: 10, marginBottom: 3 }}>&nbsp;</div>
              <div onClick={() => setAttnOnly((v) => !v)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${attnOnly ? C.orange : '#ED9B00'}`, background: attnOnly ? '#fdeede' : 'var(--vl-card)', color: C.amberText, borderRadius: 4, padding: '6px 12px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>⚠ At-risk &amp; overdue only</div>
            </div>
            {hasFilters && (
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                <div style={{ fontSize: 10, marginBottom: 3 }}>&nbsp;</div>
                <div onClick={clearFilters} style={{ cursor: 'pointer', background: C.orange, color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 4, padding: '7px 14px' }}>Clear</div>
              </div>
            )}
          </div>
        </div>
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 640 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, whiteSpace: 'nowrap', minWidth: 1000 }}>
            <thead>
              <tr style={{ background: C.navy, color: '#fff', textAlign: 'left', position: 'sticky', top: 0, zIndex: 1 }}>
                <Th light>Title</Th>
                <Th light>Epics</Th>
                <Th light>Project Lead</Th>
                <Th light>Type</Th>
                <Th light w={120}>Progress</Th>
                <Th light>Closure Date</Th>
                <Th light right>Tasks</Th>
                <Th light right>Bugs</Th>
                <Th light right>Open Items</Th>
                <Th light right>Overdue</Th>
                <Th light right>Closed</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} onClick={() => onOpenProject(r)} className="vl-row" style={{ borderBottom: `1px solid ${C.line2}`, cursor: 'pointer' }}>
                  <Td>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: RAG_COLOR[r.rag], flexShrink: 0 }} />
                      <span style={{ fontWeight: 600, color: r.isOverdue ? '#B3261E' : 'var(--vl-ink2)' }}>{r.name}</span>
                    </span>
                    {r.isOverdue && <span style={{ fontSize: 10, color: '#B3261E', marginLeft: 16 }}>{r.overdueDays}d overdue</span>}
                  </Td>
                  <Td>
                    <EpicsCell epics={r.summary.epics} />
                  </Td>
                  <Td color="var(--vl-ink2)">{r.lead}</Td>
                  <Td>
                    <span style={{ fontSize: 10, fontWeight: 600, color: (TYPE_TAG[r.type] ?? TYPE_TAG.Unspecified).fg, background: (TYPE_TAG[r.type] ?? TYPE_TAG.Unspecified).bg, borderRadius: 3, padding: '2px 7px' }}>{r.type}</span>
                  </Td>
                  <Td>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ flex: 1, height: 7, background: 'var(--vl-track)', borderRadius: 2, overflow: 'hidden', minWidth: 60 }}>
                        <span style={{ display: 'block', width: `${r.progress}%`, height: '100%', background: RAG_COLOR[r.rag] }} />
                      </span>
                      <span style={{ width: 30, color: C.sub, fontSize: 11 }}>{r.progress}%</span>
                    </span>
                  </Td>
                  <Td color={r.isOverdue ? '#B3261E' : 'var(--vl-ink2)'} bold={r.isOverdue}>{fmtDate(r.closureDate)}</Td>
                  <Td right color="var(--vl-ink2)">{r.summary.tasksTotal}</Td>
                  <Td right color="var(--vl-ink2)">{r.summary.bugsTotal}</Td>
                  <Td right color="var(--vl-ink2)">{r.summary.openWork}</Td>
                  <Td right><span style={{ fontWeight: 700, color: r.summary.overdue ? C.redHard : C.sub }}>{r.summary.overdue}</span></Td>
                  <Td right color={C.greenSoft} bold>{r.summary.closedCount}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ small helpers
function pct(n: number, total: number): number {
  return total > 0 ? (n / total) * 100 : 0;
}
function labelBilling(v: string): string {
  const m: Record<string, string> = {
    FixedPrice: 'Fixed Price',
    TimeAndMaterial: 'Time and Material',
    Retainer: 'Retainer',
    InternalProject: 'Internal Project',
    NonBillable: 'Non-Billable',
  };
  return m[v] ?? v;
}
function labelStatus(v: string): string {
  const m: Record<string, string> = {
    NotStarted: 'Not Started',
    InProgress: 'In Progress',
    Perpetual: 'Perpetual (Continuous)',
    OnHold: 'On Hold',
    Completed: 'Completed',
    Cancelled: 'Cancelled',
  };
  return m[v] ?? v;
}
function leadStatus(lp: { off: number; overdue: number; risk: number }): { label: string; color: string; bg: string } {
  if (lp.off > 0 || lp.overdue > 0) return { label: 'Needs help', color: C.red, bg: '#fde0db' };
  if (lp.risk > 0) return { label: 'Watch', color: C.amberText, bg: '#fdeede' };
  return { label: 'On track', color: C.greenSoft, bg: '#e7f3ec' };
}

function Card({ children, pad, style }: { children: ReactNode; pad?: string; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--vl-card)', border: `1px solid ${C.line}`, borderRadius: 10, boxShadow: '0 1px 2px rgba(16,24,64,.05)', padding: pad, ...style }}>
      {children}
    </div>
  );
}

function Kpi({
  icon,
  iconBg,
  label,
  labelColor,
  value,
  valueColor,
  sub,
  subColor,
  topBar,
  onClick,
  selected,
}: {
  icon: ReactNode;
  iconBg: string;
  label: string;
  labelColor?: string;
  value: number;
  valueColor?: string;
  sub: ReactNode;
  subColor?: string;
  topBar?: string;
  onClick?: () => void;
  selected?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      title={onClick ? (selected ? 'Click to clear this filter' : 'Click to filter the Projects grid below') : undefined}
      style={{
        background: selected ? 'var(--vl-hover)' : 'var(--vl-card)',
        border: `1px solid ${selected ? C.orange : C.line}`,
        outline: selected ? `1px solid ${C.orange}` : undefined,
        borderRadius: 10,
        padding: '13px 15px',
        boxShadow: '0 1px 2px rgba(16,24,64,.05)',
        borderTop: topBar ? `3px solid ${topBar}` : undefined,
        cursor: onClick ? 'pointer' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
        <span style={{ fontSize: 10, color: labelColor ?? C.sub, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</span>
      </div>
      <div style={{ font: '800 28px "Open Sans",sans-serif', color: valueColor ?? C.ink, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: subColor ?? 'var(--vl-faint)', marginTop: 6 }}>{sub}</div>
    </div>
  );
}

/** Epics split into closed vs ongoing groups within the same column. */
function EpicsCell({ epics }: { epics: { id: number; name: string; completed: boolean }[] }) {
  const done = epics.filter((e) => e.completed);
  const ongoing = epics.filter((e) => !e.completed);
  if (epics.length === 0) {
    return <span style={{ fontSize: 10, color: C.faint }}>0 epics</span>;
  }
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {done.length > 0 && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'flex', gap: 3 }}>
            {done.slice(0, 5).map((e) => (
              <span key={e.id} title={`${e.name} — closed`} style={{ width: 9, height: 9, borderRadius: '50%', background: C.green }} />
            ))}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.greenSoft }}>{done.length} closed</span>
        </span>
      )}
      {done.length > 0 && ongoing.length > 0 && <span style={{ color: 'var(--vl-faint)' }}>·</span>}
      {ongoing.length > 0 && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'flex', gap: 3 }}>
            {ongoing.slice(0, 5).map((e, i) => (
              <span key={e.id} title={`${e.name} — ongoing`} style={{ width: 9, height: 9, borderRadius: '50%', background: EPIC_PALETTE[(i + 1) % EPIC_PALETTE.length] }} />
            ))}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--vl-brandText)' }}>{ongoing.length} ongoing</span>
        </span>
      )}
    </span>
  );
}

function StackBar({ segs, h }: { segs: { w: number; c: string }[]; h: number }) {
  return (
    <div style={{ display: 'flex', height: h, borderRadius: 3, overflow: 'hidden', background: C.line2 }}>
      {segs.map((s, i) => (
        <div key={i} style={{ width: `${s.w}%`, background: s.c }} />
      ))}
    </div>
  );
}

function Donut({ segments, total }: { segments: { value: number; color: string }[]; total: number }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width={120} height={120} viewBox="0 0 120 120">
      <circle cx={60} cy={60} r={r} fill="none" style={{ stroke: 'var(--vl-track2)' }} strokeWidth={18} />
      {segments.map((s, i) => {
        const len = total > 0 ? (s.value / total) * circ : 0;
        const el = (
          <circle
            key={i}
            cx={60}
            cy={60}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={18}
            strokeDasharray={`${len} ${circ - len}`}
            strokeDashoffset={-acc}
            transform="rotate(-90 60 60)"
          />
        );
        acc += len;
        return el;
      })}
      <text x={60} y={58} textAnchor="middle" style={{ font: '800 22px "Open Sans",sans-serif', fill: C.ink }}>{total}</text>
      <text x={60} y={74} textAnchor="middle" style={{ fontSize: 10, fill: C.sub }}>projects</text>
    </svg>
  );
}

function Th({ children, w, center, right, light }: { children?: ReactNode; w?: number; center?: boolean; right?: boolean; light?: boolean }) {
  return (
    <th style={{ padding: light ? '8px 12px' : '8px 12px', fontWeight: 600, width: w, textAlign: center ? 'center' : right ? 'right' : 'left', color: light ? '#fff' : undefined }}>
      {children}
    </th>
  );
}
function Td({ children, center, right, bold, color }: { children?: ReactNode; center?: boolean; right?: boolean; bold?: boolean; color?: string }) {
  return (
    <td style={{ padding: '8px 12px', textAlign: center ? 'center' : right ? 'right' : 'left', fontWeight: bold ? 700 : undefined, color }}>
      {children}
    </td>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
  render,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  render?: (v: string) => string;
}) {
  return (
    <div>
      <div style={{ fontSize: 10, color: C.sub, fontWeight: 600, marginBottom: 3 }}>{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ appearance: 'none', background: 'var(--vl-card)', border: '1px solid var(--vl-borderStrong)', borderRadius: 4, padding: '6px 10px', fontSize: 12, color: C.ink, minWidth: 120, cursor: 'pointer' }}
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {render ? render(o) : o}
          </option>
        ))}
      </select>
    </div>
  );
}

// ------------------------------------------------------------------ icons
function IconGrid() {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="1.5" width="5" height="5" rx="1" stroke={C.navy} strokeWidth="1.5" />
      <rect x="9.5" y="1.5" width="5" height="5" rx="1" stroke={C.navy} strokeWidth="1.5" />
      <rect x="1.5" y="9.5" width="5" height="5" rx="1" stroke={C.navy} strokeWidth="1.5" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" stroke={C.navy} strokeWidth="1.5" />
    </svg>
  );
}
function IconWrench() {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <path d="M9.5 2.5a3.4 3.4 0 00-3.9 4.5L2.2 10.4a1.3 1.3 0 001.8 1.8l3.4-3.4a3.4 3.4 0 004.5-3.9L9.8 7 8.4 5.6l2.1-2.1-1-.9z" stroke="#0a6cc2" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}
function IconPeople() {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <circle cx="5.6" cy="5.6" r="2.1" stroke="#9c5cc4" strokeWidth="1.4" />
      <path d="M2 12.8c.5-2 1.9-3 3.6-3s3.1 1 3.6 3" stroke="#9c5cc4" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="11.2" cy="6.4" r="1.7" stroke="#9c5cc4" strokeWidth="1.3" />
      <path d="M10 12.8c.4-1.6 1.4-2.4 2.7-2.4.6 0 1.1.2 1.6.5" stroke="#9c5cc4" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function IconHome() {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <path d="M2.5 7.5L8 3l5.5 4.5M4 6.8V13h8V6.8" stroke="#605e5c" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconDone() {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.2" stroke="#1f8a5b" strokeWidth="1.5" />
      <path d="M5.2 8.2l2 2 3.6-4" stroke="#1f8a5b" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconPulse() {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <path d="M1 8h3l2-5 3 10 2-5h3" stroke="#1f8a5b" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconClock() {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.2" stroke={C.redHard} strokeWidth="1.5" />
      <path d="M8 4.5V8l2.5 1.5" stroke={C.redHard} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function IconList() {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <path d="M2 4h12M2 8h12M2 12h8" stroke={C.navy} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function IconBug() {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="9" r="4" stroke={C.orange} strokeWidth="1.5" />
      <path d="M8 5V2.5M5 6.5L3.5 5M11 6.5L12.5 5M4 9H2M14 9h-2" stroke={C.orange} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function IconChat() {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <path d="M2.5 3.5h11v7h-7l-3 2.5z" stroke={C.orange} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
