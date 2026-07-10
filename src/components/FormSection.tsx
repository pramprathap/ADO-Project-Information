import type { ReactNode } from 'react';
import { Card, makeStyles, tokens, Text } from '@fluentui/react-components';

export type GlyphTint = 'blue' | 'teal' | 'green' | 'amber' | 'violet';

const useStyles = makeStyles({
  columns: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    alignItems: 'start',
    gap: tokens.spacingHorizontalL,
    marginBottom: tokens.spacingVerticalL,
    '@media (max-width: 960px)': {
      gridTemplateColumns: '1fr',
    },
  },
  column: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    minWidth: 0,
  },
  card: {
    width: '100%',
    padding: 0,
    borderRadius: '16px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    boxShadow: 'var(--pi-shadow-sm)',
    transitionProperty: 'transform, box-shadow, border-color',
    transitionDuration: '180ms',
    transitionTimingFunction: 'ease',
    ':hover': {
      transform: 'translateY(-2px)',
      boxShadow: 'var(--pi-shadow-md)',
      border: `1px solid ${tokens.colorNeutralStroke1}`,
    },
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '0ms',
      ':hover': { transform: 'none' },
    },
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: '16px 20px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  glyph: {
    width: '34px',
    height: '34px',
    borderRadius: '10px',
    flex: 'none',
    display: 'grid',
    placeItems: 'center',
  },
  title: { fontSize: '15.5px', fontWeight: 700, letterSpacing: '-0.01em' },
  caption: { fontSize: '12px', color: tokens.colorNeutralForeground3, display: 'block' },
  body: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    padding: '20px',
  },
  tBlue: { backgroundColor: 'var(--pi-accent-soft)', color: 'var(--pi-accent)' },
  tTeal: {
    backgroundColor: 'color-mix(in srgb, var(--pi-accent-2) 16%, transparent)',
    color: 'var(--pi-accent-2)',
  },
  tGreen: { backgroundColor: 'var(--pi-good-bg)', color: 'var(--pi-good)' },
  tAmber: { backgroundColor: 'var(--pi-warn-bg)', color: 'var(--pi-warn)' },
  tViolet: { backgroundColor: 'var(--pi-violet-bg)', color: 'var(--pi-violet)' },
});

interface FormSectionProps {
  title: string;
  caption?: string;
  glyph?: ReactNode;
  tint?: GlyphTint;
  children: ReactNode;
}

export function FormSection({ title, caption, glyph, tint = 'blue', children }: FormSectionProps) {
  const styles = useStyles();
  const tintClass = {
    blue: styles.tBlue,
    teal: styles.tTeal,
    green: styles.tGreen,
    amber: styles.tAmber,
    violet: styles.tViolet,
  }[tint];

  return (
    <Card className={styles.card} role="group" aria-label={title}>
      <div className={styles.header}>
        {glyph && <div className={`${styles.glyph} ${tintClass}`}>{glyph}</div>}
        <div>
          <Text className={styles.title} block>
            {title}
          </Text>
          {caption && <span className={styles.caption}>{caption}</span>}
        </div>
      </div>
      <div className={styles.body}>{children}</div>
    </Card>
  );
}

/** Two independent, side-by-side column stacks (stacks vertically on narrow screens). */
export function Columns({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <div className={styles.columns}>{children}</div>;
}

/** A single vertical stack of section cards within {@link Columns}. */
export function Column({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <div className={styles.column}>{children}</div>;
}

/** Field wrapper that spans the full width of a section's inner grid. */
export function FullWidthField({ children }: { children: ReactNode }) {
  return <div style={{ gridColumn: '1 / -1' }}>{children}</div>;
}
