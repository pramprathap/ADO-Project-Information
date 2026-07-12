import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import * as SDK from 'azure-devops-extension-sdk';
import { ErrorState } from '@/components/ErrorState';
import { listActiveProjects, resolveOrgContext, type OrgContext, type ProjectRef } from '@/services/orgServices';
import {
  HOURS_PER_DAY,
  loadResourceData,
  monthPeriod,
  weekOptions,
  weekPeriod,
  type Period,
  type PeriodMode,
  type ResourceData,
  type ResourcePerson,
} from '@/services/resourceService';
import { MOCK_RESOURCE_DATA } from '@/services/mockResource';
import { GraphLeaveProvider, GraphTimesheetProvider } from '@/services/sharePointProviders';
import { getGraphTokenInteractive, isSharePointConfigured } from '@/services/graphClient';
import { ProgressLoader } from './ProgressLoader';
import { MultiSelect } from './MultiSelect';
import { useVlDark, vlCanvasClass } from './vlTheme';
import { ProjectHealthPage } from '@/components/health/ProjectHealthPage';
import { buildProjectServices } from '@/services/orgServices';
import { createMockAppServices } from '@/services/mockServices';
import type { AppServices } from '@/services/appServices';
import type { AllocItem } from '@/services/resourceService';

const C = {
  navy: '#323F7C',
  orange: '#F47C20',
  green: '#2E7D32',
  greenSoft: '#1f8a5b',
  red: '#D64545',
  amber: '#ED9B00',
  amberText: '#C25E00',
  indigoMid: '#7d8ad6',
  ink: 'var(--vl-ink)',
  sub: 'var(--vl-sub)',
  faint: 'var(--vl-faint)',
  line: 'var(--vl-line)',
  line2: 'var(--vl-line2)',
  pageBg: 'var(--vl-page)',
};

/** Project palette used by the per-day split bars (matches the prototype). */
const PROJ_PALETTE = ['#323F7C', '#F47C20', '#2E7D32', '#7d8ad6', '#ED9B00', '#9c5cc4', '#0a8fc2', '#CC293D', '#5a8f3c', '#b0639b', '#c98a00', '#3f6fb0', '#7a7a7a', '#1f9e8f'];
/** Member palette for project-wise allocation bars (prototype `mc`). */
const MEMBER_PALETTE = ['#323F7C', '#F47C20', '#2E7D32', '#7d8ad6', '#ED9B00', '#9c5cc4'];

/** Utilization band colour (prototype: >100 red, ≥90 orange, ≥60 indigo, else green). */
function bandColor(v: number): string {
  return v > 100 ? C.red : v >= 90 ? C.orange : v >= 60 ? C.indigoMid : C.green;
}
/** Roll-up navy scale (prototype `colf`). */
function navyScale(v: number): string {
  return v >= 28 ? '#323F7C' : v >= 16 ? '#5566b0' : v >= 7 ? '#9aa6d8' : '#d7dcf0';
}

// ------------------------------------------------------------------ page
type Status = 'loading' | 'ready' | 'error';

export function ResourceAllocationPage() {
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [org, setOrg] = useState<OrgContext | null>(null);
  const [projects, setProjects] = useState<ProjectRef[]>([]);
  const [mode, setMode] = useState<PeriodMode>('current');
  const [weekIdx, setWeekIdx] = useState(1); // index into weekOptions() (1 = current)
  const now = new Date();
  const [monthIdx, setMonthIdx] = useState(now.getMonth());
  const [yearSel, setYearSel] = useState(now.getFullYear());
  const [data, setData] = useState<ResourceData | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [spNeedsAuth, setSpNeedsAuth] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [drill, setDrill] = useState<ProjectRef | null>(null);
  const notified = useRef(false);
  const loginHintRef = useRef<string | undefined>(undefined);

  const period: Period = useMemo(() => {
    if (mode === 'month') return monthPeriod(yearSel, monthIdx);
    if (mode === 'week') return weekPeriod(weekOptions()[weekIdx]?.offset ?? 0, 'week');
    return weekPeriod(0, 'current');
  }, [mode, weekIdx, monthIdx, yearSel]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (import.meta.env.DEV) return;
        await SDK.init({ loaded: false, applyTheme: true });
        await SDK.ready();
        loginHintRef.current = SDK.getUser()?.name;
        const resolved = await resolveOrgContext();
        const list = await listActiveProjects(resolved, (done, total) => {
          if (!cancelled) setProgress({ done, total });
        });
        if (!cancelled) {
          setOrg(resolved);
          setProjects(list);
        }
      } catch (err) {
        console.error('Resource allocation initialization failed.', err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to initialize.');
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
    let cancelled = false;
    void (async () => {
      try {
        setStatus('loading');
        if (import.meta.env.DEV) {
          if (!cancelled) {
            setData(MOCK_RESOURCE_DATA(period));
            setStatus('ready');
          }
          return;
        }
        if (!org || projects.length === 0) return;
        setProgress({ done: 0, total: projects.length });
        const leave = new GraphLeaveProvider(loginHintRef.current);
        const timesheet = new GraphTimesheetProvider(loginHintRef.current);
        const result = await loadResourceData(org, projects, period, leave, timesheet, (d, t) => {
          if (!cancelled) setProgress({ done: d, total: t });
        });
        if (!cancelled) {
          setData(result);
          setSpNeedsAuth(
            leave.status === 'auth-required' || timesheet.status === 'auth-required',
          );
          setStatus('ready');
        }
      } catch (err) {
        console.error('Resource allocation load failed.', err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load resource data.');
          setStatus('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [org, projects, period, reloadTick]);

  useEffect(() => {
    if (!notified.current && (status === 'ready' || status === 'error')) {
      notified.current = true;
      if (!import.meta.env.DEV) void SDK.notifyLoadSucceeded();
    }
  }, [status]);

  if (status === 'error') {
    return <ErrorState title="Failed to load Resource Allocation" message={error ?? 'An error occurred.'} />;
  }
  if (status === 'loading' || !data) {
    return <ProgressLoader done={progress.done} total={progress.total} label="Loading Resource Allocation" />;
  }
  const connectSharePoint = async (): Promise<void> => {
    const token = await getGraphTokenInteractive(loginHintRef.current);
    if (token) {
      setSpNeedsAuth(false);
      setReloadTick((n) => n + 1);
    }
  };

  // Drill into a project's full health report (from a split-bar segment click).
  const openProject = (name: string): void => {
    if (import.meta.env.DEV) {
      setDrill({ id: 'preview', name });
      return;
    }
    const p = projects.find((x) => x.name === name);
    if (p) setDrill(p);
  };

  if (drill) {
    const services: AppServices = import.meta.env.DEV
      ? createMockAppServices()
      : buildProjectServices(org!, drill);
    return (
      <div className={vlCanvasClass(document.documentElement.getAttribute('data-appearance') === 'dark')} style={{ minHeight: '100vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--vl-card)', borderBottom: '1px solid var(--vl-line)', padding: '10px 18px', fontFamily: '"Segoe UI","Open Sans",system-ui,sans-serif' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span onClick={() => setDrill(null)} style={{ color: C.sub, cursor: 'pointer' }}>Resource Allocation</span>
            <span style={{ color: 'var(--vl-borderStrong)' }}>›</span>
            <span style={{ color: 'var(--vl-brandText)', fontWeight: 700 }}>Project Health</span>
            <span style={{ color: 'var(--vl-borderStrong)' }}>›</span>
            <span style={{ color: C.orange, fontWeight: 700 }}>{drill.name}</span>
          </div>
          <div onClick={() => setDrill(null)} style={{ cursor: 'pointer', fontSize: 12, color: 'var(--vl-brandText)', border: '1px solid var(--vl-borderStrong)', borderRadius: 4, padding: '5px 11px', fontWeight: 600 }}>
            ‹ Back to Resource Allocation
          </div>
        </div>
        <ProjectHealthPage key={drill.name} services={services} />
      </div>
    );
  }

  return (
    <ResourceBody
      data={data}
      mode={mode}
      onMode={setMode}
      weekIdx={weekIdx}
      onWeekIdx={setWeekIdx}
      monthIdx={monthIdx}
      onMonthIdx={setMonthIdx}
      yearSel={yearSel}
      onYearSel={setYearSel}
      spNeedsAuth={spNeedsAuth}
      onConnectSharePoint={() => void connectSharePoint()}
      onOpenProject={openProject}
    />
  );
}

// ------------------------------------------------------------------ body
function ResourceBody({
  data,
  mode,
  onMode,
  weekIdx,
  onWeekIdx,
  monthIdx,
  onMonthIdx,
  yearSel,
  onYearSel,
  spNeedsAuth,
  onConnectSharePoint,
  onOpenProject,
}: {
  data: ResourceData;
  mode: PeriodMode;
  onMode: (m: PeriodMode) => void;
  weekIdx: number;
  onWeekIdx: (i: number) => void;
  monthIdx: number;
  onMonthIdx: (i: number) => void;
  yearSel: number;
  onYearSel: (y: number) => void;
  spNeedsAuth: boolean;
  onConnectSharePoint: () => void;
  onOpenProject: (name: string) => void;
}) {
  const dark = useVlDark();
  const [resSel, setResSel] = useState<string[]>([]);
  const [dayIdx, setDayIdx] = useState(0);
  const [breakdown, setBreakdown] = useState<{ person: string; colIdx: number | null } | null>(null);

  const period = data.period;
  const isCurrent = mode === 'current';
  const capLabel = mode === 'month' ? 'per month' : isCurrent ? 'this week · day-wise' : 'selected week · day-wise';
  const colNoun = mode === 'month' ? 'month' : 'day';
  const subNoun = mode === 'month' ? 'week' : 'day';

  const allNames = useMemo(() => data.people.map((p) => p.name), [data]);
  const people = useMemo(
    () => (resSel.length ? data.people.filter((p) => resSel.includes(p.name)) : data.people),
    [data, resSel],
  );
  const under = useMemo(() => people.filter((p) => p.utilPct < 60).sort((a, b) => a.utilPct - b.utilPct), [people]);
  const totalCapacity = people.reduce((a, p) => a + p.capacityHrs - p.leaveHrs, 0);
  const totalAllocated = Math.round(people.reduce((a, p) => a + p.allocatedHrs, 0) * 10) / 10;
  const utilPct = totalCapacity > 0 ? Math.round((totalAllocated / totalCapacity) * 100) : 0;

  const projColor = useMemo(() => {
    const m = new Map<string, string>();
    data.projects.forEach((p, i) => m.set(p.name, PROJ_PALETTE[i % PROJ_PALETTE.length]));
    return m;
  }, [data]);

  /** Column utilization % for one person (per heatmap column). */
  const colPct = (p: ResourcePerson, idx: number[]): number => {
    const hrs = idx.reduce((a, i) => a + (p.byDay[i] ?? 0), 0);
    const cap = ((p.capacityHrs - p.leaveHrs) / period.days.length) * idx.length;
    return cap > 0 ? Math.round((hrs / cap) * 100) : 0;
  };

  const subCols = period.cols;
  const safeDayIdx = Math.min(dayIdx, subCols.length - 1);

  return (
    <div className={vlCanvasClass(dark)} style={{ background: C.pageBg, color: C.ink, fontFamily: '"Segoe UI","Open Sans",system-ui,sans-serif', padding: '14px clamp(12px,2vw,28px) 40px', minHeight: '100vh' }}>
      {/* ---- header: title + period pills + selects + multi-select ---- */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ font: '700 16px "Open Sans",sans-serif', color: 'var(--vl-brandText)' }}>
          Resource Allocation <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--vl-sub)' }}>· leave-adjusted capacity · {capLabel}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', border: '1px solid var(--vl-borderStrong)', borderRadius: 6, overflow: 'hidden' }}>
            {(
              [
                ['current', 'Current week'],
                ['week', 'By week'],
                ['month', 'By month'],
              ] as [PeriodMode, string][]
            ).map(([key, label]) => (
              <div
                key={key}
                onClick={() => onMode(key)}
                style={{ padding: '7px 18px', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: mode === key ? C.orange : 'var(--vl-card)', color: mode === key ? '#fff' : C.sub, borderRight: '1px solid var(--vl-line)' }}
              >
                {label}
              </div>
            ))}
          </div>
          {mode === 'week' && (
            <select className="vl-sel" style={selStyle(180)} value={String(weekIdx)} onChange={(e) => onWeekIdx(Number(e.target.value))}>
              {weekOptions().map((o, i) => (
                <option key={o.label} value={i}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
          {mode === 'month' && (
            <>
              <select style={selStyle(110)} value={String(monthIdx)} onChange={(e) => onMonthIdx(Number(e.target.value))}>
                {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, i) => (
                  <option key={m} value={i}>
                    {m}
                  </option>
                ))}
              </select>
              <select style={selStyle(84)} value={String(yearSel)} onChange={(e) => onYearSel(Number(e.target.value))}>
                {[yearSel + 1, yearSel, yearSel - 1, yearSel - 2].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </>
          )}
          <MultiSelect options={allNames} selected={resSel} onChange={setResSel} allLabel="All resources" />
        </div>
      </div>

      {/* ---- SharePoint connection banner ---- */}
      {spNeedsAuth && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'var(--vl-navySoft)', border: `1px solid ${C.navy}`, borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--vl-brandText)' }}>
            <b>Connect SharePoint</b> to load Leave (LMS) and Timesheet data — one-time sign-in with your work account.
          </span>
          <div onClick={onConnectSharePoint} style={{ cursor: 'pointer', background: C.navy, color: '#fff', fontSize: 12, fontWeight: 700, borderRadius: 5, padding: '7px 16px' }}>
            Connect SharePoint
          </div>
          <span style={{ fontSize: 10, color: C.faint }}>SPA redirect origin for the app registration: {window.location.origin}</span>
        </div>
      )}
      {!isSharePointConfigured() && (
        <div style={{ fontSize: 11, color: C.amberText, background: '#fdeede', borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>
          Leave &amp; Timesheet integration is ready but needs the one-time Entra app registration (client ID in <code>sharepointConfig.ts</code>) — see the setup steps in that file. Until then those columns stay empty.
        </div>
      )}

      {/* ---- KPI cards ---- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 12 }}>
        <KpiCard top={C.navy} label={`Team capacity · ${capLabel}`} value={<>{totalCapacity}<Unit>h</Unit></>} sub={data.leaveConnected ? 'leave-adjusted' : 'leave-adjusted · LMS pending'} />
        <KpiCard top={C.orange} label="Allocated" value={<>{totalAllocated}<Unit>h</Unit></>} sub={`${utilPct}% utilization`} />
        <KpiCard top={C.green} label="Plan-able bandwidth" value={<span style={{ color: C.green }}>{under.length}</span>} sub="under-allocated people" />
        <KpiCard top={C.red} label="Over-allocated" value={<span style={{ color: C.red }}>{people.filter((p) => p.utilPct > 100).length}</span>} sub="people > 100%" />
      </div>

      {/* ---- under-allocated (current week only) ---- */}
      {isCurrent && (
        <div style={{ background: 'var(--vl-card)', border: '1px solid var(--vl-goodBorder)', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ font: '600 13px "Open Sans",sans-serif', color: C.greenSoft }}>
              Under-allocated resources — this week <span style={{ color: C.faint, fontWeight: 400 }}>· &lt;60% of capacity · available to take work</span>
            </span>
            <span style={{ fontSize: 11, color: C.sub }}>
              <b style={{ color: C.greenSoft }}>{under.length}</b> people
            </span>
          </div>
          {under.length === 0 ? (
            <div style={{ padding: 14, textAlign: 'center', color: C.sub, fontSize: 12, background: 'var(--vl-soft)', borderRadius: 6 }}>No one is under 60% this week.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10 }}>
              {under.map((u) => (
                <div key={u.name} style={{ border: '1px solid var(--vl-line)', borderRadius: 7, padding: '10px 12px', background: 'var(--vl-goodSoft)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--vl-ink2)' }}>{u.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: C.greenSoft }}>{u.utilPct}%</span>
                  </div>
                  <div style={{ fontSize: 10, color: C.faint, marginBottom: 7 }}>{u.role}</div>
                  <div style={{ height: 7, background: '#e7f3ec', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, u.utilPct)}%`, height: '100%', background: C.green }} />
                  </div>
                  <div style={{ fontSize: 10, color: C.sub, marginTop: 6 }}>
                    <b style={{ color: C.greenSoft }}>{Math.max(0, Math.round(((u.capacityHrs - u.leaveHrs) * (100 - u.utilPct)) / 100))}h</b> free capacity this week
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---- heatmap: resource × column ---- */}
      <Card pad="12px 14px" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
          <span style={{ font: '600 13px "Open Sans",sans-serif' }}>Allocation vs capacity — resource × {colNoun}</span>
          <span style={{ fontSize: 10, color: 'var(--vl-sub)' }}>
            % of leave-adjusted capacity · <span style={{ color: C.green }}>■</span>&lt;60 <span style={{ color: C.indigoMid }}>■</span>60–90 <span style={{ color: C.orange }}>■</span>90–100 <span style={{ color: C.red }}>■</span>&gt;100
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `140px repeat(${period.cols.length},1fr)`, gap: 3, alignItems: 'center' }}>
          <div />
          {period.cols.map((c) => (
            <div key={c.label} style={{ fontSize: 10, color: C.sub, textAlign: 'center', fontWeight: 600 }}>
              {c.label}
            </div>
          ))}
          {people.flatMap((p) => [
            <div key={`n${p.name}`} style={{ fontSize: 11, color: 'var(--vl-ink2)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {p.name}
            </div>,
            ...period.cols.map((c, ci) => {
              const v = colPct(p, c.idx);
              return (
                <div
                  key={`${p.name}-${ci}`}
                  title={`${p.name} ${c.label}: ${v}% — click for the work items behind this`}
                  onClick={() => setBreakdown({ person: p.name, colIdx: ci })}
                  style={{ height: 28, borderRadius: 3, background: bandColor(v), opacity: 0.45 + v / 200, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                >
                  {v}%
                </div>
              );
            }),
          ])}
        </div>
      </Card>

      {/* ---- resource allocation by project — per day ---- */}
      <Card pad="12px 14px" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
          <span style={{ font: '600 13px "Open Sans",sans-serif' }}>Resource allocation by project — per {subNoun}</span>
          <span style={{ fontSize: 10, color: 'var(--vl-sub)' }}>pick a {subNoun} · each bar = a person, split by project · hover for exact %</span>
        </div>
        <div style={{ display: 'flex', marginBottom: 14, border: '1px solid var(--vl-borderStrong)', borderRadius: 6, overflow: 'hidden', width: 'fit-content', maxWidth: '100%', flexWrap: 'wrap' }}>
          {subCols.map((c, i) => (
            <div
              key={c.label}
              onClick={() => setDayIdx(i)}
              style={{ padding: '6px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: i === safeDayIdx ? C.orange : 'var(--vl-card)', color: i === safeDayIdx ? '#fff' : C.sub, borderRight: '1px solid var(--vl-line)', whiteSpace: 'nowrap' }}
            >
              {c.label}
            </div>
          ))}
        </div>
        <div>
          {people.map((p, ri) => {
            const idx = subCols[safeDayIdx].idx;
            const segsAll = p.byProject
              .map((bp) => ({ name: bp.project, hrs: Math.round(idx.reduce((a, i) => a + (bp.day[i] ?? 0), 0) * 10) / 10 }))
              .filter((s) => s.hrs > 0);
            const segTotal = segsAll.reduce((a, s) => a + s.hrs, 0);
            const v = colPct(p, idx);
            return (
              <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: ri < people.length - 1 ? `1px solid ${C.line2}` : 'none' }}>
                <div style={{ width: 132, flexShrink: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--vl-ink2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: C.faint }}>{p.role}</div>
                </div>
                <div style={{ flex: 1, display: 'flex', height: 22, borderRadius: 3, overflow: 'hidden', background: C.line2 }}>
                  {segsAll.map((s) => {
                    const pct = segTotal > 0 ? Math.round((s.hrs / segTotal) * 100) : 0;
                    const short = s.name.length > 16 ? `${s.name.slice(0, 15)}…` : s.name;
                    return (
                      <div
                        key={s.name}
                        title={`${s.name}: ${s.hrs}h (${pct}% of this ${subNoun}) — click to open the project's health`}
                        onClick={() => onOpenProject(s.name)}
                        style={{ width: `${pct}%`, background: projColor.get(s.name), display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: 'pointer' }}
                      >
                        {pct >= 15 && <span style={{ fontSize: 9, color: '#fff', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '0 4px' }}>{short} {pct}%</span>}
                      </div>
                    );
                  })}
                </div>
                <div
                  style={{ width: 52, flexShrink: 0, textAlign: 'right', cursor: 'pointer' }}
                  title="Click to see the work items behind this load"
                  onClick={() => setBreakdown({ person: p.name, colIdx: safeDayIdx })}
                >
                  <div style={{ fontSize: 13, fontWeight: 800, color: bandColor(v) }}>{v}%</div>
                  <div style={{ fontSize: 9, color: C.faint }}>load</div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ---- allocation breakdown: the work items behind a load % ---- */}
      {breakdown &&
        (() => {
          const person = people.find((p) => p.name === breakdown.person);
          if (!person) return null;
          const col = breakdown.colIdx !== null ? period.cols[breakdown.colIdx] : null;
          const label = col ? col.label : `whole ${mode === 'month' ? 'month' : 'week'}`;
          const hrsOf = (it: AllocItem): number =>
            col ? Math.round(col.idx.reduce((a, i) => a + (it.day[i] ?? 0), 0) * 10) / 10 : it.hrs;
          const rows = person.items.filter((it) => hrsOf(it) > 0).sort((a, b) => hrsOf(b) - hrsOf(a));
          const total = Math.round(rows.reduce((a, it) => a + hrsOf(it), 0) * 10) / 10;
          const cap = col
            ? Math.round((((person.capacityHrs - person.leaveHrs) / period.days.length) * col.idx.length) * 10) / 10
            : person.capacityHrs - person.leaveHrs;
          const pct = cap > 0 ? Math.round((total / cap) * 100) : 0;
          const fmt = (d?: string): string => d ?? '—';
          return (
            <div style={{ background: 'var(--vl-card)', border: `1px solid ${C.navy}`, borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{ background: 'var(--vl-navySoft)', padding: '11px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: 13 }}>
                  <b style={{ color: 'var(--vl-brandText)', font: '700 14px "Open Sans",sans-serif' }}>{person.name}</b>
                  <span style={{ color: C.sub, fontSize: 11 }}> · {label} · </span>
                  <b style={{ color: bandColor(pct) }}>{total}h</b>
                  <span style={{ color: C.sub, fontSize: 11 }}> allocated of {cap}h capacity = </span>
                  <b style={{ color: bandColor(pct) }}>{pct}%</b>
                </div>
                <div onClick={() => setBreakdown(null)} style={{ cursor: 'pointer', fontSize: 11, color: C.sub, border: '1px solid var(--vl-borderStrong)', background: 'var(--vl-card)', borderRadius: 4, padding: '4px 10px' }}>
                  ✕ Close
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 860 }}>
                  <thead>
                    <tr style={{ background: 'var(--vl-soft)', color: C.sub, textAlign: 'left' }}>
                      <th style={{ ...th, padding: '7px 8px' }}>ID</th>
                      <th style={{ ...th, padding: '7px 8px' }}>Type</th>
                      <th style={th}>Title</th>
                      <th style={{ ...th, padding: '7px 8px' }}>Project</th>
                      <th style={{ ...th, padding: '7px 8px' }}>State</th>
                      <th style={{ ...th, padding: '7px 8px' }}>Start</th>
                      <th style={{ ...th, padding: '7px 8px' }}>Due</th>
                      <th style={{ ...th, padding: '7px 8px', textAlign: 'right' }}>Hrs · {col ? 'this ' + subNoun : 'period'}</th>
                      <th style={{ ...th, textAlign: 'right' }}>Hrs · period</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((it) => (
                      <tr key={it.id} style={{ borderBottom: `1px solid ${C.line2}` }}>
                        <td style={{ ...td, padding: '7px 8px', color: C.sub }}>{it.id}</td>
                        <td style={{ ...td, padding: '7px 8px' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: it.type === 'Bug' ? '#CC293D' : it.type === 'User Story' ? '#0a8fc2' : '#C9A227' }}>{it.type}</span>
                        </td>
                        <td style={{ ...td, fontWeight: 600, color: 'var(--vl-ink2)', maxWidth: 340, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.title}</td>
                        <td style={{ ...td, padding: '7px 8px', color: C.sub, whiteSpace: 'nowrap' }}>
                          <span onClick={() => onOpenProject(it.project)} style={{ cursor: 'pointer', color: 'var(--vl-brandText)', fontWeight: 600 }}>{it.project}</span>
                        </td>
                        <td style={{ ...td, padding: '7px 8px', color: C.sub }}>{it.state}</td>
                        <td style={{ ...td, padding: '7px 8px', color: it.startDate ? C.sub : '#B3261E' }}>{fmt(it.startDate)}</td>
                        <td style={{ ...td, padding: '7px 8px', color: it.dueDate ? C.sub : '#B3261E' }}>{fmt(it.dueDate)}</td>
                        <td style={{ ...td, padding: '7px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--vl-brandText)' }}>{hrsOf(it)}h</td>
                        <td style={{ ...td, textAlign: 'right', color: C.sub }}>{it.hrs}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '9px 14px', fontSize: 11, color: 'var(--vl-sub)', borderTop: `1px solid ${C.line2}` }}>
                Allocation = Remaining Work (or Original Estimate − Completed) of open assigned items, spread across the days of their Start→Due window.{' '}
                <b style={{ color: '#B3261E' }}>Items with no dates</b> are treated as current workload across the whole period — set Start/Due dates in Boards to spread them correctly.
              </div>
            </div>
          );
        })()}

      {/* ---- project roll-up — % of team capacity per day (current only) ---- */}
      {isCurrent && (
        <Card pad="12px 14px" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ font: '600 13px "Open Sans",sans-serif' }}>Project roll-up — % of team capacity per day</span>
            <span style={{ fontSize: 10, color: 'var(--vl-sub)' }}>darker = heavier load</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '180px repeat(5,1fr) 56px', gap: 3, alignItems: 'center' }}>
            <div />
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d) => (
              <div key={d} style={{ fontSize: 10, color: C.sub, textAlign: 'center', fontWeight: 600 }}>
                {d}
              </div>
            ))}
            <div style={{ fontSize: 10, color: C.sub, textAlign: 'center', fontWeight: 600 }}>Avg</div>
            {data.projects.slice(0, 6).flatMap((p) => {
              const teamDayCap = Math.max(1, people.length * HOURS_PER_DAY);
              const dvals = period.days.map((_, di) => Math.round(((p.byDay[di] ?? 0) / teamDayCap) * 100));
              const avg = Math.round(dvals.reduce((a, b) => a + b, 0) / Math.max(1, dvals.length));
              return [
                <div key={`n${p.name}`} style={{ fontSize: 11, color: 'var(--vl-ink2)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.name}
                </div>,
                ...dvals.slice(0, 5).map((v, ci) => (
                  <div key={`${p.name}-${ci}`} title={`${p.name} · ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][ci]}: ${v}% of capacity`} style={{ height: 26, borderRadius: 3, background: navyScale(v), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: v >= 7 ? '#fff' : '#8a8886', fontWeight: 700 }}>
                    {v}%
                  </div>
                )),
                <div key={`a${p.name}`} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--vl-brandText)' }}>
                  {avg}%
                </div>,
              ];
            })}
          </div>
        </Card>
      )}

      {/* ---- this week — allocation vs available capacity ---- */}
      <Card style={{ overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ padding: '11px 14px 9px', font: '600 13px "Open Sans",sans-serif' }}>This week — allocation vs available capacity</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 720 }}>
            <thead>
              <tr style={{ background: 'var(--vl-soft)', color: C.sub, textAlign: 'left' }}>
                <th style={th}>Resource</th>
                <th style={{ ...th, padding: '7px 8px' }}>Role</th>
                <th style={{ ...th, padding: '7px 8px', textAlign: 'right' }}>Capacity</th>
                <th style={{ ...th, padding: '7px 8px', textAlign: 'right' }}>Leave</th>
                <th style={{ ...th, padding: '7px 8px', textAlign: 'right' }}>Allocated</th>
                <th style={{ ...th, padding: '7px 8px', width: 200 }}>Utilization</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.name} style={{ borderBottom: `1px solid ${C.line2}` }}>
                  <td style={{ ...td, fontWeight: 600, color: 'var(--vl-ink2)' }}>{p.name}</td>
                  <td style={{ ...td, padding: '8px 8px', color: C.sub }}>{p.role}</td>
                  <td style={{ ...td, padding: '8px 8px', textAlign: 'right', color: 'var(--vl-ink2)' }}>{p.capacityHrs}h</td>
                  <td style={{ ...td, padding: '8px 8px', textAlign: 'right', color: 'var(--vl-sub)' }}>{p.leaveHrs}h</td>
                  <td style={{ ...td, padding: '8px 8px', textAlign: 'right', color: 'var(--vl-ink2)' }}>{p.allocatedHrs}h</td>
                  <td style={{ ...td, padding: '8px 8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 9, background: 'var(--vl-track)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(112, p.utilPct)}%`, height: '100%', background: bandColor(p.utilPct) }} />
                      </div>
                      <span style={{ width: 42, textAlign: 'right', fontWeight: 700, color: bandColor(p.utilPct) }}>{p.utilPct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ---- Azure Boards vs Timesheet ---- */}
      <Card style={{ overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ padding: '11px 14px 9px', font: '600 13px "Open Sans",sans-serif' }}>
          Azure Boards (planned) vs Timesheet (entered) — by resource <span style={{ color: C.faint, fontWeight: 400 }}>· {capLabel}</span>
        </div>
        {!data.timesheetConnected && (
          <div style={{ margin: '0 14px 10px', padding: '8px 12px', fontSize: 11, color: C.amberText, background: '#fdeede', borderRadius: 6 }}>
            Timesheet integration (TimesheetPro · SharePoint) pending — entered hours populate once the LMS/Timesheet API is connected.
          </div>
        )}
        {(() => {
          const maxAE = Math.max(1, ...people.map((p) => Math.max(p.allocatedHrs, p.timesheetHrs)));
          return (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 720 }}>
                <thead>
                  <tr style={{ background: 'var(--vl-soft)', color: C.sub, textAlign: 'left' }}>
                    <th style={th}>Resource</th>
                    <th style={{ ...th, padding: '7px 8px', textAlign: 'right' }}>Azure allocated</th>
                    <th style={{ ...th, padding: '7px 8px', textAlign: 'right' }}>Timesheet entered</th>
                    <th style={{ ...th, padding: '7px 8px', width: 170 }}>Planned vs Actual</th>
                    <th style={{ ...th, textAlign: 'right' }}>Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {people.map((p) => {
                    const tsVar = p.allocatedHrs > 0 ? Math.round(((p.timesheetHrs - p.allocatedHrs) / p.allocatedHrs) * 100) : 0;
                    const varColor = Math.abs(tsVar) <= 8 ? C.green : Math.abs(tsVar) <= 20 ? C.amber : C.red;
                    return (
                      <tr key={p.name} style={{ borderBottom: `1px solid ${C.line2}` }}>
                        <td style={{ ...td, fontWeight: 600, color: 'var(--vl-ink2)' }}>{p.name}</td>
                        <td style={{ ...td, padding: '8px 8px', textAlign: 'right', color: 'var(--vl-brandText)', fontWeight: 600 }}>{p.allocatedHrs}h</td>
                        <td style={{ ...td, padding: '8px 8px', textAlign: 'right', color: C.orange, fontWeight: 600 }}>{data.timesheetConnected ? `${p.timesheetHrs}h` : '—'}</td>
                        <td style={{ ...td, padding: '8px 8px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <div style={{ height: 7, background: C.navy, borderRadius: 2, width: `${Math.round((p.allocatedHrs / maxAE) * 100)}%`, minWidth: 4 }} />
                            <div style={{ height: 7, background: C.orange, borderRadius: 2, width: `${Math.round((p.timesheetHrs / maxAE) * 100)}%`, minWidth: 4, opacity: data.timesheetConnected ? 1 : 0.25 }} />
                          </div>
                        </td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: data.timesheetConnected ? varColor : C.faint }}>
                          {data.timesheetConnected ? `${tsVar >= 0 ? '+' : ''}${tsVar}%` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })()}
        <div style={{ padding: '9px 14px', fontSize: 11, color: 'var(--vl-sub)', borderTop: `1px solid ${C.line2}` }}>
          <span style={{ color: 'var(--vl-brandText)' }}>■</span> Azure Boards allocated &nbsp;·&nbsp; <span style={{ color: C.orange }}>■</span> Timesheet entered &nbsp;·&nbsp; under-logging = lost billable time, over-logging = scope/board hygiene gap
        </div>
      </Card>

      {/* ---- project-wise allocation ---- */}
      <Card style={{ overflow: 'hidden' }}>
        <div style={{ padding: '11px 14px 9px', font: '600 13px "Open Sans",sans-serif' }}>
          Project-wise allocation <span style={{ color: C.faint, fontWeight: 400 }}>· {capLabel} · who is staffed on each project</span>
        </div>
        <div style={{ overflow: 'auto', maxHeight: 300 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 760 }}>
            <thead>
              <tr style={{ background: 'var(--vl-soft)', color: C.sub, textAlign: 'left' }}>
                <th style={{ ...th, width: 240 }}>Project</th>
                <th style={{ ...th, padding: '7px 8px' }}>Lead</th>
                <th style={{ ...th, padding: '7px 8px' }}>Team allocation &amp; %</th>
                <th style={{ ...th, textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.projects.map((pa) => (
                <tr key={pa.name} style={{ borderBottom: `1px solid ${C.line2}` }}>
                  <td style={{ ...td, fontWeight: 600, color: 'var(--vl-ink2)' }}>{pa.name}</td>
                  <td style={{ ...td, padding: '7px 8px', color: C.sub }}>{pa.lead}</td>
                  <td style={{ ...td, padding: '7px 8px', minWidth: 300 }}>
                    <div style={{ display: 'flex', height: 22, width: '100%', borderRadius: 3, overflow: 'hidden', background: C.line2 }}>
                      {pa.people.map((m, mi) => {
                        const pct = Math.round((m.hrs / Math.max(1, pa.total)) * 100);
                        const first = m.name.split(' ')[0];
                        return (
                          <div key={m.name} title={`${m.name}: ${m.hrs}h (${pct}%)`} style={{ width: `${pct}%`, background: MEMBER_PALETTE[mi % MEMBER_PALETTE.length], display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                            {pct >= 15 && <span style={{ fontSize: 9, color: '#fff', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden' }}>{first} {pct}%</span>}
                          </div>
                        );
                      })}
                    </div>
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: 'var(--vl-brandText)' }}>{pa.total}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ shared bits
const th: CSSProperties = { padding: '7px 14px', fontWeight: 600 };
const td: CSSProperties = { padding: '8px 14px' };
function selStyle(w: number): CSSProperties {
  return { appearance: 'none', background: 'var(--vl-card)', border: '1px solid var(--vl-borderStrong)', borderRadius: 4, padding: '6px 26px 6px 10px', fontSize: 12, color: C.ink, width: w, cursor: 'pointer' };
}

function Unit({ children }: { children: ReactNode }) {
  return <span style={{ fontSize: 13, color: 'var(--vl-sub)' }}>{children}</span>;
}

function Card({ children, pad, style }: { children: ReactNode; pad?: string; style?: CSSProperties }) {
  return (
    <div style={{ background: 'var(--vl-card)', border: `1px solid ${C.line}`, borderRadius: 10, boxShadow: '0 1px 2px rgba(16,24,64,.05)', padding: pad, ...style }}>
      {children}
    </div>
  );
}

function KpiCard({ top, label, value, sub }: { top: string; label: string; value: ReactNode; sub: string }) {
  return (
    <div style={{ background: 'var(--vl-card)', border: `1px solid ${C.line}`, borderRadius: 10, boxShadow: '0 1px 2px rgba(16,24,64,.05)', padding: '12px 14px', borderTop: `3px solid ${top}` }}>
      <div style={{ fontSize: 10, color: C.sub, textTransform: 'uppercase', letterSpacing: '.4px', fontWeight: 600 }}>{label}</div>
      <div style={{ font: '800 26px "Open Sans",sans-serif' }}>{value}</div>
      <div style={{ fontSize: 10, color: C.faint }}>{sub}</div>
    </div>
  );
}

