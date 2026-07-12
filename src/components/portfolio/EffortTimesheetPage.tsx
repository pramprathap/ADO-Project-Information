import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import * as SDK from 'azure-devops-extension-sdk';
import { ErrorState } from '@/components/ErrorState';
import { ProgressLoader } from './ProgressLoader';
import { MultiSelect } from './MultiSelect';
import { listActiveProjects, resolveOrgContext, type OrgContext, type ProjectRef } from '@/services/orgServices';
import { monthPeriod, weekOptions, weekPeriod, type Period, type PeriodMode } from '@/services/resourceService';
import { loadEffortData, type EffortData, type EffortRow } from '@/services/effortService';
import { GraphLeaveProvider, GraphTimesheetProvider } from '@/services/sharePointProviders';
import { getGraphTokenInteractive, isSharePointConfigured } from '@/services/graphClient';
import { MOCK_EFFORT_DATA } from '@/services/mockEffort';
import { useVlDark, vlCanvasClass } from './vlTheme';

const C = {
  navy: '#323F7C',
  orange: '#F47C20',
  green: '#2E7D32',
  greenSoft: '#1f8a5b',
  red: '#D64545',
  redHard: '#B3261E',
  amber: '#ED9B00',
  amberText: '#C25E00',
  pendClr: '#F0A030',
  wfh: '#2A6FDB',
  office: '#9aa6d8',
  ink: 'var(--vl-ink)',
  sub: 'var(--vl-sub)',
  faint: 'var(--vl-faint)',
  line: 'var(--vl-line)',
  line2: 'var(--vl-line2)',
  pageBg: 'var(--vl-page)',
};

const th: CSSProperties = { padding: '8px 8px', fontWeight: 600 };
const td: CSSProperties = { padding: '8px 8px' };

/** Status vs planned (approved): Under-logged / On-track / Over-logged. */
function statusOf(planned: number, approved: number): { label: string; varPct: number; color: string; bg: string } {
  const varPct = planned > 0 ? Math.round(((approved - planned) / planned) * 100) : 0;
  if (varPct < -8) return { label: 'Under-logged', varPct, color: C.amberText, bg: '#fce9d6' };
  if (varPct > 8) return { label: 'Over-logged', varPct, color: C.redHard, bg: '#fde0db' };
  return { label: 'On-track', varPct, color: C.green, bg: '#dff3e0' };
}
function apprRateColor(rate: number): string {
  return rate >= 90 ? C.green : rate >= 60 ? C.amber : C.red;
}
const MODE_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  office: { bg: 'var(--vl-soft2)', color: 'var(--vl-sub)', label: 'OFFICE' },
  wfh: { bg: '#e3ecfb', color: C.wfh, label: 'WFH' },
  leave: { bg: '#fde0db', color: C.redHard, label: 'LEAVE' },
};

type Status = 'loading' | 'ready' | 'error';

export function EffortTimesheetPage() {
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [org, setOrg] = useState<OrgContext | null>(null);
  const [projects, setProjects] = useState<ProjectRef[]>([]);
  const [mode, setMode] = useState<PeriodMode>('current');
  const [weekIdx, setWeekIdx] = useState(1);
  const now = new Date();
  const [monthIdx, setMonthIdx] = useState(now.getMonth());
  const [yearSel, setYearSel] = useState(now.getFullYear());
  const [data, setData] = useState<EffortData | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [spNeedsAuth, setSpNeedsAuth] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
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
        console.error('Effort page initialization failed.', err);
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
            setData(MOCK_EFFORT_DATA(period));
            setStatus('ready');
          }
          return;
        }
        if (!org || projects.length === 0) return;
        setProgress({ done: 0, total: projects.length });
        const leave = new GraphLeaveProvider(loginHintRef.current);
        const timesheet = new GraphTimesheetProvider(loginHintRef.current);
        const result = await loadEffortData(org, projects, period, leave, timesheet, (d, t) => {
          if (!cancelled) setProgress({ done: d, total: t });
        });
        if (!cancelled) {
          setData(result);
          setSpNeedsAuth(leave.status === 'auth-required' || timesheet.status === 'auth-required');
          setStatus('ready');
        }
      } catch (err) {
        console.error('Effort page load failed.', err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load effort data.');
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
    return <ErrorState title="Failed to load Effort & Timesheet" message={error ?? 'An error occurred.'} />;
  }
  if (status === 'loading' || !data) {
    return <ProgressLoader done={progress.done} total={progress.total} label="Loading Effort & Timesheet" />;
  }

  const connect = async (): Promise<void> => {
    const token = await getGraphTokenInteractive(loginHintRef.current);
    if (token) {
      setSpNeedsAuth(false);
      setReloadTick((n) => n + 1);
    }
  };

  return (
    <EffortBody
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
      onConnect={() => void connect()}
    />
  );
}

// ------------------------------------------------------------------ body
function EffortBody({
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
  onConnect,
}: {
  data: EffortData;
  mode: PeriodMode;
  onMode: (m: PeriodMode) => void;
  weekIdx: number;
  onWeekIdx: (i: number) => void;
  monthIdx: number;
  onMonthIdx: (i: number) => void;
  yearSel: number;
  onYearSel: (y: number) => void;
  spNeedsAuth: boolean;
  onConnect: () => void;
}) {
  const dark = useVlDark();
  const [resSel, setResSel] = useState<string[]>([]);
  const [selRes, setSelRes] = useState<string | null>(null);

  const capLabel = mode === 'month' ? 'per month' : mode === 'current' ? 'this week · day-wise' : 'selected week · day-wise';
  const rows = useMemo(
    () => (resSel.length ? data.rows.filter((r) => resSel.includes(r.name)) : data.rows),
    [data, resSel],
  );
  const detail = selRes ? rows.find((r) => r.name === selRes) : null;
  const maxBar = Math.max(1, ...rows.map((r) => Math.max(r.planned, r.submitted)));

  const totals = useMemo(() => {
    const planned = r1(rows.reduce((a, r) => a + r.planned, 0));
    const submitted = r1(rows.reduce((a, r) => a + r.submitted, 0));
    const approved = r1(rows.reduce((a, r) => a + r.approved, 0));
    const pending = r1(rows.reduce((a, r) => a + r.pending, 0));
    return {
      planned,
      submitted,
      approved,
      pending,
      submitPct: planned > 0 ? Math.round((submitted / planned) * 100) : 0,
      apprPct: submitted > 0 ? Math.round((approved / submitted) * 100) : 0,
      pendingCount: rows.filter((r) => r.pending > 0).length,
      leaveDays: rows.reduce((a, r) => a + r.leaveDays, 0),
      wfhDays: rows.reduce((a, r) => a + r.wfhDays, 0),
    };
  }, [rows]);

  return (
    <div className={vlCanvasClass(dark)} style={{ background: C.pageBg, color: C.ink, fontFamily: '"Segoe UI","Open Sans",system-ui,sans-serif', padding: '14px clamp(12px,2vw,28px) 40px', minHeight: '100vh' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ font: '700 16px "Open Sans",sans-serif', color: 'var(--vl-brandText)' }}>Timesheet vs Azure Boards</span>
          <div style={{ display: 'flex', border: '1px solid var(--vl-borderStrong)', borderRadius: 6, overflow: 'hidden' }}>
            {(
              [
                ['current', 'Current week'],
                ['week', 'Weekly'],
                ['month', 'Monthly'],
              ] as [PeriodMode, string][]
            ).map(([key, label]) => (
              <div key={key} onClick={() => { onMode(key); setSelRes(null); }} style={{ padding: '6px 15px', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: mode === key ? C.orange : 'var(--vl-card)', color: mode === key ? '#fff' : C.sub, borderRight: '1px solid var(--vl-line)' }}>
                {label}
              </div>
            ))}
          </div>
          <MultiSelect options={data.rows.map((r) => r.name)} selected={resSel} onChange={setResSel} allLabel="All resources" />
          {mode === 'week' && (
            <select style={sel(180)} value={String(weekIdx)} onChange={(e) => onWeekIdx(Number(e.target.value))}>
              {weekOptions().map((o, i) => (
                <option key={o.label} value={i}>{o.label}</option>
              ))}
            </select>
          )}
          {mode === 'month' && (
            <>
              <select style={sel(130)} value={String(monthIdx)} onChange={(e) => onMonthIdx(Number(e.target.value))}>
                {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, i) => (
                  <option key={m} value={i}>{m}</option>
                ))}
              </select>
              <select style={sel(84)} value={String(yearSel)} onChange={(e) => onYearSel(Number(e.target.value))}>
                {[yearSel + 1, yearSel, yearSel - 1].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </>
          )}
          <span style={{ fontSize: 12, color: 'var(--vl-sub)' }}>· resource-oriented · {capLabel}</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--vl-sub)' }}>
          <span style={{ color: C.green }}>■</span> Approved &nbsp; <span style={{ color: C.pendClr }}>■</span> Pending approval &nbsp; <span style={{ color: 'var(--vl-brandText)' }}>│</span> Planned (Azure)
        </div>
      </div>

      {spNeedsAuth && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'var(--vl-navySoft)', border: `1px solid ${C.navy}`, borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--vl-brandText)' }}><b>Connect SharePoint</b> to load Timesheet (TimesheetPro) and Leave (LMS) data.</span>
          <div onClick={onConnect} style={{ cursor: 'pointer', background: C.navy, color: '#fff', fontSize: 12, fontWeight: 700, borderRadius: 5, padding: '7px 16px' }}>Connect SharePoint</div>
        </div>
      )}
      {!isSharePointConfigured() && (
        <div style={{ fontSize: 11, color: C.amberText, background: '#fdeede', borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>
          Timesheet &amp; Leave need the one-time Entra app registration (client ID in <code>sharepointConfig.ts</code>). Azure-planned numbers below are live.
        </div>
      )}

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 12 }}>
        <Kpi top={C.navy} label="PLANNED · Azure Boards" value={<>{totals.planned}<U>h</U></>} sub="Σ remaining estimate assigned" />
        <Kpi top={C.orange} label="SUBMITTED · Timesheet" value={<>{totals.submitted}<U>h</U></>} sub={`${totals.submitPct}% of planned`} />
        <Kpi top={C.green} label="APPROVED · Timesheet" value={<span style={{ color: C.green }}>{totals.approved}<U>h</U></span>} sub={`${totals.apprPct}% of submitted`} />
        <Kpi top={C.amber} label="PENDING APPROVAL" value={<span style={{ color: C.amberText }}>{totals.pending}<U>h</U></span>} sub={`${totals.pendingCount} resources awaiting`} />
        <Kpi top={C.wfh} label="LEAVE / WFH" value={<>{totals.leaveDays}<U>d</U> <span style={{ fontSize: 16, color: C.wfh }}>/ {totals.wfhDays}d</span></>} sub="leave days · WFH days" />
      </div>

      {/* planned vs submitted vs approved — by resource */}
      <Card pad="12px 14px" style={{ marginBottom: 12 }}>
        <div style={{ font: '600 13px "Open Sans",sans-serif', marginBottom: 12 }}>
          Planned vs Submitted vs Approved — by resource <span style={{ color: C.faint, fontWeight: 400 }}>· click a resource for leave / WFH detail</span>
        </div>
        <div style={{ fontSize: 11, color: C.sub, marginBottom: 12, lineHeight: 1.5 }}>
          Each row compares one resource’s timesheet against their Azure-planned hours. The bar fills to <b style={{ color: C.green }}>Approved</b> + <b style={{ color: C.amberText }}>Pending</b> (=Submitted); the <b style={{ color: 'var(--vl-brandText)' }}>┃ Plan</b> marker is the Azure target. Bar short of the marker = under-logged; past it = over-logged.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {rows.map((e) => {
            const apW = (e.approved / maxBar) * 100;
            const peW = (e.pending / maxBar) * 100;
            const plW = (e.planned / maxBar) * 100;
            const st = statusOf(e.planned, e.approved);
            return (
              <div key={e.name} onClick={() => setSelRes(e.name)} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                <div style={{ width: 120, flexShrink: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--vl-ink2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</div>
                  <div style={{ fontSize: 10, color: C.faint }}>{e.role}</div>
                </div>
                <div style={{ flex: 1, position: 'relative', height: 30 }}>
                  <div style={{ position: 'absolute', inset: 0, background: 'var(--vl-track2)', borderRadius: 5 }} />
                  <div title={`Approved ${e.approved}h`} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${apW}%`, background: C.green, borderRadius: peW > 1 ? '5px 0 0 5px' : 5, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' }}>
                    {apW > 16 && <span style={{ fontSize: 10, color: '#fff', fontWeight: 700, padding: '0 7px' }}>{e.approved}h</span>}
                  </div>
                  <div title={`Pending approval ${e.pending}h`} style={{ position: 'absolute', left: `${apW}%`, top: 0, bottom: 0, width: `${peW}%`, background: C.pendClr, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {peW > 12 && <span style={{ fontSize: 10, color: '#fff', fontWeight: 700 }}>+{e.pending}</span>}
                  </div>
                  <div title={`Planned (Azure) ${e.planned}h`} style={{ position: 'absolute', left: `${plW}%`, top: -4, bottom: -4, width: 3, background: C.navy, borderRadius: 2 }} />
                  <div style={{ position: 'absolute', left: `${plW}%`, top: -16, transform: 'translateX(-50%)', fontSize: 9, color: 'var(--vl-brandText)', fontWeight: 700, whiteSpace: 'nowrap' }}>┃ Plan {e.planned}h</div>
                </div>
                <div style={{ width: 132, flexShrink: 0, textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: 'var(--vl-ink2)' }}>
                    <b>{e.submitted}h</b>
                    <span style={{ color: C.faint, fontSize: 10 }}> submitted</span>
                  </div>
                  <span style={{ display: 'inline-block', marginTop: 2, fontSize: 9, fontWeight: 700, color: st.color, background: st.bg, borderRadius: 3, padding: '1px 6px' }}>
                    {st.label} {st.varPct >= 0 ? '+' : ''}{st.varPct}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* selected resource detail */}
      {detail && <ResourceDetail row={detail} period={data.period} capLabel={capLabel} onClose={() => setSelRes(null)} />}

      {/* resource timesheet detail table */}
      <Card style={{ overflow: 'hidden' }}>
        <div style={{ padding: '11px 14px 9px', font: '600 13px "Open Sans",sans-serif' }}>
          Resource timesheet detail <span style={{ color: C.faint, fontWeight: 400 }}>· submitted &amp; approved vs Azure planned · click a row</span>
        </div>
        <div style={{ overflow: 'auto', maxHeight: 340 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 860 }}>
            <thead>
              <tr style={{ background: C.navy, color: '#fff', textAlign: 'left', position: 'sticky', top: 0 }}>
                <th style={{ ...th, padding: '8px 14px' }}>Resource</th>
                <th style={{ ...th, textAlign: 'right' }}>Planned</th>
                <th style={{ ...th, textAlign: 'right' }}>Submitted</th>
                <th style={{ ...th, textAlign: 'right' }}>Approved</th>
                <th style={{ ...th, textAlign: 'right' }}>Leave</th>
                <th style={{ ...th, textAlign: 'right' }}>WFH</th>
                <th style={th}>Status</th>
                <th style={{ ...th, padding: '8px 14px', width: 130 }}>Approval</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const st = statusOf(e.planned, e.approved);
                const stSub = e.planned > 0 ? Math.round(((e.submitted - e.planned) / e.planned) * 100) : 0;
                const apprRate = e.submitted > 0 ? Math.round((e.approved / e.submitted) * 100) : 0;
                return (
                  <tr key={e.name} onClick={() => setSelRes(e.name)} className="vl-row" style={{ borderBottom: `1px solid ${C.line2}`, cursor: 'pointer' }}>
                    <td style={{ ...td, padding: '8px 14px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--vl-ink2)' }}>{e.name}</div>
                      <div style={{ fontSize: 10, color: C.faint }}>{e.role}</div>
                    </td>
                    <td style={{ ...td, textAlign: 'right', color: 'var(--vl-brandText)', fontWeight: 600 }}>{e.planned}h</td>
                    <td style={{ ...td, textAlign: 'right', color: C.amberText, fontWeight: 600 }}>{e.submitted}h</td>
                    <td style={{ ...td, textAlign: 'right', color: C.green, fontWeight: 600 }}>{e.approved}h</td>
                    <td style={{ ...td, textAlign: 'right', color: C.redHard }}>{e.leaveDays}d</td>
                    <td style={{ ...td, textAlign: 'right', color: C.wfh }}>{e.wfhDays}d</td>
                    <td style={td}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: st.color, background: st.bg, borderRadius: 3, padding: '2px 8px', whiteSpace: 'nowrap' }}>
                        {st.label} {st.varPct >= 0 ? '+' : ''}{st.varPct}%
                      </span>
                      <div style={{ fontSize: 9, color: 'var(--vl-sub)', marginTop: 3 }}>vs submitted {stSub >= 0 ? '+' : ''}{stSub}%</div>
                    </td>
                    <td style={{ ...td, padding: '8px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 8, background: 'var(--vl-track)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${apprRate}%`, height: '100%', background: apprRateColor(apprRate) }} />
                        </div>
                        <span style={{ width: 34, textAlign: 'right', fontWeight: 700, color: apprRateColor(apprRate) }}>{apprRate}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '9px 14px', fontSize: 11, color: 'var(--vl-sub)', borderTop: `1px solid ${C.line2}` }}>
          <b>Status</b> = Planned vs <b style={{ color: C.green }}>Approved</b> (Under-logged / On-track / Over-logged) · secondary line = Planned vs <b style={{ color: C.amberText }}>Submitted</b> · leave-adjusted
        </div>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ resource detail
function ResourceDetail({ row, period, capLabel, onClose }: { row: EffortRow; period: Period; capLabel: string; onClose: () => void }) {
  const compliance = row.planned > 0 ? Math.min(100, Math.round((row.submitted / row.planned) * 100)) : 0;
  const util = row.planned > 0 ? Math.min(100, Math.round((row.approved / row.planned) * 100)) : 0;
  const st = statusOf(row.planned, row.approved);
  const officeDays = period.days.length - row.leaveDays - row.wfhDays;
  const offW = (officeDays / period.days.length) * 100;
  const wfhW = (row.wfhDays / period.days.length) * 100;
  const lvW = (row.leaveDays / period.days.length) * 100;
  const unitLabel = period.mode === 'month' ? 'Weekly' : 'Daily';
  const cols = period.cols;

  return (
    <div style={{ background: 'var(--vl-card)', border: `1px solid ${C.navy}`, borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
      <div style={{ background: 'var(--vl-navySoft)', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ font: '700 14px "Open Sans",sans-serif', color: 'var(--vl-brandText)' }}>{row.name}</span>{' '}
          <span style={{ fontSize: 11, color: C.sub }}>· {row.role} · {capLabel}</span>
        </div>
        <div onClick={onClose} style={{ cursor: 'pointer', fontSize: 11, color: C.sub, border: '1px solid var(--vl-borderStrong)', background: 'var(--vl-card)', borderRadius: 4, padding: '4px 10px' }}>✕ Close</div>
      </div>
      <div style={{ padding: '11px 14px', borderBottom: `1px solid ${C.line2}`, fontSize: 12, color: 'var(--vl-ink2)', background: 'var(--vl-soft2)' }}>
        Planned {row.planned}h · submitted {row.submitted}h · approved {row.approved}h — {st.label} ({st.varPct >= 0 ? '+' : ''}{st.varPct}%) · {row.leaveDays}d leave · {row.wfhDays}d WFH
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 14, padding: 14, borderBottom: `1px solid ${C.line2}` }}>
        <div>
          <div style={{ fontSize: 11, color: C.sub, fontWeight: 600, marginBottom: 8 }}>TIMESHEET HOURS</div>
          {(
            [
              ['Planned', 100, C.navy, row.planned],
              ['Submitted', compliance, C.orange, row.submitted],
              ['Approved', util, C.green, row.approved],
            ] as [string, number, string, number][]
          ).map(([label, w, color, hrs]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
              <span style={{ width: 62, fontSize: 11, color: C.sub }}>{label}</span>
              <div style={{ flex: 1, height: 14, background: C.line2, borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${w}%`, height: '100%', background: color }} />
              </div>
              <span style={{ width: 46, textAlign: 'right', fontWeight: 700, fontSize: 12, color }}>{hrs}h</span>
            </div>
          ))}
          <div style={{ marginTop: 9, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: st.color, background: st.bg, borderRadius: 3, padding: '2px 8px' }}>{st.label} {st.varPct >= 0 ? '+' : ''}{st.varPct}%</span>
            <span style={{ fontSize: 11, color: C.sub }}>approved = {util}% of planned</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.sub, fontWeight: 600, marginBottom: 8 }}>ATTENDANCE</div>
          <div style={{ display: 'flex', height: 18, borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
            <div title="Office" style={{ width: `${offW}%`, background: C.office }} />
            <div title="WFH" style={{ width: `${wfhW}%`, background: C.wfh }} />
            <div title="Leave" style={{ width: `${lvW}%`, background: C.red }} />
          </div>
          {(
            [
              ['Office', C.office, officeDays],
              ['WFH', C.wfh, row.wfhDays],
              ['Leave', C.red, row.leaveDays],
            ] as [string, string, number][]
          ).map(([label, color, days]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--vl-ink2)', marginTop: 4 }}>
              <span><span style={{ color }}>■</span> {label}</span>
              <b>{days}d</b>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: '13px 14px 8px', font: '600 12px "Open Sans",sans-serif', color: 'var(--vl-ink2)' }}>
        {unitLabel} breakdown <span style={{ color: C.faint, fontWeight: 400 }}>· approved hours vs planned · totals match above</span>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '0 14px 14px', flexWrap: 'wrap' }}>
        {cols.map((c) => {
          const planned = r1(c.idx.reduce((a, i) => a + (row.byDayPlanned[i] ?? 0), 0));
          const approved = r1(c.idx.reduce((a, i) => a + (row.byDayApproved[i] ?? 0), 0));
          const submitted = r1(c.idx.reduce((a, i) => a + (row.byDaySubmitted[i] ?? 0), 0));
          const mode = row.dayMode[c.idx[0]] ?? 'office';
          const ms = MODE_STYLE[mode];
          const apPct = planned > 0 ? Math.min(100, Math.round((approved / planned) * 100)) : 0;
          const subPct = planned > 0 ? Math.min(100, Math.round((submitted / planned) * 100)) : 0;
          const apColor = apPct >= 90 ? C.green : apPct >= 60 ? C.amber : C.red;
          return (
            <div key={c.label} style={{ flex: 1, minWidth: 104, border: '1px solid var(--vl-line)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ background: ms.bg, padding: '6px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ font: '700 12px "Open Sans",sans-serif', color: 'var(--vl-ink2)' }}>{c.label.split(' · ')[0]}</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: ms.color, textTransform: 'uppercase', letterSpacing: '.3px' }}>{ms.label}</span>
              </div>
              <div style={{ padding: 10 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ font: '800 20px "Open Sans",sans-serif', color: apColor }}>{approved}</span>
                  <span style={{ fontSize: 11, color: 'var(--vl-sub)' }}>/ {planned}h</span>
                </div>
                <div style={{ fontSize: 9, color: C.faint, marginBottom: 6 }}>approved / planned</div>
                <div style={{ height: 6, background: 'var(--vl-track2)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${subPct}%`, background: '#f3d4b6' }} />
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${apPct}%`, background: apColor }} />
                </div>
                <div style={{ fontSize: 9, color: C.sub, marginTop: 4 }}>{submitted}h submitted</div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ padding: '6px 14px 4px', font: '600 12px "Open Sans",sans-serif', color: 'var(--vl-ink2)', borderTop: `1px solid ${C.line2}` }}>
        Work items completed by project <span style={{ color: C.faint, fontWeight: 400 }}>· {capLabel} · <span style={{ color: '#0a8fc2' }}>■</span> Stories <span style={{ color: '#C9A227' }}>■</span> Tasks <span style={{ color: '#CC293D' }}>■</span> Bugs</span>
      </div>
      <div style={{ padding: '8px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {row.work.length === 0 ? (
          <div style={{ fontSize: 11, color: C.faint }}>No work items completed in this period.</div>
        ) : (
          row.work.map((pw) => {
            const tot = Math.max(1, pw.completed);
            return (
              <div key={pw.project} style={{ border: '1px solid var(--vl-line)', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ font: '600 12px "Open Sans",sans-serif', color: 'var(--vl-ink2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pw.project}</span>
                  <span style={{ fontSize: 11, color: C.sub, flexShrink: 0, marginLeft: 10 }}>
                    <b style={{ color: C.greenSoft, fontSize: 14 }}>{pw.completed}</b> completed · {pw.inprog} in progress
                  </span>
                </div>
                <div style={{ display: 'flex', height: 14, borderRadius: 3, overflow: 'hidden', background: C.line2, marginBottom: 7 }}>
                  <div title="User Stories" style={{ width: `${(pw.stories / tot) * 100}%`, background: '#0a8fc2' }} />
                  <div title="Tasks" style={{ width: `${(pw.tasks / tot) * 100}%`, background: '#C9A227' }} />
                  <div title="Bugs" style={{ width: `${(pw.bugs / tot) * 100}%`, background: '#CC293D' }} />
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 11, color: C.sub }}>
                  <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#0a8fc2', marginRight: 5 }} />{pw.stories} Stories</span>
                  <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#C9A227', marginRight: 5 }} />{pw.tasks} Tasks</span>
                  <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#CC293D', marginRight: 5 }} />{pw.bugs} Bugs</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ bits
function sel(w: number): CSSProperties {
  return { appearance: 'none', background: 'var(--vl-card)', border: '1px solid var(--vl-borderStrong)', borderRadius: 4, padding: '6px 26px 6px 10px', fontSize: 12, color: C.ink, width: w, cursor: 'pointer' };
}
function U({ children }: { children: ReactNode }) {
  return <span style={{ fontSize: 13, color: 'var(--vl-sub)' }}>{children}</span>;
}
function Card({ children, pad, style }: { children: ReactNode; pad?: string; style?: CSSProperties }) {
  return <div style={{ background: 'var(--vl-card)', border: `1px solid ${C.line}`, borderRadius: 10, boxShadow: '0 1px 2px rgba(16,24,64,.05)', padding: pad, ...style }}>{children}</div>;
}
function Kpi({ top, label, value, sub }: { top: string; label: string; value: ReactNode; sub: string }) {
  return (
    <div style={{ background: 'var(--vl-card)', border: `1px solid ${C.line}`, borderRadius: 10, boxShadow: '0 1px 2px rgba(16,24,64,.05)', padding: 14, borderTop: `3px solid ${top}` }}>
      <div style={{ fontSize: 11, color: C.sub, fontWeight: 600 }}>{label}</div>
      <div style={{ font: '800 26px "Open Sans",sans-serif' }}>{value}</div>
      <div style={{ fontSize: 10, color: C.faint }}>{sub}</div>
    </div>
  );
}
function r1(n: number): number {
  return Math.round(n * 10) / 10;
}
