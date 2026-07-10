import { makeStyles, tokens, Text } from '@fluentui/react-components';
import type { ProjectInformation } from '@/models/ProjectInformation';
import { DocGlyph } from './icons';
import { PROJECT_HEALTH_OPTIONS, PROJECT_PHASE_OPTIONS } from '@/constants/dropdownOptions';

const useStyles = makeStyles({
  hero: {
    position: 'relative',
    overflow: 'hidden',
    marginBottom: tokens.spacingVerticalL,
    padding: '26px 28px',
    borderRadius: '18px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    backgroundImage:
      'radial-gradient(1100px 300px at 0% -40%, var(--pi-hero-from), transparent 60%)',
    boxShadow: 'var(--pi-shadow-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '24px',
    flexWrap: 'wrap',
    '::before': {
      content: '""',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: '4px',
      background: 'linear-gradient(90deg, var(--pi-good), var(--pi-accent-2))',
    },
  },
  eyebrow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    color: 'var(--pi-accent)',
    fontWeight: 600,
    fontSize: '12px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 'clamp(24px, 3vw, 32px)',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    margin: '10px 0 6px',
    textWrap: 'balance',
  },
  desc: { color: tokens.colorNeutralForeground2, margin: '0 0 14px', maxWidth: '60ch' },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalSNudge,
    padding: '7px 14px',
    borderRadius: '999px',
    backgroundColor: 'var(--pi-accent-soft)',
    color: 'var(--pi-accent)',
    fontWeight: 600,
  },
  chipDot: { width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'currentColor' },
  gauge: { display: 'flex', alignItems: 'center', gap: '16px' },
  ring: {
    width: '96px',
    height: '96px',
    borderRadius: '50%',
    flex: 'none',
    display: 'grid',
    placeItems: 'center',
    position: 'relative',
    '::after': {
      content: '""',
      position: 'absolute',
      inset: '9px',
      borderRadius: '50%',
      backgroundColor: tokens.colorNeutralBackground1,
    },
  },
  ringLabel: { position: 'relative', zIndex: 1, fontSize: '12px', fontWeight: 700 },
  gLabel: {
    fontSize: '12px',
    color: tokens.colorNeutralForeground3,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  gVal: { fontSize: '18px', fontWeight: 700 },
});

const HEALTH_COLOR: Record<string, string> = {
  Green: 'var(--pi-good)',
  Amber: 'var(--pi-warn)',
  Red: 'var(--pi-danger)',
};

const HEALTH_PERCENT: Record<string, number> = { Green: 90, Amber: 55, Red: 22 };

const HEALTH_CAPTION: Record<string, string> = {
  Green: 'ON TRACK',
  Amber: 'AT RISK',
  Red: 'CRITICAL',
};

function label<T extends string>(options: { value: T; label: string }[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? '—';
}

export function Hero({ projectName, info }: { projectName: string; info: ProjectInformation }) {
  const styles = useStyles();
  const health = info.projectHealth || '';
  const color = HEALTH_COLOR[health] ?? 'var(--pi-ring-track)';
  const percent = HEALTH_PERCENT[health] ?? 0;

  return (
    <div className={styles.hero}>
      <div>
        <div className={styles.eyebrow}>
          <DocGlyph />
          Project Settings · Delivery Record
        </div>
        <Text as="h1" block className={styles.title}>
          Project Information
        </Text>
        <Text as="p" block className={styles.desc}>
          A single, governed home for the client, ownership, timeline and delivery health of this
          Azure DevOps project.
        </Text>
        <span className={styles.chip}>
          <span className={styles.chipDot} />
          {projectName}
        </span>
      </div>

      <div className={styles.gauge}>
        <div
          className={styles.ring}
          style={{ background: `conic-gradient(${color} ${percent}%, var(--pi-ring-track) 0)` }}
        >
          <span className={styles.ringLabel} style={{ color }}>
            {health ? HEALTH_CAPTION[health] : '—'}
          </span>
        </div>
        <div>
          <div className={styles.gLabel}>Overall health</div>
          <div className={styles.gVal} style={{ color }}>
            {health ? label(PROJECT_HEALTH_OPTIONS, health) : '—'}
          </div>
          <div className={styles.gLabel} style={{ marginTop: '8px' }}>
            Phase
          </div>
          <div className={styles.gVal}>
            {info.currentPhase ? label(PROJECT_PHASE_OPTIONS, info.currentPhase) : '—'}
          </div>
        </div>
      </div>
    </div>
  );
}
