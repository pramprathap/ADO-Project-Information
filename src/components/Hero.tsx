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
    fontSize: 'clamp(26px, 3.4vw, 38px)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    margin: '8px 0 4px',
    textWrap: 'balance',
  },
  subtitle: {
    color: tokens.colorNeutralForeground2,
    fontSize: '14px',
    fontWeight: 600,
    letterSpacing: '0.02em',
  },
  gauge: { display: 'flex', alignItems: 'center', gap: '16px' },
  ring: {
    width: '84px',
    height: '84px',
    borderRadius: '50%',
    flex: 'none',
    display: 'grid',
    placeItems: 'center',
    textAlign: 'center',
    padding: '6px',
    boxSizing: 'border-box',
  },
  ringLabel: { fontSize: '12px', fontWeight: 800, color: '#ffffff', lineHeight: 1.1 },
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

  return (
    <div className={styles.hero}>
      <div>
        <div className={styles.eyebrow}>
          <DocGlyph />
          Project Settings · Delivery Record
        </div>
        <Text as="h1" block className={styles.title}>
          {projectName}
        </Text>
        <Text as="p" block className={styles.subtitle}>
          Project Information
        </Text>
      </div>

      <div className={styles.gauge}>
        {/* Single solid colour reflecting overall health (no progress-style arc). */}
        <div className={styles.ring} style={{ backgroundColor: color }}>
          <span className={styles.ringLabel}>{health ? HEALTH_CAPTION[health] : '—'}</span>
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
