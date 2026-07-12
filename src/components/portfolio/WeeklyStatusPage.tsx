import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import * as SDK from 'azure-devops-extension-sdk';
import { ErrorState } from '@/components/ErrorState';
import { ProgressLoader } from './ProgressLoader';
import { buildProjectServices, listActiveProjects, resolveOrgContext, type OrgContext, type ProjectRef } from '@/services/orgServices';
import { createMockAppServices } from '@/services/mockServices';
import { fromProperties } from '@/utils/propertyMapper';
import { BILLING_TYPE_OPTIONS } from '@/constants/dropdownOptions';
import type { EpicSummary, Milestone, OpenItem, ProjectReportMetrics, WorkItemRow } from '@/models/ProjectReport';
import type { ProjectInformation } from '@/models/ProjectInformation';
import { useVlDark, vlCanvasClass } from './vlTheme';

const C = {
  navy: '#323F7C',
  orange: '#F47C20',
  green: '#2E7D32',
  greenSoft: '#1f8a5b',
  red: '#D64545',
  redHard: '#C0291C',
  amberText: '#C25E00',
  blue: '#007acc',
  ink: 'var(--vl-ink)',
  sub: 'var(--vl-sub)',
  faint: 'var(--vl-faint)',
  line: 'var(--vl-line)',
  line2: 'var(--vl-line2)',
  pageBg: 'var(--vl-page)',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtD(d?: string): string {
  if (!d || !/^\d{4}-\d{2}-\d{2}/.test(d)) return '—';
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return `${String(day).padStart(2, '0')}-${MONTHS[m - 1]}-${y}`;
}
function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const f = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t.getTime() - f.getTime()) / 86400000 - 3 + ((f.getUTCDay() + 6) % 7)) / 7);
}
function weekOpts(): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let off = 0; off > -4; off -= 1) {
    const mon = new Date(now);
    mon.setDate(now.getDate() - ((now.getDay() + 6) % 7) + off * 7);
    const fri = new Date(mon);
    fri.setDate(mon.getDate() + 4);
    out.push(`Week ${isoWeek(mon)} · ${mon.getDate()}–${fri.getDate()} ${MONTHS[fri.getMonth()]} ${fri.getFullYear()}`);
  }
  return out;
}

function ensurePrintCss(): void {
  if (document.getElementById('vl-print-css')) return;
  const style = document.createElement('style');
  style.id = 'vl-print-css';
  style.textContent = `
@media print {
  body * { visibility: hidden !important; }
  .vl-print-area, .vl-print-area * { visibility: visible !important; }
  .vl-print-area { position: absolute !important; left: 0; top: 0; width: 100% !important; max-width: none !important; border: none !important; box-shadow: none !important; }
  .vl-screen-only { display: none !important; }
  html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
}`;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------- report assembly
interface TaskRow {
  feature: string;
  story: string;
  task: string;
  state: string;
  startDate?: string;
  dueDate?: string;
  closedDate?: string;
}
interface Challenge {
  n: number;
  kind: 'Blocker' | 'Clarification';
  challenge: string;
  action: string;
  owner: string;
  age: number;
}

/** Leaf Task/Bug rows with their Feature / User Story ancestry. */
function leafRows(rows: WorkItemRow[]): TaskRow[] {
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  const ancestor = (r: WorkItemRow, type: string): string => {
    let p = r.parentId;
    const guard = new Set<number>();
    while (p !== undefined && byId.has(p) && !guard.has(p)) {
      guard.add(p);
      const row = byId.get(p)!;
      if (row.type === type) return row.title;
      p = row.parentId;
    }
    return '—';
  };
  return rows
    .filter((r) => r.type === 'Task' || r.type === 'Bug')
    .map((r) => ({
      feature: ancestor(r, 'Feature'),
      story: ancestor(r, 'User Story'),
      task: r.title,
      state: r.state,
      startDate: r.startDate,
      dueDate: r.dueDate,
      closedDate: r.closedDate,
    }));
}

/** [start, end] (YYYY-MM-DD, Mon–Fri) of the week `offset` weeks from now. */
function weekRange(offset: number): [string, string] {
  const now = new Date();
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((now.getDay() + 6) % 7) + offset * 7);
  const fri = new Date(mon);
  fri.setDate(mon.getDate() + 4);
  const s = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return [s(mon), s(fri)];
}

function addDays(base: string, delta: number): string {
  const d = new Date(`${base}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Whether a task's schedule window overlaps [start, end]. Undated = current work. */
function overlaps(t: TaskRow, start: string, end: string): boolean {
  const winStart = t.startDate ?? start;
  const winEnd = t.dueDate ?? end;
  return winStart <= end && winEnd >= start;
}

const DONE = new Set(['closed', 'done', 'completed']);
const NEW = new Set(['new', 'proposed', 'to do', 'open', 'approved']);
function stateBucket(s: string): 'done' | 'active' | 'new' {
  const v = s.trim().toLowerCase();
  return DONE.has(v) ? 'done' : NEW.has(v) ? 'new' : 'active';
}
function stateLabel(s: string): { label: string; color: string } {
  const b = stateBucket(s);
  return b === 'done'
    ? { label: '✔ Completed', color: C.green }
    : b === 'active'
      ? { label: '▶ In progress', color: C.blue }
      : { label: '✘ Pending', color: C.redHard };
}

function toChallenges(items: OpenItem[]): Challenge[] {
  return items
    .filter((o) => !DONE.has(o.state.trim().toLowerCase()))
    .map((o, i) => ({
      n: i + 1,
      kind: o.kind,
      challenge: o.title,
      action:
        o.kind === 'Blocker'
          ? `Waiting on ${o.raisedTo ?? 'decision'} — ${o.owner ?? 'owner'} to follow up`
          : `Awaiting response from ${o.raisedTo ?? o.owner ?? 'client'}`,
      owner: o.owner ?? '—',
      age: o.ageDays,
    }));
}

const MS_STYLE: Record<string, { color: string; bg: string }> = {
  completed: { color: '#1f8a5b', bg: '#e7f3ec' },
  overdue: { color: '#C0291C', bg: '#fde0db' },
  'in-progress': { color: '#0a6cc2', bg: '#e3edfb' },
  upcoming: { color: 'var(--vl-sub)', bg: '#f3f2f1' },
  'not-set': { color: '#a19f9d', bg: '#f3f2f1' },
};

// ---------------------------------------------------------------- page
type Status = 'loading' | 'ready' | 'error';

export function WeeklyStatusPage() {
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [org, setOrg] = useState<OrgContext | null>(null);
  const [projects, setProjects] = useState<ProjectRef[]>([]);
  const [selId, setSelId] = useState('');
  const [metrics, setMetrics] = useState<ProjectReportMetrics | null>(null);
  const [info, setInfo] = useState<ProjectInformation | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const notified = useRef(false);

  useEffect(ensurePrintCss, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (import.meta.env.DEV) {
          const list = [
            { id: 'p1', name: 'AAF - HelpDesk (Preview)' },
            { id: 'p2', name: 'Digital Marketing (Preview)' },
          ];
          if (!cancelled) {
            setProjects(list);
            setSelId(list[0].id);
          }
          return;
        }
        await SDK.init({ loaded: false, applyTheme: true });
        await SDK.ready();
        const resolved = await resolveOrgContext();
        const list = await listActiveProjects(resolved, (done, total) => {
          if (!cancelled) setProgress({ done, total });
        });
        if (!cancelled) {
          setOrg(resolved);
          setProjects(list);
          setSelId(list[0]?.id ?? '');
        }
      } catch (err) {
        console.error('Weekly status initialization failed.', err);
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
      if (!selId) return;
      try {
        setStatus('loading');
        const project = projects.find((p) => p.id === selId);
        const services = import.meta.env.DEV
          ? createMockAppServices()
          : buildProjectServices(org!, project!);
        const [m, bag] = await Promise.all([
          services.workItems.getReport(),
          services.properties.load().catch(() => ({})),
        ]);
        if (!cancelled) {
          setMetrics(m);
          setInfo(fromProperties(bag));
          setStatus('ready');
        }
      } catch (err) {
        console.error('Weekly status load failed.', err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load the report.');
          setStatus('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selId, org, projects]);

  useEffect(() => {
    if (!notified.current && (status === 'ready' || status === 'error')) {
      notified.current = true;
      if (!import.meta.env.DEV) void SDK.notifyLoadSucceeded();
    }
  }, [status]);

  if (status === 'error') {
    return <ErrorState title="Failed to load Weekly Status" message={error ?? 'An error occurred.'} />;
  }
  if (status === 'loading' || !metrics) {
    return <ProgressLoader done={progress.done} total={progress.total} label="Loading Weekly Status" />;
  }

  const projName = projects.find((p) => p.id === selId)?.name ?? '';
  return (
    <WeeklyBody
      key={selId}
      projName={projName}
      projects={projects}
      selId={selId}
      onSelId={setSelId}
      metrics={metrics}
      info={info}
    />
  );
}

// ---------------------------------------------------------------- body
function WeeklyBody({
  projName,
  projects,
  selId,
  onSelId,
  metrics,
  info,
}: {
  projName: string;
  projects: ProjectRef[];
  selId: string;
  onSelId: (id: string) => void;
  metrics: ProjectReportMetrics;
  info: ProjectInformation | null;
}) {
  const dark = useVlDark();
  const [reportType, setReportType] = useState<'daily' | 'weekly'>('weekly');
  const [wkIdx, setWkIdx] = useState(0);
  const todayStr = new Date().toISOString().slice(0, 10);
  const [dateStr, setDateStr] = useState(todayStr);
  const [epicIdx, setEpicIdx] = useState(0);
  const isDaily = reportType === 'daily';

  const epics = metrics.epics;
  const useEpic = epics.length > 1;
  const selEpic: EpicSummary | null = useEpic ? (epics[Math.min(epicIdx, epics.length - 1)] ?? null) : null;
  const scoped = selEpic?.report ?? metrics;

  // status word from Project Information health, else derived
  const health = info?.projectHealth ?? '';
  const statusWord = health === 'Red' ? 'Red — Off track' : health === 'Amber' ? 'Amber — Needs attention' : health === 'Green' ? 'Green — Healthy' : scoped.blockers > 0 ? 'Amber — Needs attention' : 'Green — Healthy';
  const statusColor = /Red/.test(statusWord) ? C.red : /Amber/.test(statusWord) ? '#ED9B00' : C.green;
  const statusBg = /Red/.test(statusWord) ? '#fde0db' : /Amber/.test(statusWord) ? '#fff4e6' : '#eef7ef';

  const leaves = useMemo(() => leafRows(scoped.workItems), [scoped]);
  const challenges = useMemo(() => toChallenges(scoped.openItems), [scoped]);
  const milestones: Milestone[] = selEpic ? selEpic.milestones : metrics.milestones;
  const msOverdue = milestones.filter((m) => m.overdue).length;

  const wkList = weekOpts();
  const dObj = new Date(`${dateStr}T00:00:00`);
  const dateLabel = `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dObj.getDay()]}, ${fmtD(dateStr)}`;
  const periodLabel = isDaily ? dateLabel : wkList[Math.min(wkIdx, wkList.length - 1)];
  const title = isDaily ? 'Daily Status Report' : 'Weekly Status Report';
  const primaryTitle = isDaily ? 'Today — Tasks in progress' : 'This Week — Planned vs. Completed';
  const secondaryTitle = isDaily ? 'Tomorrow — Planned Tasks' : 'Next Week — Upcoming Tasks';

  // ---- period-scoped task selection (weekly: the picked week; daily: the day) ----
  const [wStart, wEnd] = isDaily ? [dateStr, dateStr] : weekRange(-Math.min(wkIdx, wkList.length - 1));
  const [nStart, nEnd] = isDaily
    ? [addDays(dateStr, 1), addDays(dateStr, 1)]
    : weekRange(-Math.min(wkIdx, wkList.length - 1) + 1);

  // Completed IN the period (by closed date) + in-progress work overlapping it.
  const doneInPeriod = leaves.filter(
    (l) => stateBucket(l.state) === 'done' && !!l.closedDate && l.closedDate >= wStart && l.closedDate <= wEnd,
  );
  const activeInPeriod = leaves.filter((l) => stateBucket(l.state) === 'active' && overlaps(l, wStart, wEnd));
  const plannedInPeriod = leaves.filter(
    (l) => stateBucket(l.state) === 'new' && (l.startDate ?? l.dueDate) !== undefined && overlaps(l, wStart, wEnd),
  );
  const thisWeek = [...doneInPeriod, ...activeInPeriod, ...plannedInPeriod].slice(0, 8);

  // Upcoming: open items scheduled to overlap the following period; fall back to
  // undated backlog so the section is never misleadingly empty.
  const notDone = leaves.filter((l) => stateBucket(l.state) !== 'done');
  let nextWeek = notDone.filter((l) => (l.startDate ?? l.dueDate) !== undefined && overlaps(l, nStart, nEnd)).slice(0, 6);
  if (nextWeek.length === 0) {
    nextWeek = notDone.filter((l) => !l.startDate && !l.dueDate && stateBucket(l.state) === 'new').slice(0, 5);
  }

  // Summary tiles are scoped to the same period.
  const done = doneInPeriod;
  const active = activeInPeriod;
  const pending = plannedInPeriod;

  const lead = info?.projectManager?.displayName || '—';
  const client = info?.clientName || '—';
  const billing = (info?.billingType && BILLING_TYPE_OPTIONS.find((o) => o.value === info.billingType)?.label) || '—';

  const overview: [string, string][] = selEpic
    ? [
        ['Project', projName],
        ['Epic', selEpic.title],
        ['Epic Lead', selEpic.lead ?? '—'],
        ['Board State', selEpic.state || '—'],
        ['Go-Live', selEpic.goLiveDate ? fmtD(selEpic.goLiveDate) : selEpic.goLiveStatus],
        ['Progress', `${scoped.completionPct}%`],
        ['Project Manager', lead],
        ['Epic Status', statusWord],
      ]
    : [
        ['Project', projName],
        ['Client', client],
        ['Start Date', fmtD(info?.projectStartDate || undefined)],
        ['Go-Live / Due', fmtD(info?.plannedEndDate || undefined)],
        ['Project Type', billing],
        ['Methodology', 'Agile Scrum'],
        ['Project Manager', lead],
        ['Overall Status', statusWord],
      ];

  const agenda = (isDaily
    ? ["Yesterday's progress recap", "Today's planned tasks & ownership", 'Open blockers needing client action', 'Risks to the next milestone']
    : ["Review last week's planned vs. completed items", 'Open blockers and pending client actions', `${selEpic ? selEpic.title : projName} — status update`, "Review next week's plan and commitments", 'Milestone progress — development update']
  ).map((t, i) => ({ n: i + 1, text: t }));

  const weekSummary = [
    { label: 'Completed', v: done.length, c: C.greenSoft, bg: '#e7f3ec' },
    { label: 'In progress', v: active.length, c: '#0a6cc2', bg: '#e3edfb' },
    { label: 'Pending', v: pending.length, c: C.sub, bg: 'var(--vl-track2)' },
    { label: 'Open blockers', v: scoped.blockers, c: C.redHard, bg: '#fde0db' },
  ];

  const exportPptx = async (): Promise<void> => {
    try {
      const { default: PptxGenJS } = await import('pptxgenjs');
      const pptx = new PptxGenJS();
      pptx.defineLayout({ name: 'VL', width: 13.333, height: 7.5 });
      pptx.layout = 'VL';
      const navy = '323F7C';

      let s = pptx.addSlide();
      s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 1.25, fill: { color: navy } });
      s.addText(title, { x: 0.5, y: 0.22, w: 9, h: 0.5, color: 'FFFFFF', fontSize: 26, bold: true });
      s.addText(`${projName}  ·  ${client}  ·  ${periodLabel}`, { x: 0.5, y: 0.78, w: 9, h: 0.4, color: 'C9CFE8', fontSize: 13 });
      s.addText('veelead', { x: 11, y: 0.4, w: 1.9, h: 0.5, color: 'FFFFFF', fontSize: 20, bold: true, align: 'right' });
      s.addTable(
        overview.map((r) => [
          { text: r[0], options: { bold: true, color: navy, fill: { color: 'F1F3FA' } } },
          { text: String(r[1]), options: { color: '333333' } },
        ]),
        { x: 0.5, y: 1.65, w: 6.3, colW: [2.3, 4.0], fontSize: 11, border: { type: 'solid', color: 'E1DFDD', pt: 0.5 }, rowH: 0.36, valign: 'middle' },
      );
      s.addText(`Status: ${statusWord}`, { x: 7.1, y: 1.65, w: 5.6, h: 0.45, fontSize: 15, bold: true, color: statusColor.replace('#', '') });
      s.addText('Meeting Agenda', { x: 7.1, y: 2.35, w: 5.6, h: 0.4, fontSize: 14, bold: true, color: navy });
      s.addText(
        agenda.map((a) => ({ text: `${a.n}. ${a.text}`, options: { breakLine: true, paraSpaceAfter: 6 } })),
        { x: 7.1, y: 2.8, w: 5.8, h: 3.5, fontSize: 11.5, color: '333333' },
      );

      s = pptx.addSlide();
      s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.95, fill: { color: navy } });
      s.addText(isDaily ? 'Today vs. Tomorrow' : 'This Week vs. Next Week', { x: 0.5, y: 0.18, w: 10.5, h: 0.55, color: 'FFFFFF', fontSize: 22, bold: true });
      const header = (cells: string[]): { text: string; options: object }[] =>
        cells.map((t) => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: navy } } }));
      const cells = (vals: string[]): { text: string }[] => vals.map((t) => ({ text: t }));
      s.addText(primaryTitle, { x: 0.5, y: 1.15, w: 8, h: 0.35, fontSize: 13, bold: true, color: 'F47C20' });
      s.addTable(
        [header(['Feature', 'User Story', 'Task', 'Status']), ...thisWeek.map((t) => cells([t.feature, t.story, t.task, stateLabel(t.state).label]))],
        { x: 0.5, y: 1.55, w: 12.3, fontSize: 10, border: { type: 'solid', color: 'E1DFDD', pt: 0.5 }, rowH: 0.32, valign: 'middle' },
      );
      s.addText(secondaryTitle, { x: 0.5, y: 4.35, w: 8, h: 0.35, fontSize: 13, bold: true, color: 'F47C20' });
      s.addTable(
        [header(['Feature', 'User Story', 'Task', 'Owner']), ...nextWeek.map((t) => cells([t.feature, t.story, t.task, 'Veelead']))],
        { x: 0.5, y: 4.75, w: 12.3, fontSize: 10, border: { type: 'solid', color: 'E1DFDD', pt: 0.5 }, rowH: 0.32, valign: 'middle' },
      );

      s = pptx.addSlide();
      s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.95, fill: { color: navy } });
      s.addText('Challenges & Open Actions', { x: 0.5, y: 0.18, w: 10.5, h: 0.55, color: 'FFFFFF', fontSize: 22, bold: true });
      if (challenges.length > 0) {
        s.addTable(
          [header(['#', 'Type', 'Challenge', 'Action Required', 'Owner', 'Age']), ...challenges.map((c) => cells([String(c.n), c.kind, c.challenge, c.action, c.owner, `${c.age}d`]))],
          { x: 0.5, y: 1.3, w: 12.3, fontSize: 10, border: { type: 'solid', color: 'E1DFDD', pt: 0.5 }, rowH: 0.34, valign: 'middle' },
        );
      } else {
        s.addText('✓ No active blockers or open actions this week.', { x: 0.5, y: 1.5, w: 10, h: 0.5, fontSize: 14, color: '2E7D32' });
      }
      await pptx.writeFile({ fileName: `${title.replace(/\s+/g, '-')}-${projName.replace(/[^\w-]+/g, '_')}.pptx` });
    } catch (err) {
      console.error('PPT export failed.', err);
    }
  };

  return (
    <div className={vlCanvasClass(dark)} style={{ background: C.pageBg, color: C.ink, fontFamily: '"Segoe UI","Open Sans",system-ui,sans-serif', padding: '14px clamp(12px,2vw,28px) 40px', minHeight: '100vh' }}>
      {/* screen-only controls */}
      <div className="vl-screen-only" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ font: '700 16px "Open Sans",sans-serif', color: 'var(--vl-brandText)' }}>Status Report</span>
          <div style={{ display: 'flex', border: '1px solid var(--vl-borderStrong)', borderRadius: 6, overflow: 'hidden' }}>
            {(
              [
                ['daily', 'Daily'],
                ['weekly', 'Weekly'],
              ] as ['daily' | 'weekly', string][]
            ).map(([key, label]) => (
              <div key={key} onClick={() => setReportType(key)} style={{ padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: reportType === key ? C.orange : 'var(--vl-card)', color: reportType === key ? '#fff' : C.sub, borderRight: '1px solid var(--vl-line)' }}>
                {label}
              </div>
            ))}
          </div>
          <select style={sel(280)} value={selId} onChange={(e) => onSelId(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {isDaily ? (
            <input type="date" style={sel(160)} value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
          ) : (
            <select style={sel(210)} value={String(wkIdx)} onChange={(e) => setWkIdx(Number(e.target.value))}>
              {wkList.map((w, i) => (
                <option key={w} value={i}>{w}</option>
              ))}
            </select>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div onClick={() => window.print()} style={{ cursor: 'pointer', background: 'var(--vl-card)', border: '1px solid var(--vl-borderStrong)', borderRadius: 5, padding: '8px 14px', fontSize: 12, fontWeight: 600, color: 'var(--vl-ink2)' }}>⤓ Download PDF</div>
          <div onClick={() => void exportPptx()} style={{ cursor: 'pointer', background: C.orange, color: '#fff', borderRadius: 5, padding: '8px 14px', fontSize: 12, fontWeight: 700 }}>⤓ Download PPT</div>
        </div>
      </div>

      {/* epic tabs */}
      {useEpic && (
        <div className="vl-screen-only" style={{ maxWidth: 1000, margin: '0 auto 12px', background: 'var(--vl-card)', border: `1px solid ${C.line}`, borderRadius: 10, boxShadow: '0 1px 2px rgba(16,24,64,.05)', padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
            <span style={{ font: '600 12px "Open Sans",sans-serif', color: 'var(--vl-ink2)' }}>Epic</span>
            <span style={{ fontSize: 11, color: C.faint }}>· {epics.length} in this project · report reflects the selected Epic</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {epics.map((e, i) => {
              const on = i === epicIdx;
              return (
                <div key={e.id} onClick={() => setEpicIdx(i)} style={{ display: 'flex', flexDirection: 'column', gap: 3, cursor: 'pointer', border: `1px solid ${on ? C.navy : 'var(--vl-line)'}`, background: on ? C.navy : 'var(--vl-card)', color: on ? '#fff' : 'var(--vl-ink2)', borderRadius: 7, padding: '8px 13px', minWidth: 150 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: e.completed ? C.green : C.orange, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</span>
                  </div>
                  <span style={{ fontSize: 10, opacity: 0.85 }}>Go-Live {e.goLiveStatus}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* print area report */}
      <div className="vl-print-area" style={{ background: 'var(--vl-card)', border: `1px solid ${C.line}`, borderRadius: 10, boxShadow: '0 1px 2px rgba(16,24,64,.05)', overflow: 'hidden', maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ background: 'linear-gradient(120deg,#323F7C,#3b4890)', padding: '22px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ color: '#fff', font: '800 24px "Open Sans",sans-serif' }}>{title}</div>
            <div style={{ color: '#c3c9e6', fontSize: 13, marginTop: 4 }}>
              {projName} · {client} · {periodLabel}
              {selEpic ? ` · Epic: ${selEpic.title}` : ''}
            </div>
          </div>
          <div style={{ background: 'var(--vl-card)', borderRadius: 6, padding: '5px 12px', font: '800 15px "Open Sans",sans-serif', color: 'var(--vl-brandText)' }}>
            vee<span style={{ color: C.orange }}>lead</span>
          </div>
        </div>
        <div style={{ padding: '22px 28px' }}>
          {/* overview + agenda */}
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 20 }}>
            <div style={{ flex: 1, minWidth: 300 }}>
              <SecTitle>Project Overview</SecTitle>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <tbody>
                  {overview.map(([k, v]) => {
                    const isStatus = /Status$/.test(k);
                    return (
                      <tr key={k} style={{ borderBottom: `1px solid ${C.line2}` }}>
                        <td style={{ padding: '6px 10px', background: 'var(--vl-soft2)', fontWeight: 600, color: 'var(--vl-brandText)', width: 150 }}>{k}</td>
                        <td style={{ padding: '6px 10px' }}>
                          {isStatus ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, color: statusColor, background: statusBg, borderRadius: 3, padding: '2px 9px' }}>
                              <span style={{ width: 9, height: 9, borderRadius: '50%', background: statusColor }} />
                              {v}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--vl-ink2)' }}>{v}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: statusBg, borderRadius: 6, padding: '8px 14px', marginBottom: 14 }}>
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: statusColor }} />
                <b style={{ color: statusColor }}>{statusWord}</b>
              </div>
              <SecTitle>Meeting Agenda</SecTitle>
              {agenda.map((a) => (
                <div key={a.n} style={{ display: 'flex', gap: 9, padding: '5px 0', fontSize: 12, color: 'var(--vl-ink2)' }}>
                  <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--vl-navySoft)', color: 'var(--vl-brandText)', fontWeight: 700, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{a.n}</span>
                  <span>{a.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* milestones */}
          {milestones.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <SecTitle noMargin>Key Milestones</SecTitle>
                <span style={{ fontSize: 11, color: C.sub }}><b style={{ color: C.redHard }}>{msOverdue}</b> overdue</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                {milestones.map((m, i) => {
                  const st = MS_STYLE[m.status] ?? MS_STYLE.upcoming;
                  const mark = m.status === 'completed' ? '✓' : m.status === 'overdue' ? '!' : '';
                  const label = m.status === 'overdue' ? `Overdue ${m.slipDays ?? 0}d` : m.status.replace('-', ' ');
                  return (
                    <div key={m.phase} style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                      {i < milestones.length - 1 && <div style={{ position: 'absolute', top: 8, left: '50%', right: '-50%', height: 3, background: st.bg }} />}
                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: st.color, border: '2px solid var(--vl-card)', boxShadow: `0 0 0 2px ${st.color}`, position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9, fontWeight: 700 }}>{mark}</div>
                      <div style={{ font: '700 10px "Open Sans",sans-serif', color: 'var(--vl-ink2)', marginTop: 9, padding: '0 3px' }}>{m.phase}</div>
                      <div style={{ fontSize: 10, color: C.sub, marginTop: 2 }}>{fmtD(m.revisedDate ?? m.targetDate)}</div>
                      <div style={{ fontSize: 8, fontWeight: 700, color: st.color, background: st.bg, borderRadius: 3, padding: '2px 6px', marginTop: 4, textTransform: 'uppercase', letterSpacing: '.2px' }}>{label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* summary tiles */}
          <div style={{ marginBottom: 20 }}>
            <SecTitle>{isDaily ? 'Week-to-date summary' : 'Sprint summary'}</SecTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
              {weekSummary.map((ws) => (
                <div key={ws.label} style={{ border: '1px solid var(--vl-line)', borderRadius: 8, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 8, background: ws.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ font: '800 18px "Open Sans",sans-serif', color: ws.c }}>{ws.v}</span>
                  </div>
                  <div style={{ fontSize: 12, color: C.sub, fontWeight: 600, lineHeight: 1.25 }}>{ws.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* this week / next week */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 20 }}>
            <div>
              <div style={{ font: '700 13px "Open Sans",sans-serif', color: C.orange, marginBottom: 8 }}>{primaryTitle}</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: C.navy, color: '#fff', textAlign: 'left' }}>
                    <th style={{ ...wth, width: '20%' }}>Feature</th>
                    <th style={{ ...wth, width: '26%' }}>User Story</th>
                    <th style={wth}>Task</th>
                    <th style={{ ...wth, width: 110 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {thisWeek.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ ...wtd, color: C.faint, padding: 12 }}>
                        No task activity recorded in this period.
                      </td>
                    </tr>
                  )}
                  {thisWeek.map((t, i) => {
                    const st = stateLabel(t.state);
                    return (
                      <tr key={i} style={{ borderBottom: `1px solid ${C.line2}` }}>
                        <td style={{ ...wtd, color: C.sub }}>{t.feature}</td>
                        <td style={wtd}>{t.story}</td>
                        <td style={wtd}>{t.task}</td>
                        <td style={{ ...wtd, fontWeight: 600, color: st.color }}>{st.label}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div>
              <div style={{ font: '700 13px "Open Sans",sans-serif', color: C.orange, marginBottom: 8 }}>{secondaryTitle}</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: C.navy, color: '#fff', textAlign: 'left' }}>
                    <th style={{ ...wth, width: '20%' }}>Feature</th>
                    <th style={{ ...wth, width: '26%' }}>User Story</th>
                    <th style={wth}>Task</th>
                    <th style={{ ...wth, width: 90 }}>Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {nextWeek.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ ...wtd, color: C.faint, padding: 12 }}>
                        Nothing scheduled for the following period yet.
                      </td>
                    </tr>
                  )}
                  {nextWeek.map((t, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.line2}` }}>
                      <td style={{ ...wtd, color: C.sub }}>{t.feature}</td>
                      <td style={wtd}>{t.story}</td>
                      <td style={wtd}>{t.task}</td>
                      <td style={wtd}>Veelead</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* challenges */}
          <div>
            <SecTitle>Challenges &amp; Open Actions</SecTitle>
            {challenges.length === 0 ? (
              <div style={{ padding: 14, background: '#eef7ef', color: C.green, borderRadius: 6, fontSize: 12 }}>✓ No active blockers or open actions this week.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: C.navy, color: '#fff', textAlign: 'left' }}>
                    <th style={{ ...wth, width: 30 }}>#</th>
                    <th style={wth}>Type</th>
                    <th style={wth}>Challenge</th>
                    <th style={wth}>Action Required</th>
                    <th style={wth}>Owner</th>
                    <th style={{ ...wth, textAlign: 'right' }}>Age</th>
                  </tr>
                </thead>
                <tbody>
                  {challenges.map((c) => (
                    <tr key={c.n} style={{ borderBottom: `1px solid ${C.line2}` }}>
                      <td style={{ ...wtd, color: C.sub }}>{c.n}</td>
                      <td style={wtd}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: c.kind === 'Blocker' ? '#B3261E' : '#9a5a00', background: c.kind === 'Blocker' ? '#fde0db' : '#fce9d6', borderRadius: 3, padding: '2px 7px', whiteSpace: 'nowrap' }}>{c.kind}</span>
                      </td>
                      <td style={{ ...wtd, fontWeight: 600 }}>{c.challenge}</td>
                      <td style={{ ...wtd, color: C.sub }}>{c.action}</td>
                      <td style={wtd}>{c.owner}</td>
                      <td style={{ ...wtd, textAlign: 'right', color: C.red, fontWeight: 700 }}>{c.age}d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ marginTop: 20, paddingTop: 12, borderTop: `1px solid ${C.line2}`, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.faint }}>
            <span>Veelead · {client} — {projName}</span>
            <span>Confidential · {fmtD(todayStr)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const wth: CSSProperties = { padding: '6px 8px', fontWeight: 600 };
const wtd: CSSProperties = { padding: '6px 8px', color: 'var(--vl-ink2)' };
function sel(w: number): CSSProperties {
  return { appearance: 'none', background: 'var(--vl-card)', border: '1px solid var(--vl-borderStrong)', borderRadius: 4, padding: '6px 10px', fontSize: 12, color: C.ink, width: w, cursor: 'pointer' };
}
function SecTitle({ children, noMargin }: { children: ReactNode; noMargin?: boolean }) {
  return (
    <div style={{ font: '700 13px "Open Sans",sans-serif', color: 'var(--vl-brandText)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: noMargin ? 0 : 8 }}>
      {children}
    </div>
  );
}
