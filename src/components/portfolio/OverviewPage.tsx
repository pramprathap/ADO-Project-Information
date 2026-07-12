import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as SDK from 'azure-devops-extension-sdk';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
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
  ink: '#252423',
  sub: '#605e5c',
  faint: '#a19f9d',
  line: '#ececf1',
  line2: '#f3f2f1',
  pageBg: '#eef0f4',
};

const RAG_COLOR: Record<string, string> = { on: C.green, risk: C.amber, off: C.red };
const REGION_COLOR: Record<string, string> = {
  NA: '#323F7C',
  EMEA: '#F47C20',
  India: '#2E7D32',
  APAC: '#0a6cc2',
  LATAM: '#9c5cc4',
  Internal: '#8a8886',
};
const EPIC_PALETTE = ['#2E7D32', '#F47C20', '#0a6cc2', '#9c5cc4', '#D64545', '#14b8a6', '#e3b341'];
/** Tag palette keyed by Billing Type display label. */
const TYPE_TAG: Record<string, { bg: string; fg: string }> = {
  'Fixed Price': { bg: '#eef0f8', fg: '#323F7C' },
  'Time and Material': { bg: '#e3edfb', fg: '#0a6cc2' },
  Retainer: { bg: '#f3e9fb', fg: '#9c5cc4' },
  'Internal Project': { bg: '#f3f2f1', fg: '#605e5c' },
  'Non-Billable': { bg: '#fdeede', fg: '#C25E00' },
  Unspecified: { bg: '#f3f2f1', fg: '#8a8886' },
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
  const notified = useRef(false);

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
    const label =
      progress.total > 0
        ? `Loading portfolio… ${progress.done}/${progress.total} projects`
        : 'Loading portfolio…';
    return <LoadingState label={label} />;
  }
  if (status === 'error') {
    return <ErrorState title="Failed to load Overview" message={error ?? 'An error occurred.'} />;
  }

  if (drill && drillServices) {
    return (
      <div style={{ background: C.pageBg, minHeight: '100%' }}>
        {/* breadcrumb / back bar (as in the prototype page header) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', borderBottom: '1px solid #e1dfdd', padding: '10px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontFamily: '"Segoe UI","Open Sans",system-ui,sans-serif' }}>
            <span onClick={() => setDrill(null)} style={{ color: C.sub, cursor: 'pointer' }}>Overview</span>
            <span style={{ color: '#c8c6c4' }}>›</span>
            <span style={{ color: C.navy, fontWeight: 700 }}>Project Health</span>
            <span style={{ color: '#c8c6c4' }}>›</span>
            <span style={{ color: C.orange, fontWeight: 700 }}>{drill.name}</span>
          </div>
          <div onClick={() => setDrill(null)} style={{ cursor: 'pointer', fontSize: 12, color: C.navy, border: '1px solid #c8c6c4', borderRadius: 4, padding: '5px 11px', fontWeight: 600 }}>
            ‹ Back to Overview
          </div>
        </div>
        <ProjectHealthPage key={drill.id} services={drillServices} />
      </div>
    );
  }

  return <OverviewBody projects={projects} onOpenProject={setDrill} />;
}

// ------------------------------------------------------------------ presentational
function OverviewBody({
  projects,
  onOpenProject,
}: {
  projects: PortfolioProject[];
  onOpenProject: (p: PortfolioProject) => void;
}) {
  const [fClient, setFClient] = useState('');
  const [fLead, setFLead] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fType, setFType] = useState('');
  const [fRegion, setFRegion] = useState('');
  const [attnOnly, setAttnOnly] = useState(false);

  const kpi = useMemo(() => {
    const billable = projects.filter((p) => p.billable).length;
    const sum = (f: (p: PortfolioProject) => number): number => projects.reduce((a, p) => a + f(p), 0);
    const tasksTotal = sum((p) => p.summary.tasksTotal);
    const bugsTotal = sum((p) => p.summary.bugsTotal);
    return {
      totalProjects: projects.length,
      billable,
      nonBillable: projects.length - billable,
      active: projects.filter((p) => p.statusRaw === 'InProgress').length,
      overdue: projects.filter((p) => p.isOverdue).length,
      openTask: sum((p) => p.summary.tasksOpen),
      overdueTask: sum((p) => p.summary.tasksOverdue),
      openBug: sum((p) => p.summary.bugsOpen),
      taskBugRatio: bugsTotal > 0 ? `${(tasksTotal / bugsTotal).toFixed(1)} : 1` : '—',
      openItems: sum((p) => p.summary.openItemsCount),
    };
  }, [projects]);

  const regions = useMemo(() => {
    const map = new Map<string, { total: number; on: number; risk: number; off: number; overdue: number }>();
    for (const p of projects) {
      const r = map.get(p.region) ?? { total: 0, on: 0, risk: 0, off: 0, overdue: 0 };
      r.total += 1;
      r[p.rag] += 1;
      if (p.isOverdue) r.overdue += 1;
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
    for (const p of projects) {
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
  }, [projects]);

  const attentionAll = useMemo(
    () =>
      projects
        .filter((p) => p.rag !== 'on')
        .sort(
          (a, b) =>
            (b.rag === 'off' ? 1 : 0) - (a.rag === 'off' ? 1 : 0) ||
            b.overdueDays - a.overdueDays ||
            b.summary.blockers - a.summary.blockers,
        ),
    [projects],
  );
  const attention = attentionAll.slice(0, 6);
  const attnOff = attentionAll.filter((p) => p.rag === 'off').length;

  const rows = useMemo(() => {
    return projects.filter(
      (p) =>
        (!fClient || p.client === fClient) &&
        (!fLead || p.lead === fLead) &&
        (!fStatus || p.statusRaw === fStatus) &&
        (!fType || p.typeRaw === fType) &&
        (!fRegion || p.region === fRegion) &&
        (!attnOnly || p.rag !== 'on'),
    );
  }, [projects, fClient, fLead, fStatus, fType, fRegion, attnOnly]);

  const uniq = (arr: string[]): string[] => [...new Set(arr.filter(Boolean))].sort();
  const hasFilters = !!(fClient || fLead || fStatus || fType || fRegion || attnOnly);
  const clearFilters = (): void => {
    setFClient('');
    setFLead('');
    setFStatus('');
    setFType('');
    setFRegion('');
    setAttnOnly(false);
  };

  return (
    <div
      style={{
        background: C.pageBg,
        color: C.ink,
        fontFamily: '"Segoe UI","Open Sans",system-ui,sans-serif',
        padding: '16px clamp(12px,2vw,28px) 40px',
        minHeight: '100%',
      }}
    >
      {/* intro */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ font: '800 22px "Open Sans",sans-serif' }}>Portfolio Overview</div>
          <div style={{ fontSize: 12, color: '#8a8886', marginTop: 2 }}>
            Delivery health across {kpi.totalProjects} projects · what needs attention this week
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,minmax(0,1fr))', gap: 11, marginBottom: 14 }}>
        <Kpi icon={<IconGrid />} iconBg="#eef0f8" label="Total Projects" value={kpi.totalProjects} sub={`${kpi.billable} billable · ${kpi.nonBillable} internal`} />
        <Kpi icon={<IconPulse />} iconBg="#e7f3ec" label="Active" value={kpi.active} sub="currently in delivery" />
        <Kpi
          icon={<IconClock />}
          iconBg="#fde0db"
          label="Overdue Projects"
          labelColor={C.redHard}
          value={kpi.overdue}
          valueColor="#B3261E"
          sub="past planned due date"
          subColor={C.redHard}
          topBar={C.red}
          onClick={() => setAttnOnly(true)}
        />
        <Kpi icon={<IconList />} iconBg="#eef0f8" label="Open Tasks" value={kpi.openTask} sub={<><b>{kpi.overdueTask}</b> overdue</>} subColor={C.redHard} />
        <Kpi icon={<IconBug />} iconBg="#fdeede" label="Open Bugs" value={kpi.openBug} sub={`Task : Bug = ${kpi.taskBugRatio}`} />
        <Kpi icon={<IconChat />} iconBg="#fdeede" label="Open Items" value={kpi.openItems} sub="clarifications & blockers" />
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
          <div style={{ fontSize: 11, color: '#797775', marginBottom: 10 }}>
            Showing top {attention.length} · {attnOff} off-track — these need a decision or escalation this week.
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
                style={{ display: 'flex', alignItems: 'stretch', marginBottom: 7, border: '1px solid #eee', borderRadius: 7, overflow: 'hidden', cursor: 'pointer', background: i === 0 ? '#fff7f0' : '#fff' }}
              >
                <div style={{ width: 4, background: RAG_COLOR[a.rag], flexShrink: 0 }} />
                <div
                  style={{
                    width: 30,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: i === 0 ? C.redHard : a.rag === 'off' ? '#fde0db' : '#f3f2f1',
                    color: i === 0 ? '#fff' : a.rag === 'off' ? C.redHard : C.sub,
                    font: '800 13px "Open Sans",sans-serif',
                  }}
                >
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0, padding: '8px 11px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#323130', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</span>
                    <span style={{ fontSize: 10, color: C.sub, flexShrink: 0 }}>{a.progress}% complete</span>
                  </div>
                  <div style={{ fontSize: 10, color: '#797775', margin: '2px 0 6px' }}>{a.lead} · {a.region}</div>
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
                  <span style={{ flex: 1, fontSize: 11, color: '#323130', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.region}</span>
                  <span style={{ fontSize: 11, fontWeight: 700 }}>{r.total}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#797775', marginBottom: 8, fontWeight: 600 }}>
            Health by region <span style={{ fontWeight: 400 }}> · <span style={{ color: C.greenSoft }}>■</span> On track <span style={{ color: C.amber }}>■</span> At risk <span style={{ color: C.red }}>■</span> Off track</span>
          </div>
          {regions.map((r) => (
            <div key={r.region} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '8px 0', borderBottom: `1px solid ${C.line2}` }}>
              <div style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 7, background: '#f7f8fc', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '800 15px "Open Sans",sans-serif', color: C.navy }}>{r.total}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#323130' }}>{r.region}</span>
                  {r.overdue > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: C.red, borderRadius: 9, padding: '1px 8px' }}>{r.overdue} overdue</span>}
                </div>
                <StackBar segs={[{ w: pct(r.on, r.total), c: C.green }, { w: pct(r.risk, r.total), c: C.amber }, { w: pct(r.off, r.total), c: C.red }]} h={12} />
              </div>
            </div>
          ))}
        </Card>
      </div>

      {/* lead performance */}
      <Card pad="12px 14px" style={{ marginBottom: 12 }}>
        <div style={{ font: '600 13px "Open Sans",sans-serif', marginBottom: 4 }}>
          Lead delivery performance <span style={{ color: C.faint, fontWeight: 400 }}>· who needs help — sorted by off-track & overdue load · click a lead to filter</span>
        </div>
        <div style={{ fontSize: 11, color: '#797775', marginBottom: 12 }}>
          Portfolio mix per lead: <span style={{ color: C.green, fontWeight: 700 }}>■</span> on track <span style={{ color: C.amber, fontWeight: 700 }}>■</span> at risk <span style={{ color: C.red, fontWeight: 700 }}>■</span> off track
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 720 }}>
            <thead>
              <tr style={{ background: '#faf9f8', color: C.sub, textAlign: 'left', borderBottom: '2px solid #e1dfdd' }}>
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
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#323130' }}>{lp.lead}</span>
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
      <Card style={{ overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', padding: '11px 14px', borderBottom: `1px solid ${C.line2}` }}>
          <div style={{ font: '600 13px "Open Sans",sans-serif', alignSelf: 'center' }}>
            Projects <span style={{ color: C.faint, fontWeight: 400 }}>· {rows.length} shown · click a row to drill in</span>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
            <Filter label="Client Name" value={fClient} onChange={setFClient} options={uniq(projects.map((p) => p.client))} />
            <Filter label="Project Lead" value={fLead} onChange={setFLead} options={uniq(projects.map((p) => p.lead))} />
            <Filter label="Status" value={fStatus} onChange={setFStatus} options={uniq(projects.map((p) => p.statusRaw))} render={(v) => labelStatus(v)} />
            <Filter label="Type" value={fType} onChange={setFType} options={uniq(projects.map((p) => p.typeRaw))} render={labelBilling} />
            <Filter label="Region" value={fRegion} onChange={setFRegion} options={uniq(projects.map((p) => p.region))} />
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              <div style={{ fontSize: 10, marginBottom: 3 }}>&nbsp;</div>
              <div onClick={() => setAttnOnly((v) => !v)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${attnOnly ? C.orange : '#c8c6c4'}`, background: attnOnly ? '#fdeede' : '#fff', color: attnOnly ? C.amberText : C.sub, borderRadius: 4, padding: '6px 12px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>⚠ Needs attention only</div>
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
                <Th light>Planned Due</Th>
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
                      <span style={{ fontWeight: 600, color: r.isOverdue ? '#B3261E' : '#323130' }}>{r.name}</span>
                    </span>
                    {r.isOverdue && <span style={{ fontSize: 10, color: '#B3261E', marginLeft: 16 }}>{r.overdueDays}d overdue</span>}
                  </Td>
                  <Td>
                    <EpicsCell epics={r.summary.epics} />
                  </Td>
                  <Td color="#323130">{r.lead}</Td>
                  <Td>
                    <span style={{ fontSize: 10, fontWeight: 600, color: (TYPE_TAG[r.type] ?? TYPE_TAG.Unspecified).fg, background: (TYPE_TAG[r.type] ?? TYPE_TAG.Unspecified).bg, borderRadius: 3, padding: '2px 7px' }}>{r.type}</span>
                  </Td>
                  <Td>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ flex: 1, height: 7, background: '#edebe9', borderRadius: 2, overflow: 'hidden', minWidth: 60 }}>
                        <span style={{ display: 'block', width: `${r.progress}%`, height: '100%', background: RAG_COLOR[r.rag] }} />
                      </span>
                      <span style={{ width: 30, color: C.sub, fontSize: 11 }}>{r.progress}%</span>
                    </span>
                  </Td>
                  <Td color={r.isOverdue ? '#B3261E' : '#323130'} bold={r.isOverdue}>{fmtDate(r.plannedDue)}</Td>
                  <Td right color="#323130">{r.summary.tasksTotal}</Td>
                  <Td right color="#323130">{r.summary.bugsTotal}</Td>
                  <Td right color="#323130">{r.summary.openWork}</Td>
                  <Td right><span style={{ fontWeight: 700, color: r.summary.overdue ? C.redHard : C.sub }}>{r.summary.overdue}</span></Td>
                  <Td right color={C.greenSoft} bold>{r.summary.closedCount}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
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
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, boxShadow: '0 1px 2px rgba(16,24,64,.05)', padding: pad, ...style }}>
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
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff',
        border: `1px solid ${C.line}`,
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
      <div style={{ fontSize: 11, color: subColor ?? '#8a8886', marginTop: 6 }}>{sub}</div>
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
      {done.length > 0 && ongoing.length > 0 && <span style={{ color: '#d9d7d4' }}>·</span>}
      {ongoing.length > 0 && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'flex', gap: 3 }}>
            {ongoing.slice(0, 5).map((e, i) => (
              <span key={e.id} title={`${e.name} — ongoing`} style={{ width: 9, height: 9, borderRadius: '50%', background: EPIC_PALETTE[(i + 1) % EPIC_PALETTE.length] }} />
            ))}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.navy }}>{ongoing.length} ongoing</span>
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
      <circle cx={60} cy={60} r={r} fill="none" stroke="#f0eff5" strokeWidth={18} />
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
        style={{ appearance: 'none', background: '#fff', border: '1px solid #c8c6c4', borderRadius: 4, padding: '6px 10px', fontSize: 12, color: C.ink, minWidth: 120, cursor: 'pointer' }}
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
