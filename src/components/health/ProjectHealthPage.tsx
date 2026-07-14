import { useEffect, useMemo, useState } from 'react';
import { Button, Text, makeStyles, tokens } from '@fluentui/react-components';
import { LoadingState } from '@/components/LoadingState';
import {
  ArrowClockwiseRegular,
  CheckmarkCircleFilled,
  ErrorCircleFilled,
} from '@fluentui/react-icons';
import type { AppServices } from '@/services/appServices';
import type { EpicSummary, Milestone, ProjectReportMetrics } from '@/models/ProjectReport';
import {
  createEmptyProjectInformation,
  type ProjectInformation,
} from '@/models/ProjectInformation';
import { fromProperties } from '@/utils/propertyMapper';
import { useProjectReport } from '@/hooks/useProjectReport';
import { ReportBody } from '@/components/ProjectReport';
import {
  BILLING_TYPE_OPTIONS,
  PROJECT_TYPE_OPTIONS,
  PROJECT_STATUS_OPTIONS,
} from '@/constants/dropdownOptions';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtMilestone(d?: string): string {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return '—';
  const [y, m, day] = d.split('-').map(Number);
  return `${String(day).padStart(2, '0')} ${MONTHS[m - 1]} '${String(y).slice(2)}`;
}

function label<T extends string>(opts: { value: T; label: string }[], v: string): string {
  return opts.find((o) => o.value === v)?.label ?? '';
}

const HEALTH_DOT: Record<string, string> = {
  Green: '#3fb950',
  Amber: '#e3b341',
  Red: '#f85149',
};

const useStyles = makeStyles({
  root: {
    width: '100%',
    maxWidth: 'none',
    margin: 0,
    boxSizing: 'border-box',
    padding: `${tokens.spacingVerticalL} clamp(12px, 1.5vw, 24px) 48px`,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },

  // ---- Header band ----
  hero: {
    borderRadius: '14px',
    padding: '20px 24px',
    color: '#ffffff',
    background: 'linear-gradient(135deg, #3a3f8c 0%, #2a2e63 100%)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '20px',
    flexWrap: 'wrap',
    boxShadow: 'var(--pi-shadow-md)',
  },
  heroLeft: { minWidth: 0 },
  titleRow: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
  dot: { width: '11px', height: '11px', borderRadius: '50%', flex: 'none' },
  heroTitle: { fontSize: 'clamp(18px, 2.4vw, 24px)', fontWeight: 800, color: '#ffffff' },
  trackChip: {
    fontSize: '11px',
    fontWeight: 700,
    padding: '3px 10px',
    borderRadius: '999px',
    backgroundColor: 'rgba(255,255,255,.18)',
    color: '#ffffff',
  },
  heroSub: { color: '#c3c9e6', fontSize: '12.5px', marginTop: '6px' },
  heroBoxes: { display: 'flex', gap: '10px', flexWrap: 'wrap' },
  box: { borderRadius: '8px', padding: '8px 16px', textAlign: 'center', minWidth: '96px' },
  boxBig: { fontSize: '15px', fontWeight: 800, lineHeight: 1.2 },
  boxBigNum: { fontSize: '22px', fontWeight: 800, lineHeight: 1.1 },
  boxLabel: { fontSize: '10px', opacity: 0.9, marginTop: '2px' },
  boxSub: { fontSize: '10px', marginTop: '2px' },

  // ---- Milestones ----
  card: {
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: '14px',
    padding: '16px 20px',
    boxShadow: 'var(--pi-shadow-sm)',
  },
  mHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '18px',
  },
  mTitle: { fontSize: '13px', fontWeight: 700 },
  mMuted: { color: tokens.colorNeutralForeground3, fontWeight: 400 },
  timeline: {
    position: 'relative',
    display: 'grid',
    gridAutoFlow: 'column',
    gridAutoColumns: '1fr',
    gap: '4px',
    overflowX: 'visible',
    paddingTop: '6px',
  },
  node: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    minWidth: 0,
    position: 'relative',
  },
  connector: {
    position: 'absolute',
    top: '13px',
    left: '50%',
    width: '100%',
    height: '2px',
    zIndex: 0,
  },
  arrowHead: {
    position: 'absolute',
    left: '50%',
    top: '-4px',
    transform: 'translateX(-50%)',
    width: 0,
    height: 0,
    borderTop: '5px solid transparent',
    borderBottom: '5px solid transparent',
    borderLeftWidth: '8px',
    borderLeftStyle: 'solid',
  },
  circle: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    display: 'grid',
    placeItems: 'center',
    position: 'relative',
    zIndex: 1,
    backgroundColor: tokens.colorNeutralBackground1,
    fontSize: '20px',
  },
  phase: { fontSize: '12.5px', fontWeight: 700, marginTop: '8px' },
  date: { fontSize: '11.5px', color: tokens.colorNeutralForeground3, marginTop: '2px' },
  badge: {
    marginTop: '6px',
    fontSize: '10px',
    fontWeight: 800,
    padding: '3px 8px',
    borderRadius: '5px',
    letterSpacing: '.02em',
    textTransform: 'uppercase',
  },
  revised: {
    marginTop: '4px',
    fontSize: '10px',
    fontWeight: 700,
    color: 'var(--pi-warn)',
  },
  revisedDate: { color: 'var(--pi-warn)', fontWeight: 700 },
  center: { display: 'grid', placeItems: 'center', minHeight: '200px' },

  // ---- Epic selector ----
  epicHead: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
    flexWrap: 'wrap',
    marginBottom: '12px',
  },
  epicTiles: { display: 'flex', gap: '10px', flexWrap: 'wrap' },
  epicTile: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    minWidth: '180px',
    padding: '10px 14px',
    borderRadius: '10px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground1,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'border-color .15s, background-color .15s',
  },
  epicTileActive: {
    backgroundColor: '#2f3577',
    border: '1px solid #2f3577',
    color: '#ffffff',
  },
  epicDotName: { display: 'flex', alignItems: 'center', gap: '8px' },
  epicName: { fontSize: '13px', fontWeight: 700 },
  epicSub: { fontSize: '11px', opacity: 0.85 },
  epicMeta: {
    marginTop: '12px',
    paddingTop: '10px',
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    display: 'flex',
    gap: '20px',
    flexWrap: 'wrap',
    fontSize: '12px',
    color: tokens.colorNeutralForeground3,
  },
});

function HealthHeader({
  projectName,
  info,
  metrics,
  epic,
}: {
  projectName: string;
  info: ProjectInformation | null;
  metrics: ProjectReportMetrics | null;
  epic: EpicSummary | null;
}) {
  const styles = useStyles();
  const today = new Date().toISOString().slice(0, 10);

  const health = info?.projectHealth || '';
  const dotColor = HEALTH_DOT[health] ?? '#8a94a6';
  const isContinuous = epic ? !epic.isDevelopment : false;
  const track = isContinuous
    ? 'Continuous / Activity-based'
    : (info?.projectType && label(PROJECT_TYPE_OPTIONS, info.projectType)) || 'Delivery';
  // Lead comes from the Project Information the team maintains — the Epic's
  // Assigned To is only a fallback when no PM/DM was captured.
  const lead =
    info?.projectManager?.displayName || info?.deliveryManager?.displayName || epic?.lead || '';
  const client = info?.clientName || '';
  const billing = (info?.billingType && label(BILLING_TYPE_OPTIONS, info.billingType)) || '';
  const start = fmtMilestone(info?.projectStartDate || undefined);
  // Prefer the selected Epic's Go-Live milestone date; fall back to Planned End.
  const goLive = (epic?.isDevelopment && epic.goLiveDate) || info?.plannedEndDate || '';
  // Delivered when the PM marked it Completed/Closed, the selected epic is
  // closed, or every work item in scope is done.
  const allDone = !!metrics && metrics.total > 0 && metrics.completed === metrics.total;
  const completed =
    info?.projectStatus === 'Completed' ||
    info?.currentPhase === 'Closed' ||
    !!epic?.completed ||
    allDone;

  // Subtitle: only the facts that exist — no "— · — · Planned — → —" noise.
  const subParts = [client, lead, billing].filter(Boolean);
  const hasDates = !!info?.projectStartDate || !!goLive;
  if (hasDates) {
    subParts.push(`Planned ${start} → ${fmtMilestone(goLive || undefined)}`);
  }
  const slip = goLive && goLive < today && !completed ? Math.max(0, daysPast(goLive, today)) : 0;
  const goLiveSub = completed ? 'Delivered' : slip > 0 ? `At risk · ${slip}d slip` : 'On schedule';
  const goLiveBg = slip > 0 ? '#C0291C' : 'rgba(255,255,255,.12)';

  // Milestone boxes (development tracks): the immediate upcoming phase (before
  // Go-Live) and the Sign-Off milestone (after Go-Live).
  const ms: Milestone[] = (epic?.isDevelopment ? epic.milestones : metrics?.milestones) ?? [];
  const nextMs = ms
    .filter((x) => x.phase !== 'Sign-Off' && x.phase !== 'Go-Live')
    .find((x) => x.status !== 'completed' && x.status !== 'not-set');
  const signOffMs = ms.find((x) => x.phase === 'Sign-Off');
  const showMilestoneBoxes = !isContinuous && ms.length > 0;

  const nextDate = fmtMilestone(nextMs?.revisedDate ?? nextMs?.targetDate);
  const nextStatus = nextMs?.overdue
    ? `Overdue ${nextMs.slipDays ?? 0}d`
    : nextMs?.status === 'in-progress'
      ? 'On schedule'
      : 'Upcoming';

  const soCompleted = signOffMs?.status === 'completed';
  const soOverdue = signOffMs?.status === 'overdue';
  const soBg = soCompleted ? '#1f7a44' : soOverdue ? '#C0291C' : 'rgba(255,255,255,.12)';
  const soSub = soCompleted ? 'Signed off' : soOverdue ? `Overdue ${signOffMs?.slipDays ?? 0}d` : 'Pending';

  return (
    <div
      className={styles.hero}
      style={
        completed
          ? { background: 'linear-gradient(135deg, #1f7a44 0%, #14532d 100%)' }
          : undefined
      }
    >
      <div className={styles.heroLeft}>
        <div className={styles.titleRow}>
          <span className={styles.dot} style={{ backgroundColor: completed ? '#a7f3d0' : dotColor }} />
          <span className={styles.heroTitle}>{projectName}</span>
          <span className={styles.trackChip}>{track}</span>
          {completed && (
            <span className={styles.trackChip} style={{ backgroundColor: 'rgba(255,255,255,.28)' }}>
              ✓ Closed
            </span>
          )}
        </div>
        <div className={styles.heroSub}>{subParts.join(' · ')}</div>
      </div>
      <div className={styles.heroBoxes}>
        {isContinuous ? (
          <div className={styles.box} style={{ backgroundColor: completed ? '#2E7D32' : '#1f7a44' }}>
            <div className={styles.boxBig}>{completed ? 'Completed' : 'Ongoing'}</div>
            <div className={styles.boxSub}>{completed ? 'All work closed' : 'Cadence · Activity-based'}</div>
          </div>
        ) : (
          <>
            {showMilestoneBoxes && nextMs && (
              <div
                className={styles.box}
                style={{ backgroundColor: nextMs.overdue ? '#C0291C' : 'rgba(255,255,255,.12)' }}
              >
                <div className={styles.boxSub} style={{ marginTop: 0, opacity: 0.85 }}>
                  Next milestone
                </div>
                <div className={styles.boxBig}>{nextMs.phase}</div>
                <div className={styles.boxSub}>
                  {nextDate} · {nextStatus}
                </div>
              </div>
            )}
            <div className={styles.box} style={{ backgroundColor: goLiveBg }}>
              <div className={styles.boxBig}>{fmtMilestone(goLive || undefined)}</div>
              <div className={styles.boxSub}>Go-Live · {goLiveSub}</div>
            </div>
            {showMilestoneBoxes && signOffMs && (
              <div className={styles.box} style={{ backgroundColor: soBg }}>
                <div className={styles.boxSub} style={{ marginTop: 0, opacity: 0.85 }}>
                  Sign-off
                </div>
                <div className={styles.boxBig}>
                  {fmtMilestone(signOffMs.revisedDate ?? signOffMs.targetDate)}
                </div>
                <div className={styles.boxSub}>{soSub}</div>
              </div>
            )}
          </>
        )}
        <ProgressRing pct={metrics?.completionPct ?? 0} color={dotColor} label={health || 'Progress'} />
      </div>
    </div>
  );
}

/** Donut ring showing completion %, arc colored by project health. */
function ProgressRing({ pct, color, label }: { pct: number; color: string; label: string }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4px 10px',
      }}
    >
      <svg width="66" height="66" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="7" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={off}
          transform="rotate(-90 32 32)"
        />
        <text x="32" y="37" textAnchor="middle" fontSize="15" fontWeight="800" fill="#ffffff">
          {pct}%
        </text>
      </svg>
      <div style={{ fontSize: 10, opacity: 0.9, marginTop: 2, color: '#ffffff' }}>{label}</div>
    </div>
  );
}

function daysPast(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Number.isNaN(a) || Number.isNaN(b) ? 0 : Math.round((b - a) / 86_400_000);
}

const MILESTONE_STYLE: Record<
  Milestone['status'],
  { color: string; badgeBg: string; badgeFg: string }
> = {
  completed: { color: '#107C10', badgeBg: '#DFF6DD', badgeFg: '#0e5814' },
  overdue: { color: '#C0291C', badgeBg: '#FDE0E2', badgeFg: '#C0291C' },
  'in-progress': { color: '#0a6cc2', badgeBg: '#E3EDFB', badgeFg: '#0a6cc2' },
  upcoming: { color: '#8a94a6', badgeBg: '#EEF1F7', badgeFg: '#605e5c' },
  'not-set': { color: '#c8c6c4', badgeBg: '#EEF1F7', badgeFg: '#8a94a6' },
};

function MilestonesTimeline({
  milestones,
  overdue,
  available,
  isContinuous,
}: {
  milestones: Milestone[];
  overdue: number;
  available: boolean;
  isContinuous: boolean;
}) {
  const styles = useStyles();
  const today = new Date();
  const todayLabel = `${String(today.getDate()).padStart(2, '0')} ${MONTHS[today.getMonth()]} ${today.getFullYear()}`;

  // Continuous / activity-based tracks have no fixed phase timeline — hide the
  // milestone card entirely rather than showing an explanatory panel.
  if (isContinuous) {
    return null;
  }

  if (!available) {
    return (
      <div className={styles.card}>
        <span className={styles.mTitle}>Key milestones</span>
        <Text size={200} block style={{ marginTop: 8, color: 'var(--pi-neutral-swatch)' }}>
          Milestones need a Development-type Epic (or a Development &ldquo;Current Phase&rdquo;) with
          Feature work items carrying a &ldquo;Feature Type&rdquo; (Requirement, Development, QA/QC,
          UAT, Go-Live, Post-Production). None was found for this project.
        </Text>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.mHeader}>
        <span className={styles.mTitle}>
          Key milestones{' '}
          <span className={styles.mMuted}>· planned dates · overdue if past {todayLabel}</span>
        </span>
        <span style={{ fontSize: 11, color: tokens.colorNeutralForeground3 }}>
          <b style={{ color: '#C0291C' }}>{overdue}</b> overdue
        </span>
      </div>
      <div className={styles.timeline}>
        {milestones.map((m, idx) => {
          const s = MILESTONE_STYLE[m.status];
          const badgeText =
            m.status === 'completed'
              ? 'COMPLETED'
              : m.status === 'overdue'
                ? `OVERDUE ${m.slipDays ?? 0}D`
                : m.status === 'not-set'
                  ? 'NOT SET'
                  : m.status === 'in-progress'
                    ? 'IN PROGRESS'
                    : 'PLANNED';
          // Arrow connectors run between consecutive phases up to and including
          // Sign-Off (the Epic's target date). The final node draws none, so no
          // line trails past the end stage.
          const showConnector = idx < milestones.length - 1;
          const connColor = MILESTONE_STYLE[milestones[idx + 1]?.status ?? m.status].color;
          return (
            <div className={styles.node} key={m.phase}>
              {showConnector && (
                <span className={styles.connector} style={{ backgroundColor: connColor }}>
                  <span className={styles.arrowHead} style={{ borderLeftColor: connColor }} />
                </span>
              )}
              <span className={styles.circle} style={{ color: s.color }}>
                {m.status === 'completed' ? (
                  <CheckmarkCircleFilled />
                ) : m.status === 'overdue' ? (
                  <ErrorCircleFilled />
                ) : (
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      border: `2px solid ${s.color}`,
                      display: 'inline-block',
                    }}
                  />
                )}
              </span>
              <span className={styles.phase}>{m.phase}</span>
              <span className={styles.date}>
                {m.revisedDate ? (
                  <span className={styles.revisedDate}>{fmtMilestone(m.revisedDate)}</span>
                ) : (
                  fmtMilestone(m.targetDate)
                )}
              </span>
              <span
                className={styles.badge}
                style={{ backgroundColor: s.badgeBg, color: s.badgeFg }}
              >
                {badgeText}
              </span>
              {m.revisedCount > 0 && (
                <span className={styles.revised}>Revised ×{m.revisedCount}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const EPIC_DOT = ['#3fb950', '#d98a00', '#3b82f6', '#a855f7', '#ef4444', '#14b8a6'];

function EpicSelector({
  epics,
  selectedId,
  onSelect,
  projectLead,
}: {
  epics: EpicSummary[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  projectLead?: string;
}) {
  const styles = useStyles();
  const selected = epics.find((e) => e.id === selectedId) ?? null;
  return (
    <div className={styles.card}>
      <div className={styles.epicHead}>
        <span className={styles.mTitle}>Epics</span>
        <span className={styles.mMuted} style={{ fontSize: 12 }}>
          · {epics.length} in this project · select one to scope the whole report to it
        </span>
      </div>
      <div className={styles.epicTiles}>
        <button
          type="button"
          className={`${styles.epicTile} ${!selected ? styles.epicTileActive : ''}`}
          onClick={() => onSelect(null)}
        >
          <span className={styles.epicDotName}>
            <span className={styles.dot} style={{ backgroundColor: '#8a94a6' }} />
            <span className={styles.epicName}>All Epics</span>
          </span>
          <span className={styles.epicSub}>whole project</span>
        </button>
        {epics.map((e, i) => {
          const active = e.id === selected?.id;
          const doneStyle =
            e.completed && !active ? { backgroundColor: 'var(--pi-good-bg)' } : undefined;
          return (
            <button
              key={e.id}
              type="button"
              className={`${styles.epicTile} ${active ? styles.epicTileActive : ''}`}
              style={doneStyle}
              onClick={() => onSelect(active ? null : e.id)}
            >
              <span className={styles.epicDotName}>
                {e.completed ? (
                  <CheckmarkCircleFilled
                    style={{ color: '#3fb950', fontSize: 14, flex: 'none' }}
                  />
                ) : (
                  <span
                    className={styles.dot}
                    style={{ backgroundColor: EPIC_DOT[i % EPIC_DOT.length] }}
                  />
                )}
                <span className={styles.epicName}>{e.title}</span>
              </span>
              <span className={styles.epicSub}>
                Go-Live {e.goLiveStatus}
                {e.report && e.report.total === 0 ? ' · no items' : ''}
              </span>
            </button>
          );
        })}
      </div>
      <div className={styles.epicMeta}>
        <span>
          Project lead <b>{projectLead || '—'}</b>
        </span>
        {selected ? (
          <>
            <span>
              Epic lead <b>{selected.lead || '—'}</b>
            </span>
            <span>
              Board state <b style={{ color: '#0a6cc2' }}>{selected.state || '—'}</b>
            </span>
            <span>
              Open blockers <b style={{ color: selected.openBlockers ? '#C0291C' : undefined }}>{selected.openBlockers}</b>
            </span>
            {selected.openClarifications > 0 && (
              <span>
                Clarifications <b>{selected.openClarifications}</b>
              </span>
            )}
          </>
        ) : (
          <span style={{ color: 'var(--pi-neutral-swatch)' }}>
            Viewing the whole project — select an Epic to scope every section to it.
          </span>
        )}
      </div>
    </div>
  );
}

export function ProjectHealthPage({ services }: { services: AppServices }) {
  const styles = useStyles();
  const { status, metrics, error, refresh } = useProjectReport(services);
  const [info, setInfo] = useState<ProjectInformation | null>(null);
  const [selectedEpicId, setSelectedEpicId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void services.properties
      .load()
      .then((bag) => {
        if (!cancelled) setInfo(fromProperties(bag));
      })
      .catch(() => {
        if (!cancelled) setInfo(createEmptyProjectInformation());
      });
    return () => {
      cancelled = true;
    };
  }, [services]);

  const statusWord = useMemo(
    () => (info ? label(PROJECT_STATUS_OPTIONS, info.projectStatus) : ''),
    [info],
  );

  const epics = metrics?.epics ?? [];
  // Default scope is the WHOLE PROJECT — an Epic only scopes the report when
  // the user explicitly selects its tile (QC: auto-selecting the first epic
  // made every KPI look wrong/partial).
  const selectedEpic: EpicSummary | null = epics.find((e) => e.id === selectedEpicId) ?? null;

  // Milestones shown come from the selected Epic (multi-epic projects) or the
  // project-level roll-up when there are no Epics.
  const timelineMilestones = selectedEpic ? selectedEpic.milestones : (metrics?.milestones ?? []);
  const timelineOverdue = selectedEpic
    ? selectedEpic.milestonesOverdue
    : (metrics?.milestonesOverdue ?? 0);
  const isContinuous = selectedEpic ? !selectedEpic.isDevelopment : false;
  const timelineAvailable = selectedEpic
    ? selectedEpic.isDevelopment
    : !!metrics?.milestonesAvailable;

  // The whole report reflects the selected Epic (its own scoped metrics), or the
  // project-wide roll-up when no Epic is selected. An Epic with no work items
  // (or none loaded) falls back to the project-wide numbers so the header never
  // shows a misleading 0%.
  const scopedReport =
    selectedEpic?.report && selectedEpic.report.total > 0 ? selectedEpic.report : null;
  const activeMetrics = scopedReport ?? metrics;

  return (
    <div className={styles.root}>
      <HealthHeader
        projectName={services.context.project.name}
        info={info}
        metrics={activeMetrics}
        epic={selectedEpic}
      />

      {status === 'loading' && (
        <div className={styles.card}>
          <LoadingState label="Loading project health…" />
        </div>
      )}
      {status === 'error' && (
        <div className={styles.card}>
          <div className={styles.center}>
            <Text style={{ color: 'var(--pi-danger)' }}>{error}</Text>
          </div>
        </div>
      )}
      {status === 'loaded' && metrics && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              {statusWord ? `Status: ${statusWord} · ` : ''}Live delivery metrics from Azure Boards
            </Text>
            <Button appearance="subtle" icon={<ArrowClockwiseRegular />} onClick={refresh}>
              Refresh
            </Button>
          </div>
          {epics.length > 0 && (
            <EpicSelector
              epics={epics}
              selectedId={selectedEpic?.id ?? null}
              onSelect={setSelectedEpicId}
              projectLead={
                info?.projectManager?.displayName || info?.deliveryManager?.displayName || undefined
              }
            />
          )}
          <MilestonesTimeline
            milestones={timelineMilestones}
            overdue={timelineOverdue}
            available={timelineAvailable}
            isContinuous={isContinuous}
          />
          <div className={styles.card} style={{ padding: 0 }}>
            <ReportBody m={activeMetrics ?? metrics} epicTitle={selectedEpic?.title} />
          </div>
        </>
      )}
    </div>
  );
}
