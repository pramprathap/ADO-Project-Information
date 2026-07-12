import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button, Spinner, Text, makeStyles, tokens } from '@fluentui/react-components';
import {
  ArrowClockwiseRegular,
  BookRegular,
  BugRegular,
  ChevronDownRegular,
  ChevronRightRegular,
  CrownRegular,
  ErrorCircleRegular,
  RibbonRegular,
  SquareRegular,
  TaskListSquareLtrRegular,
  WarningRegular,
} from '@fluentui/react-icons';
import type { AppServices } from '@/services/appServices';
import type {
  CountBucket,
  ProjectReportMetrics,
  TypeBreakdown,
  WeeklyPoint,
  WorkItemRow,
} from '@/models/ProjectReport';
import { useProjectReport } from '@/hooks/useProjectReport';
import { formatTimestampForDisplay, formatIsoDateForDisplay } from '@/utils/dateUtils';
import { PulseGlyph, CheckShieldGlyph, StatusGlyph, CalendarGlyph, CodeGlyph } from './icons';

const useStyles = makeStyles({
  card: {
    width: '100%',
    boxSizing: 'border-box',
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: '16px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    boxShadow: 'var(--pi-shadow-sm)',
    marginTop: tokens.spacingVerticalL,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: '16px 20px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    flexWrap: 'wrap',
  },
  glyph: {
    width: '34px',
    height: '34px',
    borderRadius: '10px',
    flex: 'none',
    display: 'grid',
    placeItems: 'center',
    backgroundColor: 'var(--pi-accent-soft)',
    color: 'var(--pi-accent)',
  },
  title: { fontSize: '15.5px', fontWeight: 700 },
  caption: { fontSize: '12px', color: tokens.colorNeutralForeground3, display: 'block' },
  spacer: { flex: 1 },
  body: { padding: '20px', display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL },

  kpis: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: tokens.spacingHorizontalM,
  },
  kpi: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    alignItems: 'center',
    padding: '12px 14px',
    borderRadius: '12px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  kpiIcon: {
    width: '34px',
    height: '34px',
    borderRadius: '9px',
    flex: 'none',
    display: 'grid',
    placeItems: 'center',
    backgroundColor: 'var(--pi-accent-soft)',
    color: 'var(--pi-accent)',
  },
  kpiK: {
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: tokens.colorNeutralForeground3,
    display: 'block',
  },
  kpiV: { fontSize: '20px', fontWeight: 800, fontVariantNumeric: 'tabular-nums' },

  progressWrap: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS },
  progressTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  progressTrack: {
    height: '10px',
    borderRadius: '999px',
    backgroundColor: tokens.colorNeutralBackground4,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: '999px', backgroundColor: 'var(--pi-good)' },

  grid2: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: tokens.spacingHorizontalL,
    alignItems: 'start',
  },
  panel: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: '12px',
    padding: '14px 16px',
  },
  panelTitle: { fontSize: '13px', fontWeight: 700, marginBottom: tokens.spacingVerticalS },
  barRow: {
    display: 'grid',
    gridTemplateColumns: '140px 1fr 40px',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    marginBottom: '6px',
  },
  barLabel: {
    fontSize: '12.5px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  barTrack: {
    height: '8px',
    borderRadius: '999px',
    backgroundColor: tokens.colorNeutralBackground4,
  },
  barFill: { height: '100%', borderRadius: '999px', backgroundColor: 'var(--pi-accent)' },
  barCount: {
    fontSize: '12.5px',
    fontWeight: 700,
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  },

  bugGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))',
    gap: tokens.spacingHorizontalM,
  },
  bugStat: { textAlign: 'center' },
  bugV: { fontSize: '20px', fontWeight: 800, fontVariantNumeric: 'tabular-nums' },
  bugK: { fontSize: '11px', color: tokens.colorNeutralForeground3, textTransform: 'uppercase' },

  sprintList: { display: 'flex', flexDirection: 'column', gap: '6px' },
  sprintRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: '6px 0',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },

  // ---- Designed panels (Sprints / Bugs raised / Work items by type) ----
  panelHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: '10px',
  },
  sectionTitle: { fontSize: '14px', fontWeight: 700 },
  segTrack: {
    height: '9px',
    borderRadius: '999px',
    overflow: 'hidden',
    display: 'flex',
    backgroundColor: tokens.colorNeutralBackground4,
  },
  seg: { height: '100%' },

  tiles: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '10px',
    margin: '14px 0 12px',
  },
  tile: {
    borderRadius: '10px',
    padding: '12px 8px',
    textAlign: 'center',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  tileNum: { fontSize: '22px', fontWeight: 800, lineHeight: 1.1 },
  tileLabel: { fontSize: '11px', color: tokens.colorNeutralForeground3, marginTop: '2px' },
  chipRow: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' },
  chip: {
    fontSize: '11px',
    fontWeight: 700,
    padding: '3px 9px',
    borderRadius: '6px',
    cursor: 'default',
  },
  chipCurrent: {
    animationName: {
      '0%, 100%': { boxShadow: '0 0 0 0 rgba(47,53,119,.55)' },
      '50%': { boxShadow: '0 0 0 5px rgba(47,53,119,0)' },
    },
    animationDuration: '1.6s',
    animationIterationCount: 'infinite',
    outline: '2px solid #2f3577',
  },
  legend: {
    display: 'flex',
    gap: '14px',
    flexWrap: 'wrap',
    fontSize: '11px',
    color: tokens.colorNeutralForeground3,
  },
  legendItem: { display: 'flex', alignItems: 'center', gap: '5px' },
  legendDot: { width: '9px', height: '9px', borderRadius: '2px', flex: 'none' },

  bugBig: { fontSize: '34px', fontWeight: 800, color: 'var(--pi-danger)', lineHeight: 1 },
  bugCols: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', margin: '10px 0' },
  bugColNum: { fontSize: '18px', fontWeight: 800 },
  bugColLabel: {
    fontSize: '10.5px',
    textTransform: 'uppercase',
    color: tokens.colorNeutralForeground3,
    letterSpacing: '.03em',
  },
  reworkNote: { fontSize: '11.5px', color: tokens.colorNeutralForeground3, marginTop: '8px' },

  typeRow: {
    display: 'grid',
    gridTemplateColumns: '150px 1fr auto',
    alignItems: 'center',
    gap: '14px',
    padding: '7px 0',
  },
  typeName: { display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '13px' },
  typeDot: { width: '10px', height: '10px', borderRadius: '3px', flex: 'none' },
  typeCounts: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    justifyContent: 'flex-end',
    fontSize: '12px',
    fontVariantNumeric: 'tabular-nums',
  },
  overdueBadge: {
    fontSize: '10.5px',
    fontWeight: 800,
    color: '#ffffff',
    backgroundColor: 'var(--pi-danger)',
    borderRadius: '999px',
    padding: '2px 9px',
  },
  typeTotal: { fontWeight: 800, fontSize: '15px', minWidth: '26px', textAlign: 'right' },
  tableScroll: {
    overflowX: 'auto',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: '12px',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', minWidth: '760px' },
  th: {
    textAlign: 'left',
    padding: '10px 12px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    color: tokens.colorNeutralForeground3,
    textTransform: 'uppercase',
    fontSize: '11px',
    letterSpacing: '0.04em',
    position: 'sticky',
    top: 0,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  td: {
    padding: '9px 12px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    verticalAlign: 'top',
  },
  kindBadge: {
    display: 'inline-block',
    padding: '2px 9px',
    borderRadius: '999px',
    fontSize: '10.5px',
    fontWeight: 800,
    letterSpacing: '.02em',
    textTransform: 'uppercase',
  },
  filterBar: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: '8px',
  },
  filterSelect: {
    fontSize: '12px',
    padding: '4px 8px',
    borderRadius: '6px',
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    maxWidth: '200px',
  },
  treeTitle: { display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 },
  treeGuide: { color: tokens.colorNeutralForeground4, flex: 'none', fontFamily: 'monospace' },
  treeChevron: {
    display: 'grid',
    placeItems: 'center',
    width: '18px',
    height: '18px',
    flex: 'none',
    padding: 0,
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    backgroundColor: 'transparent',
    color: tokens.colorNeutralForeground2,
    fontSize: '14px',
  },
  headerToggle: {
    display: 'grid',
    placeItems: 'center',
    width: '22px',
    height: '22px',
    flex: 'none',
    padding: 0,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: '4px',
    cursor: 'pointer',
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    fontSize: '15px',
    fontWeight: 700,
    lineHeight: 1,
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
    ':disabled': { opacity: 0.4, cursor: 'default' },
  },
  typeTag: {
    fontSize: '10px',
    fontWeight: 700,
    padding: '1px 7px',
    borderRadius: '4px',
    flex: 'none',
    backgroundColor: tokens.colorNeutralBackground4,
    color: tokens.colorNeutralForeground2,
  },
  center: { display: 'grid', placeItems: 'center', minHeight: '160px', padding: '24px' },
});

/** Short, colored tag per work-item type for the tree. */
const TYPE_TAG_COLOR: Record<string, string> = {
  Epic: '#8a5cf6',
  Feature: '#8a5cf6',
  'User Story': '#0a6cc2',
  Task: '#d98a00',
  Bug: '#C0291C',
  Issue: '#C0291C',
  'Open Items': '#e08a1e',
  Blocker: '#C0291C',
  Clarifications: '#d98a00',
};

function BarList({ items, tint }: { items: CountBucket[]; tint?: string }) {
  const styles = useStyles();
  const max = Math.max(1, ...items.map((i) => i.count));
  if (items.length === 0) {
    return <Text size={200}>No data.</Text>;
  }
  return (
    <div>
      {items.slice(0, 8).map((i) => (
        <div className={styles.barRow} key={i.key}>
          <span className={styles.barLabel} title={i.key}>
            {i.key}
          </span>
          <span className={styles.barTrack}>
            <span
              className={styles.barFill}
              style={{ width: `${(i.count / max) * 100}%`, backgroundColor: tint }}
            />
          </span>
          <span className={styles.barCount}>{i.count}</span>
        </div>
      ))}
    </div>
  );
}

const SEG = {
  open: '#a7adbd',
  blue: 'var(--pi-accent)',
  green: 'var(--pi-good)',
  red: 'var(--pi-danger)',
  indigo: '#2f3577',
  indigoSoft: '#7f86e0',
  orange: '#e08a1e',
  purple: '#8a5cf6',
  amber: '#d98a00',
};

const TYPE_ICON: Record<string, ReactNode> = {
  Epic: <CrownRegular />,
  Feature: <RibbonRegular />,
  'User Story': <BookRegular />,
  Task: <TaskListSquareLtrRegular />,
  Bug: <BugRegular />,
  Issue: <ErrorCircleRegular />,
  'Open Items': <TaskListSquareLtrRegular />,
  Blocker: <WarningRegular />,
  Clarifications: <ErrorCircleRegular />,
};

/** Relevant, colored icon per work-item type. */
function TypeIcon({ type }: { type: string }) {
  return (
    <span
      style={{
        color: TYPE_TAG_COLOR[type] ?? tokens.colorNeutralForeground3,
        display: 'inline-flex',
        flex: 'none',
        fontSize: '16px',
        lineHeight: 1,
      }}
    >
      {TYPE_ICON[type] ?? <SquareRegular />}
    </span>
  );
}

function LegendItem({ color, label, line }: { color: string; label: string; line?: boolean }) {
  const styles = useStyles();
  return (
    <span className={styles.legendItem}>
      {line ? (
        <span style={{ width: 14, height: 0, borderTop: `2px solid ${color}`, flex: 'none' }} />
      ) : (
        <span className={styles.legendDot} style={{ backgroundColor: color }} />
      )}
      {label}
    </span>
  );
}

function SprintsCard({ m }: { m: ProjectReportMetrics }) {
  const styles = useStyles();
  const s = m.sprintStats;
  const total = s.total || 1;
  const chipColor = (tf: string): { bg: string; fg: string } =>
    tf === 'past'
      ? { bg: '#DFF6DD', fg: '#0e5814' }
      : tf === 'current'
        ? { bg: '#E3E5F5', fg: SEG.indigo }
        : { bg: '#EEF1F7', fg: '#8a94a6' };
  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.sectionTitle}>Sprints</span>
        <span style={{ fontSize: 12, color: tokens.colorNeutralForeground3 }}>
          {s.done} of {total} done
        </span>
      </div>
      <div className={styles.segTrack}>
        <span
          className={styles.seg}
          style={{ width: `${(s.done / total) * 100}%`, backgroundColor: SEG.green }}
        />
        <span
          className={styles.seg}
          style={{ width: `${(s.inProgress / total) * 100}%`, backgroundColor: SEG.indigo }}
        />
      </div>
      <div className={styles.tiles}>
        <div className={styles.tile} style={{ backgroundColor: 'var(--pi-good-bg)' }}>
          <div className={styles.tileNum} style={{ color: 'var(--pi-good)' }}>
            {s.done}
          </div>
          <div className={styles.tileLabel}>Completed</div>
        </div>
        <div className={styles.tile} style={{ backgroundColor: 'var(--pi-accent-soft)' }}>
          <div className={styles.tileNum} style={{ color: 'var(--pi-accent)' }}>
            {s.inProgress}
          </div>
          <div className={styles.tileLabel}>On-time</div>
        </div>
        <div
          className={styles.tile}
          style={{ backgroundColor: tokens.colorNeutralBackground3 }}
        >
          <div className={styles.tileNum} style={{ color: tokens.colorNeutralForeground1 }}>
            {s.pending}
          </div>
          <div className={styles.tileLabel}>Pending</div>
        </div>
      </div>
      <div className={styles.chipRow}>
        {m.sprints.slice(0, 12).map((sp, i) => {
          const c = chipColor(sp.timeframe);
          const range =
            sp.startDate || sp.finishDate
              ? `${formatIsoDateForDisplay(sp.startDate)} – ${formatIsoDateForDisplay(sp.finishDate)}`
              : 'No dates set';
          const isCurrent = sp.timeframe === 'current';
          return (
            <span
              key={sp.path}
              className={`${styles.chip} ${isCurrent ? styles.chipCurrent : ''}`}
              style={{ backgroundColor: c.bg, color: c.fg }}
              title={`${sp.name}\n${range}${isCurrent ? '\n(Current sprint)' : ''}`}
            >
              S{i + 1}
            </span>
          );
        })}
      </div>
      <div className={styles.legend}>
        <LegendItem color={SEG.green} label="On-time" />
        <LegendItem color={SEG.amber} label="Late" />
        <LegendItem color={SEG.indigo} label="In progress" />
        <LegendItem color="#8a94a6" label="Pending" />
      </div>
    </div>
  );
}

function BugsCard({ m }: { m: ProjectReportMetrics }) {
  const styles = useStyles();
  const b = m.bugs;
  const total = b.total || 1;
  const reworkPct = b.closed > 0 ? Math.round((b.reopened / b.closed) * 100) : 0;
  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.sectionTitle}>Bugs raised</span>
      </div>
      <div className={styles.bugBig}>{b.total}</div>
      <div className={styles.bugCols}>
        <div>
          <div className={styles.bugColNum} style={{ color: SEG.orange }}>
            {b.open}
          </div>
          <div className={styles.bugColLabel}>Open</div>
        </div>
        <div>
          <div className={styles.bugColNum} style={{ color: SEG.green }}>
            {b.closed}
          </div>
          <div className={styles.bugColLabel}>Closed</div>
        </div>
        <div>
          <div className={styles.bugColNum} style={{ color: SEG.purple }}>
            {b.reopened}
          </div>
          <div className={styles.bugColLabel}>Reopened</div>
        </div>
      </div>
      <div className={styles.segTrack}>
        <span
          className={styles.seg}
          style={{ width: `${(b.closed / total) * 100}%`, backgroundColor: SEG.green }}
        />
        <span
          className={styles.seg}
          style={{ width: `${(b.open / total) * 100}%`, backgroundColor: SEG.orange }}
        />
      </div>
      <div className={styles.reworkNote}>Rework rate {reworkPct}% · reopened ÷ closed</div>
    </div>
  );
}

function WorkItemsByType({ m }: { m: ProjectReportMetrics }) {
  const styles = useStyles();
  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.sectionTitle}>Work items by type</span>
        <div className={styles.legend}>
          <LegendItem color={SEG.open} label="Open" />
          <LegendItem color={SEG.blue} label="In progress" />
          <LegendItem color={SEG.green} label="Completed" />
          <LegendItem color={SEG.red} label="Overdue" />
        </div>
      </div>
      {m.typeBreakdown.map((t: TypeBreakdown) => {
        const total = t.total || 1;
        return (
          <div className={styles.typeRow} key={t.type}>
            <span className={styles.typeName}>
              <TypeIcon type={t.type} />
              {t.type}
            </span>
            <span className={styles.segTrack}>
              <span
                className={styles.seg}
                style={{ width: `${(t.open / total) * 100}%`, backgroundColor: SEG.open }}
              />
              <span
                className={styles.seg}
                style={{ width: `${(t.inProgress / total) * 100}%`, backgroundColor: SEG.blue }}
              />
              <span
                className={styles.seg}
                style={{ width: `${(t.completed / total) * 100}%`, backgroundColor: SEG.green }}
              />
            </span>
            <span className={styles.typeCounts}>
              <span style={{ color: tokens.colorNeutralForeground3 }}>{t.open} open</span>
              <span style={{ color: SEG.blue, fontWeight: 700 }}>{t.inProgress}</span>
              <span style={{ color: SEG.green, fontWeight: 700 }}>{t.completed}</span>
              {t.overdue > 0 && <span className={styles.overdueBadge}>{t.overdue} overdue</span>}
              <span className={styles.typeTotal}>{t.total}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function WeeklyProgress({ m }: { m: ProjectReportMetrics }) {
  const styles = useStyles();
  const w = m.weekly;
  const maxBar = Math.max(1, ...w.map((p) => Math.max(p.opened, p.closed)));
  const maxRem = Math.max(1, ...w.map((p) => p.remainingHrs));
  const pts = w
    .map((p, i) => `${((i + 0.5) / w.length) * 100},${100 - (p.remainingHrs / maxRem) * 92}`)
    .join(' ');
  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.sectionTitle}>Weekly progress</span>
        <div className={styles.legend}>
          <LegendItem color={SEG.red} label="Opened" />
          <LegendItem color={SEG.green} label="Closed" />
          <LegendItem color={SEG.indigo} label="Remaining" line />
        </div>
      </div>
      <div style={{ position: 'relative', height: 170, marginTop: 8 }}>
        <div style={{ display: 'flex', height: '100%', alignItems: 'flex-end', gap: 6 }}>
          {w.map((p) => (
            <div
              key={p.label}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                height: '100%',
                justifyContent: 'flex-end',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: '82%' }}>
                <span
                  style={{
                    width: 9,
                    height: `${(p.opened / maxBar) * 100}%`,
                    backgroundColor: SEG.red,
                    borderRadius: '3px 3px 0 0',
                    opacity: 0.85,
                  }}
                />
                <span
                  style={{
                    width: 9,
                    height: `${(p.closed / maxBar) * 100}%`,
                    backgroundColor: SEG.green,
                    borderRadius: '3px 3px 0 0',
                    opacity: 0.85,
                  }}
                />
              </div>
              <span style={{ fontSize: 10, color: tokens.colorNeutralForeground3 }}>{p.label}</span>
            </div>
          ))}
        </div>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '82%' }}
        >
          <polyline
            points={pts}
            fill="none"
            stroke={SEG.indigo}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
    </div>
  );
}

function EffortBar({ label, hrs, max, color }: { label: string; hrs: number; max: number; color: string }) {
  const styles = useStyles();
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
        <span>{label}</span>
        <b>{hrs}h</b>
      </div>
      <div className={styles.segTrack}>
        <span
          className={styles.seg}
          style={{ width: `${(hrs / max) * 100}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function GapCard({ label, sub, pct, tint }: { label: string; sub: string; pct: number; tint: string }) {
  const styles = useStyles();
  return (
    <div className={styles.tile} style={{ backgroundColor: tokens.colorNeutralBackground2 }}>
      <div className={styles.tileLabel} style={{ marginTop: 0 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: tint }}>
        {pct >= 0 ? '+' : ''}
        {pct}%
      </div>
      <div className={styles.tileLabel}>{sub}</div>
    </div>
  );
}

function EffortNumbers({ m }: { m: ProjectReportMetrics }) {
  const styles = useStyles();
  const e = m.effort;
  const max = Math.max(1, e.plannedHrs, e.actualHrs, e.enteredHrs);
  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.sectionTitle}>Effort — the three numbers (hrs)</span>
      </div>
      <EffortBar label="Planned" hrs={e.plannedHrs} max={max} color={SEG.indigo} />
      <EffortBar label="Actual" hrs={e.actualHrs} max={max} color={SEG.indigoSoft} />
      <EffortBar label="Entered" hrs={e.enteredHrs} max={max} color={SEG.orange} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
        <GapCard label="Gap A · Est. accuracy" sub="Planned→Actual" pct={e.gapAccuracyPct} tint={SEG.red} />
        <GapCard label="Gap B · Board hygiene" sub="Actual→Entered" pct={e.gapHygienePct} tint={SEG.amber} />
        <GapCard label="Gap C · Cost vs budget" sub="margin erosion" pct={e.gapBudgetPct} tint={SEG.red} />
      </div>
    </div>
  );
}

function TeamPanel({ m }: { m: ProjectReportMetrics }) {
  const styles = useStyles();
  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.sectionTitle}>Team on this project</span>
        <span style={{ fontSize: 12, color: tokens.colorNeutralForeground3 }}>
          effort contribution &amp; availability
        </span>
      </div>
      {m.team.length === 0 ? (
        <Text size={200}>No logged effort yet.</Text>
      ) : (
        m.team.map((t) => (
          <div key={t.name} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  backgroundColor: SEG.indigo,
                  color: '#fff',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                  flex: 'none',
                }}
              >
                {t.initials}
              </span>
              <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{t.name}</span>
              <span style={{ fontWeight: 800, color: SEG.indigo }}>{t.effortPct}%</span>
            </div>
            <div className={styles.segTrack} style={{ margin: '6px 0 2px' }}>
              <span
                className={styles.seg}
                style={{ width: `${t.effortPct}%`, backgroundColor: SEG.indigo }}
              />
            </div>
            <span style={{ fontSize: 11, color: tokens.colorNeutralForeground3 }}>
              {t.loggedHrs}h logged{t.leaveHrs ? ` · ${t.leaveHrs}h leave` : ''}
            </span>
          </div>
        ))
      )}
      <div
        style={{
          borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
          marginTop: 8,
          paddingTop: 8,
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 12.5,
        }}
      >
        <span>
          Total effort spent{' '}
          <span style={{ color: tokens.colorNeutralForeground3 }}>(Σ Completed Work)</span>
        </span>
        <b>{m.teamLoggedHrs}h</b>
      </div>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginTop: 4 }}
      >
        <span>
          Team time off <span style={{ color: tokens.colorNeutralForeground3 }}>(leave)</span>
        </span>
        <b style={{ color: m.teamLeaveHrs ? SEG.orange : undefined }}>{m.teamLeaveHrs}h</b>
      </div>
    </div>
  );
}

function Burndown({ m }: { m: ProjectReportMetrics }) {
  const styles = useStyles();
  const w = m.weekly;
  const max = Math.max(1, ...w.map((p) => Math.max(p.remainingHrs, p.idealHrs)));
  const line = (sel: (p: WeeklyPoint) => number): string =>
    w.map((p, i) => `${((i + 0.5) / w.length) * 100},${100 - (sel(p) / max) * 92}`).join(' ');
  const burnPerWeek =
    w.length > 1 ? (w[0].remainingHrs - w[w.length - 1].remainingHrs) / (w.length - 1) : 0;
  const wksToGo = burnPerWeek > 0 ? Math.ceil(m.remainingHrs / burnPerWeek) : null;
  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.sectionTitle}>Effort burn-down</span>
        <span style={{ fontSize: 12, color: tokens.colorNeutralForeground3 }}>
          {m.remainingHrs}h left{wksToGo ? ` · ~${wksToGo} wks to go` : ''}
        </span>
      </div>
      <div style={{ fontSize: 11, color: tokens.colorNeutralForeground3, marginBottom: 4 }}>
        {m.analyticsUsed ? 'Live Analytics snapshots' : 'Reconstructed from close dates'} · solid ={' '}
        actual, dashed = ideal pace
      </div>
      <div style={{ position: 'relative', height: 160, marginTop: 8 }}>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ width: '100%', height: '86%' }}
        >
          <polyline
            points={line((p) => p.idealHrs)}
            fill="none"
            stroke="#c8c6c4"
            strokeWidth={1.2}
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            points={line((p) => p.remainingHrs)}
            fill="none"
            stroke={SEG.indigo}
            strokeWidth={1.8}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div style={{ display: 'flex', gap: 6 }}>
          {w.map((p) => (
            <span
              key={p.label}
              style={{
                flex: 1,
                textAlign: 'center',
                fontSize: 10,
                color: tokens.colorNeutralForeground3,
              }}
            >
              {p.label}
            </span>
          ))}
        </div>
      </div>
      <div className={styles.legend} style={{ marginTop: 6 }}>
        <LegendItem color={SEG.indigo} label="Remaining effort" line />
        <LegendItem color="#c8c6c4" label="Ideal burn (on-time pace)" line />
      </div>
    </div>
  );
}

function SignOffPanel({ m }: { m: ProjectReportMetrics }) {
  const styles = useStyles();
  const s = m.signOff;
  const rows: { label: string; value: number }[] = [
    { label: 'Critical / high-priority open', value: s.criticalOpen },
    { label: 'Blocked items', value: s.blockedItems },
    { label: 'Overdue open items', value: s.overdueOpen },
    { label: 'Open bugs', value: s.openBugs },
    { label: 'Pending approvals', value: s.pendingApprovals },
  ];
  const badge =
    s.status === 'Ready'
      ? { bg: '#DFF6DD', fg: '#0e5814' }
      : s.status === 'Blocked'
        ? { bg: '#FDE0E2', fg: '#C0291C' }
        : { bg: '#FBE7C6', fg: '#8a5a00' };
  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.sectionTitle}>Sign-off readiness</span>
        <span
          className={styles.kindBadge}
          style={{ backgroundColor: badge.bg, color: badge.fg }}
        >
          {s.status}
        </span>
      </div>
      {rows.map((r) => (
        <div
          key={r.label}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '9px 0',
            borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
            fontSize: 13,
          }}
        >
          <span style={{ color: r.value > 0 ? SEG.red : '#8a94a6', display: 'inline-flex' }}>
            <WarningRegular />
          </span>
          <span style={{ flex: 1 }}>{r.label}</span>
          <b style={{ color: r.value > 0 ? SEG.red : undefined }}>{r.value}</b>
        </div>
      ))}
    </div>
  );
}

function BlockerLog({ m }: { m: ProjectReportMetrics }) {
  const styles = useStyles();
  const [showAll, setShowAll] = useState(false);
  const blockers = m.openItems.filter((o) => o.kind === 'Blocker');
  const PAGE = 10;
  const shown = showAll ? blockers : blockers.slice(0, PAGE);
  const ageStyle = (d: number): { bg: string; fg: string } =>
    d > 14
      ? { bg: '#FDE0E2', fg: '#C0291C' }
      : d > 7
        ? { bg: '#FBE7C6', fg: '#8a5a00' }
        : { bg: '#EEF1F7', fg: '#605e5c' };
  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.sectionTitle}>
          Blocker log <span style={{ color: tokens.colorNeutralForeground3, fontWeight: 400 }}>· oldest first</span>
        </span>
        {blockers.length > 0 && (
          <span style={{ fontSize: 12, color: tokens.colorNeutralForeground3 }}>
            {blockers.length}
          </span>
        )}
      </div>
      {blockers.length === 0 ? (
        <Text size={200}>No open blockers. 🎉</Text>
      ) : (
        shown.map((o) => {
          const a = ageStyle(o.ageDays);
          return (
            <div
              key={o.id}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                padding: '10px 0',
                borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
              }}
            >
              <span
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 10,
                  backgroundColor: a.bg,
                  color: a.fg,
                  display: 'grid',
                  placeItems: 'center',
                  flex: 'none',
                  lineHeight: 1,
                }}
              >
                <b style={{ fontSize: 15 }}>{o.ageDays}</b>
                <span style={{ fontSize: 8, fontWeight: 700 }}>DAYS</span>
              </span>
              <span style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{o.title}</div>
                <div style={{ fontSize: 11.5, color: tokens.colorNeutralForeground3 }}>
                  {o.owner ?? '—'} · waiting on{' '}
                  <span style={{ color: SEG.blue }}>{o.raisedTo ?? '—'}</span>
                </div>
              </span>
            </div>
          );
        })
      )}
      {blockers.length > PAGE && (
        <Button
          appearance="subtle"
          size="small"
          onClick={() => setShowAll((v) => !v)}
          style={{ marginTop: 8 }}
        >
          {showAll ? 'Show less' : `Show all (${blockers.length})`}
        </Button>
      )}
    </div>
  );
}

function DataQualityPanel({ m }: { m: ProjectReportMetrics }) {
  const styles = useStyles();
  const stale = m.dataQuality.filter((d) => d.issues.some((i) => /stale/i.test(i))).length;
  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.sectionTitle}>
          Data quality — items needing attention{' '}
          <span style={{ color: tokens.colorNeutralForeground3, fontWeight: 400 }}>
            · missing fields or open &amp; not updated &gt;1 day
          </span>
        </span>
        <span style={{ fontSize: 12, color: tokens.colorNeutralForeground3 }}>
          <b style={{ color: SEG.red }}>{m.dataQuality.length}</b> flagged · <b>{stale}</b> stale
        </span>
      </div>
      {m.dataQuality.length === 0 ? (
        <Text size={200}>No data-quality issues found. 🎉</Text>
      ) : (
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Type</th>
                <th className={styles.th}>Work item</th>
                <th className={styles.th}>State</th>
                <th className={styles.th}>Issues</th>
              </tr>
            </thead>
            <tbody>
              {m.dataQuality.map((d) => (
                <tr key={d.id}>
                  <td className={styles.td}>
                    <span className={styles.treeTitle}>
                      <TypeIcon type={d.type} />
                      {d.type}
                    </span>
                  </td>
                  <td className={styles.td}>{d.title}</td>
                  <td className={styles.td}>{d.state}</td>
                  <td className={styles.td}>
                    <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {d.issues.map((iss) => (
                        <span
                          key={iss}
                          className={styles.kindBadge}
                          style={{ backgroundColor: 'var(--pi-danger-bg)', color: 'var(--pi-danger)' }}
                        >
                          {iss}
                        </span>
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ReportBody({ m, epicTitle }: { m: ProjectReportMetrics; epicTitle?: string }) {
  const styles = useStyles();
  return (
    <div className={styles.body}>
      {m.truncated && (
        <Text size={200} style={{ color: 'var(--pi-warn)' }}>
          Showing the {m.total} most recently changed work items; totals may be partial for very
          large projects.
        </Text>
      )}

      <div className={styles.kpis}>
        <Kpi icon={<CodeGlyph />} k="Work items" v={String(m.total)} />
        <Kpi icon={<CheckShieldGlyph />} k="Completed" v={`${m.completionPct}%`} tint="good" />
        <Kpi icon={<PulseGlyph />} k="In progress" v={String(m.inProgress)} />
        <Kpi
          icon={<CalendarGlyph />}
          k="Overdue"
          v={String(m.overdue)}
          tint={m.overdue ? 'danger' : undefined}
        />
        <Kpi
          icon={<StatusGlyph />}
          k="Open blockers"
          v={String(m.blockers)}
          tint={m.blockers ? 'warn' : undefined}
        />
        <Kpi
          icon={<CodeGlyph />}
          k="Open bugs"
          v={String(m.bugs.open)}
          tint={m.bugs.open ? 'warn' : undefined}
        />
      </div>

      <div className={styles.progressWrap}>
        <div className={styles.progressTop}>
          <Text weight="semibold" size={200}>
            Completion
          </Text>
          <Text weight="semibold" size={200}>
            {m.completed} / {m.total} done
          </Text>
        </div>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${m.completionPct}%` }} />
        </div>
      </div>

      <div className={styles.grid2}>
        <SprintsCard m={m} />
        <BugsCard m={m} />
      </div>

      <WorkItemsByType m={m} />

      <div className={styles.panel}>
        <div className={styles.panelTitle}>Work items by state</div>
        <BarList items={m.byState} tint="var(--pi-accent)" />
      </div>

      <div className={styles.grid2}>
        <WeeklyProgress m={m} />
        <EffortNumbers m={m} />
      </div>

      <div className={styles.grid2}>
        <TeamPanel m={m} />
        <Burndown m={m} />
      </div>

      <WorkItemTree rows={m.workItems} title={epicTitle} />

      {m.openItemsTree.length > 0 && (
        <WorkItemTree rows={m.openItemsTree} heading="Open items & clarifications" />
      )}

      <div className={styles.grid2}>
        <SignOffPanel m={m} />
        <BlockerLog m={m} />
      </div>

      <DataQualityPanel m={m} />
    </div>
  );
}

const DONE_STATES = new Set(['closed', 'done', 'completed']);
/** Whether a work-item state counts as done/closed (client-side mirror). */
function isDoneState(state: string): boolean {
  return DONE_STATES.has(state.trim().toLowerCase());
}

/** Ids of rows that have at least one child within the same row set. */
function collapsibleOf(rows: WorkItemRow[]): Set<number> {
  const parents = new Set<number>();
  rows.forEach((r) => {
    if (r.parentId !== undefined) parents.add(r.parentId);
  });
  const s = new Set<number>();
  rows.forEach((r) => {
    if (parents.has(r.id)) s.add(r.id);
  });
  return s;
}

/** Collapsible / expandable work-item tree (Feature → User Story → Task/Bug). */
function WorkItemTree({
  rows,
  title,
  heading = 'Work items',
}: {
  rows: WorkItemRow[];
  title?: string;
  heading?: string;
}) {
  const styles = useStyles();
  const [showClosed, setShowClosed] = useState(false);
  const [fState, setFState] = useState('');
  const [fAssigned, setFAssigned] = useState('');
  const [fIter, setFIter] = useState('');

  const iterLeaf = (it?: string): string => (it ? (it.split('\\').pop() ?? '') : '');

  // Hide fully-closed branches by default: keep a row only if it is open, or has
  // an open descendant (so a done Feature with an open child still shows). The
  // "Show closed" filter turns this off and reveals everything.
  const baseRows = useMemo(() => {
    if (showClosed) return rows;
    const byId = new Map(rows.map((r) => [r.id, r] as const));
    const keep = new Set<number>();
    for (const r of rows) {
      if (isDoneState(r.state)) continue;
      keep.add(r.id);
      let p = r.parentId;
      const guard = new Set<number>();
      while (p !== undefined && byId.has(p) && !guard.has(p)) {
        keep.add(p);
        guard.add(p);
        p = byId.get(p)?.parentId;
      }
    }
    return rows.filter((r) => keep.has(r.id));
  }, [rows, showClosed]);

  // Collapsed by default (like ADO backlogs) — only top-level rows show first.
  const [collapsed, setCollapsed] = useState<Set<number>>(() => collapsibleOf(baseRows));
  useEffect(() => {
    setCollapsed(collapsibleOf(baseRows));
  }, [baseRows]);
  useEffect(() => {
    setShowClosed(false);
    setFState('');
    setFAssigned('');
    setFIter('');
  }, [rows]);

  const options = useMemo(() => {
    const states = new Set<string>();
    const assignees = new Set<string>();
    const iters = new Set<string>();
    baseRows.forEach((r) => {
      if (r.state) states.add(r.state);
      if (r.assignedTo) assignees.add(r.assignedTo);
      const it = iterLeaf(r.iteration);
      if (it) iters.add(it);
    });
    const sort = (s: Set<string>): string[] => [...s].sort((a, b) => a.localeCompare(b));
    return { states: sort(states), assignees: sort(assignees), iters: sort(iters) };
  }, [baseRows]);

  const parentOf = useMemo(() => {
    const m = new Map<number, number | undefined>();
    baseRows.forEach((r) => m.set(r.id, r.parentId));
    return m;
  }, [baseRows]);

  const hasChildren = useMemo(() => {
    const ids = new Set(baseRows.map((r) => r.id));
    const s = new Set<number>();
    baseRows.forEach((r) => {
      if (r.parentId !== undefined && ids.has(r.parentId)) s.add(r.parentId);
    });
    return s;
  }, [baseRows]);

  const filtering = !!(fState || fAssigned || fIter);

  // When filtering, keep matches + their ancestors (for tree context), expanded.
  const viewRows = useMemo(() => {
    if (!filtering) return baseRows;
    const byId = new Map(baseRows.map((r) => [r.id, r] as const));
    const matches = (r: WorkItemRow): boolean =>
      (!fState || r.state === fState) &&
      (!fAssigned || r.assignedTo === fAssigned) &&
      (!fIter || iterLeaf(r.iteration) === fIter);
    const keep = new Set<number>();
    for (const r of baseRows) {
      if (!matches(r)) continue;
      keep.add(r.id);
      let p = r.parentId;
      const guard = new Set<number>();
      while (p !== undefined && byId.has(p) && !guard.has(p)) {
        keep.add(p);
        guard.add(p);
        p = byId.get(p)?.parentId;
      }
    }
    return baseRows.filter((r) => keep.has(r.id));
  }, [baseRows, fState, fAssigned, fIter, filtering]);

  const isHidden = (r: WorkItemRow): boolean => {
    if (filtering) return false;
    let p = r.parentId;
    const guard = new Set<number>();
    while (p !== undefined && !guard.has(p)) {
      guard.add(p);
      if (collapsed.has(p)) return true;
      p = parentOf.get(p);
    }
    return false;
  };

  const toggle = (id: number): void =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Expand one level: reveal the shallowest currently-collapsed (but visible) row(s).
  const expandOneLevel = (): void => {
    const candidates = baseRows.filter(
      (r) => hasChildren.has(r.id) && collapsed.has(r.id) && !isHidden(r),
    );
    if (candidates.length === 0) return;
    const minDepth = Math.min(...candidates.map((r) => r.depth));
    const ids = candidates.filter((r) => r.depth === minDepth).map((r) => r.id);
    setCollapsed((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  };

  // Collapse one level: hide the deepest currently-expanded (visible) row(s).
  const collapseOneLevel = (): void => {
    const candidates = baseRows.filter(
      (r) => hasChildren.has(r.id) && !collapsed.has(r.id) && !isHidden(r),
    );
    if (candidates.length === 0) return;
    const maxDepth = Math.max(...candidates.map((r) => r.depth));
    const ids = candidates.filter((r) => r.depth === maxDepth).map((r) => r.id);
    setCollapsed((prev) => new Set([...prev, ...ids]));
  };

  const canExpand = baseRows.some(
    (r) => hasChildren.has(r.id) && collapsed.has(r.id) && !isHidden(r),
  );
  const canCollapse = baseRows.some(
    (r) => hasChildren.has(r.id) && !collapsed.has(r.id) && !isHidden(r),
  );
  const visible = viewRows.filter((r) => !isHidden(r));

  const fmtNum = (n?: number): string => (n !== undefined ? String(n) : '—');
  const fmtDate = (d?: string): string => (d ? formatIsoDateForDisplay(d) : '—');

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className={styles.headerToggle}
          disabled={filtering || !canExpand}
          title="Expand one level"
          aria-label="Expand one level"
          onClick={expandOneLevel}
        >
          +
        </button>
        <button
          type="button"
          className={styles.headerToggle}
          disabled={filtering || !canCollapse}
          title="Collapse one level"
          aria-label="Collapse one level"
          onClick={collapseOneLevel}
        >
          −
        </button>
        <div className={styles.panelTitle} style={{ marginBottom: 0 }}>
          {heading}
          {title ? ` · ${title}` : ''} ({viewRows.length})
        </div>
      </div>

      <div className={styles.filterBar}>
        <select
          className={styles.filterSelect}
          value={fState}
          onChange={(e) => setFState(e.target.value)}
          aria-label="Filter by state"
        >
          <option value="">All states</option>
          {options.states.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select
          className={styles.filterSelect}
          value={fAssigned}
          onChange={(e) => setFAssigned(e.target.value)}
          aria-label="Filter by assignee"
        >
          <option value="">All assignees</option>
          {options.assignees.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select
          className={styles.filterSelect}
          value={fIter}
          onChange={(e) => setFIter(e.target.value)}
          aria-label="Filter by iteration"
        >
          <option value="">All iterations</option>
          {options.iters.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        {filtering && (
          <Button
            appearance="subtle"
            size="small"
            onClick={() => {
              setFState('');
              setFAssigned('');
              setFIter('');
            }}
          >
            Clear filters
          </Button>
        )}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: tokens.colorNeutralForeground3,
            cursor: 'pointer',
            marginLeft: 'auto',
          }}
        >
          <input
            type="checkbox"
            checked={showClosed}
            onChange={(e) => setShowClosed(e.target.checked)}
          />
          Show closed
        </label>
      </div>

      <div className={styles.tableScroll} style={{ marginTop: 8 }}>
        <table className={styles.table} style={{ minWidth: 1240 }}>
          <thead>
            <tr>
              <th className={styles.th}>ID</th>
              <th className={styles.th}>Type</th>
              <th className={styles.th}>Title</th>
              <th className={styles.th}>State</th>
              <th className={styles.th}>Assigned</th>
              <th className={styles.th}>Start</th>
              <th className={styles.th}>Due / Target</th>
              <th className={styles.th}>Revised</th>
              <th className={styles.th}>Rev #</th>
              <th className={styles.th}>Orig Est</th>
              <th className={styles.th}>Rem</th>
              <th className={styles.th}>Done</th>
              <th className={styles.th}>Iteration</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((w) => {
              const expandable = !filtering && hasChildren.has(w.id);
              const isCollapsed = collapsed.has(w.id);
              const dueTarget = w.type === 'Feature' ? w.targetDate : w.dueDate;
              return (
                <tr key={w.id}>
                  <td className={styles.td}>{w.id}</td>
                  <td className={styles.td}>
                    <span className={styles.treeTitle}>
                      <TypeIcon type={w.type} />
                      <span
                        className={styles.typeTag}
                        style={{ color: TYPE_TAG_COLOR[w.type] ?? undefined }}
                      >
                        {w.type}
                      </span>
                    </span>
                  </td>
                  <td
                    className={styles.td}
                    style={{ paddingLeft: 12 + (filtering ? 0 : w.depth * 20) }}
                  >
                    <span className={styles.treeTitle}>
                      {expandable ? (
                        <button
                          type="button"
                          className={styles.treeChevron}
                          aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                          onClick={() => toggle(w.id)}
                        >
                          {isCollapsed ? <ChevronRightRegular /> : <ChevronDownRegular />}
                        </button>
                      ) : (
                        !filtering && w.depth > 0 && <span className={styles.treeGuide}>└─</span>
                      )}
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {w.title}
                      </span>
                    </span>
                  </td>
                  <td className={styles.td}>{w.state}</td>
                  <td className={styles.td}>{w.assignedTo ?? '—'}</td>
                  <td className={styles.td}>{fmtDate(w.startDate)}</td>
                  <td
                    className={styles.td}
                    style={{ color: w.overdue ? 'var(--pi-danger)' : undefined }}
                  >
                    {fmtDate(dueTarget)}
                  </td>
                  <td className={styles.td} style={{ color: w.revisedDate ? 'var(--pi-warn)' : undefined }}>
                    {fmtDate(w.revisedDate)}
                  </td>
                  <td className={styles.td}>{w.revisedCount ? w.revisedCount : '—'}</td>
                  <td className={styles.td}>{fmtNum(w.originalEstimate)}</td>
                  <td className={styles.td}>{fmtNum(w.remainingWork)}</td>
                  <td className={styles.td}>{fmtNum(w.completedWork)}</td>
                  <td className={styles.td}>{iterLeaf(w.iteration) || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({
  icon,
  k,
  v,
  tint,
}: {
  icon: ReactNode;
  k: string;
  v: string;
  tint?: 'good' | 'warn' | 'danger';
}) {
  const styles = useStyles();
  const tintStyle =
    tint === 'good'
      ? { backgroundColor: 'var(--pi-good-bg)', color: 'var(--pi-good)' }
      : tint === 'warn'
        ? { backgroundColor: 'var(--pi-warn-bg)', color: 'var(--pi-warn)' }
        : tint === 'danger'
          ? { backgroundColor: 'var(--pi-danger-bg)', color: 'var(--pi-danger)' }
          : undefined;
  return (
    <div className={styles.kpi}>
      <div className={styles.kpiIcon} style={tintStyle}>
        {icon}
      </div>
      <div>
        <span className={styles.kpiK}>{k}</span>
        <span className={styles.kpiV}>{v}</span>
      </div>
    </div>
  );
}

export function ProjectReport({ services }: { services: AppServices }) {
  const styles = useStyles();
  const { status, metrics, error, refresh } = useProjectReport(services);

  return (
    <div className={styles.card} role="group" aria-label="Project Health">
      <div className={styles.header}>
        <div className={styles.glyph}>
          <StatusGlyph />
        </div>
        <div>
          <Text className={styles.title} block>
            Project Health
          </Text>
          <span className={styles.caption}>
            Live delivery metrics from Azure Boards
            {metrics ? ` · as of ${formatTimestampForDisplay(metrics.asOf)}` : ''}
          </span>
        </div>
        <div className={styles.spacer} />
        <Button
          appearance="subtle"
          icon={<ArrowClockwiseRegular />}
          disabled={status === 'loading'}
          onClick={refresh}
        >
          Refresh
        </Button>
      </div>

      {status === 'loading' && (
        <div className={styles.center}>
          <Spinner label="Loading project health…" />
        </div>
      )}
      {status === 'error' && (
        <div className={styles.center}>
          <Text style={{ color: 'var(--pi-danger)' }}>{error}</Text>
        </div>
      )}
      {status === 'loaded' && metrics && <ReportBody m={metrics} />}
    </div>
  );
}
