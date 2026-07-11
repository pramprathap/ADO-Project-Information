import type { ReactNode } from 'react';
import { makeStyles, tokens } from '@fluentui/react-components';
import type { ProjectInformation } from '@/models/ProjectInformation';
import { PROJECT_STATUS_OPTIONS, PROJECT_HEALTH_OPTIONS } from '@/constants/dropdownOptions';
import { formatIsoDateForDisplay } from '@/utils/dateUtils';
import { GradientAvatar } from './GradientAvatar';
import { PulseGlyph, CheckShieldGlyph, PersonGlyph, TeamGlyph, CalendarGlyph } from './icons';

const useStyles = makeStyles({
  strip: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalL,
  },
  stat: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    alignItems: 'center',
    padding: '14px 16px',
    borderRadius: '14px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: 'var(--pi-shadow-sm)',
  },
  ic: {
    width: '38px',
    height: '38px',
    borderRadius: '11px',
    flex: 'none',
    display: 'grid',
    placeItems: 'center',
    backgroundColor: 'var(--pi-accent-soft)',
    color: 'var(--pi-accent)',
  },
  icGood: { backgroundColor: 'var(--pi-good-bg)', color: 'var(--pi-good)' },
  icTeal: {
    backgroundColor: 'color-mix(in srgb, var(--pi-accent-2) 16%, transparent)',
    color: 'var(--pi-accent-2)',
  },
  k: {
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: tokens.colorNeutralForeground3,
    display: 'block',
  },
  v: { fontWeight: 700, fontSize: '15px' },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '2px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 700,
  },
  pdot: { width: '7px', height: '7px', borderRadius: '50%', backgroundColor: 'currentColor' },
  mini: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalSNudge },
  miniName: { fontWeight: 700, fontSize: '13px' },
});

const HEALTH_STYLE: Record<string, { bg: string; fg: string }> = {
  Green: { bg: 'var(--pi-good-bg)', fg: 'var(--pi-good)' },
  Amber: { bg: 'var(--pi-warn-bg)', fg: 'var(--pi-warn)' },
  Red: { bg: 'var(--pi-danger-bg)', fg: 'var(--pi-danger)' },
};

function label<T extends string>(options: { value: T; label: string }[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? '—';
}

export function StatStrip({ info }: { info: ProjectInformation }) {
  const styles = useStyles();
  const health = info.projectHealth || '';
  const hs = HEALTH_STYLE[health];

  return (
    <div className={styles.strip} role="group" aria-label="Project summary">
      <Tile icon={<PulseGlyph />} k="Status">
        <span className={styles.v}>{label(PROJECT_STATUS_OPTIONS, info.projectStatus)}</span>
      </Tile>

      <Tile
        icon={<CheckShieldGlyph />}
        k="Health"
        iconClass={styles.icGood}
        background={hs?.bg}
        borderColor={hs ? hs.fg : undefined}
      >
        {hs ? (
          <span className={styles.pill} style={{ backgroundColor: hs.bg, color: hs.fg }}>
            <span className={styles.pdot} />
            {label(PROJECT_HEALTH_OPTIONS, health)}
          </span>
        ) : (
          <span className={styles.v}>—</span>
        )}
      </Tile>

      <Tile icon={<PersonGlyph />} k="Project Manager / Lead">
        {info.projectManager ? (
          <span className={styles.mini}>
            <GradientAvatar
              name={info.projectManager.displayName}
              colorKey={info.projectManager.descriptor}
              imageUrl={info.projectManager.imageUrl}
              size={28}
            />
            <span className={styles.miniName}>{info.projectManager.displayName}</span>
          </span>
        ) : (
          <span className={styles.v}>—</span>
        )}
      </Tile>

      <Tile icon={<TeamGlyph />} k="Delivery Manager">
        {info.deliveryManager ? (
          <span className={styles.mini}>
            <GradientAvatar
              name={info.deliveryManager.displayName}
              colorKey={info.deliveryManager.descriptor}
              imageUrl={info.deliveryManager.imageUrl}
              size={28}
            />
            <span className={styles.miniName}>{info.deliveryManager.displayName}</span>
          </span>
        ) : (
          <span className={styles.v}>—</span>
        )}
      </Tile>

      <Tile icon={<CalendarGlyph />} k="Planned End" iconClass={styles.icTeal}>
        <span className={styles.v}>{formatIsoDateForDisplay(info.plannedEndDate)}</span>
      </Tile>
    </div>
  );

  function Tile({
    icon,
    k,
    iconClass,
    background,
    borderColor,
    children,
  }: {
    icon: ReactNode;
    k: string;
    iconClass?: string;
    background?: string;
    borderColor?: string;
    children: ReactNode;
  }) {
    return (
      <div className={styles.stat} style={background ? { background, borderColor } : undefined}>
        <div className={`${styles.ic} ${iconClass ?? ''}`}>{icon}</div>
        <div>
          <span className={styles.k}>{k}</span>
          {children}
        </div>
      </div>
    );
  }
}
