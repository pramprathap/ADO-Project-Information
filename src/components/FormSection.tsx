import type { ReactNode } from 'react';
import { makeStyles, tokens, Text } from '@fluentui/react-components';

export type GlyphTint = 'blue' | 'teal' | 'green' | 'amber' | 'violet';

const useStyles = makeStyles({
  // Exactly three column stacks on wide screens; each column is an independent
  // vertical stack so cards pack tightly with no cross-column gaps. Collapses to
  // two then one column as the viewport narrows.
  sections: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    alignItems: 'start',
    gap: tokens.spacingHorizontalL,
    marginBottom: tokens.spacingVerticalL,
    '@media (max-width: 1200px)': {
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    },
    '@media (max-width: 760px)': {
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
    boxSizing: 'border-box',
    overflow: 'visible',
    backgroundColor: tokens.colorNeutralBackground1,
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
    // Flex-wrap (not grid) so rows always size to their tallest field and can
    // never collapse/overlap. Each field grows to fill, wrapping at ~220px.
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    columnGap: tokens.spacingHorizontalL,
    rowGap: tokens.spacingVerticalM,
    padding: '20px',
    '> *': {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: '220px',
      minWidth: 0,
    },
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
    <div className={styles.card} role="group" aria-label={title}>
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
    </div>
  );
}

/** Three-column container for section cards. */
export function Sections({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <div className={styles.sections}>{children}</div>;
}

/** A single vertical stack (one of the three columns). */
export function Column({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <div className={styles.column}>{children}</div>;
}

/** Field wrapper that spans the full width of a section's inner (flex) row. */
export function FullWidthField({ children }: { children: ReactNode }) {
  return <div style={{ flexBasis: '100%', width: '100%' }}>{children}</div>;
}
