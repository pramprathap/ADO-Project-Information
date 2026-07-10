import { makeStyles, tokens } from '@fluentui/react-components';

const useStyles = makeStyles({
  avatar: {
    borderRadius: '50%',
    flex: 'none',
    display: 'grid',
    placeItems: 'center',
    color: '#ffffff',
    fontWeight: 700,
    lineHeight: 1,
    boxShadow: tokens.shadow4,
  },
});

// Deterministic gradient pairs; index chosen from the identity key so a given
// person always gets the same colours.
const GRADIENTS: [string, string][] = [
  ['#1a9c53', '#0b6a3a'],
  ['#8250df', '#5a34b0'],
  ['#c98a00', '#946400'],
  ['#0a7ea4', '#075066'],
  ['#c2410c', '#8a2d08'],
  ['#3a6ff0', '#274db0'],
  ['#b3245e', '#7c1943'],
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function pickGradient(key: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return GRADIENTS[hash % GRADIENTS.length];
}

interface GradientAvatarProps {
  name: string;
  /** Stable key (e.g. descriptor) used to pick a consistent colour. */
  colorKey?: string;
  size?: number;
  imageUrl?: string;
}

export function GradientAvatar({ name, colorKey, size = 30, imageUrl }: GradientAvatarProps) {
  const styles = useStyles();
  const [from, to] = pickGradient(colorKey ?? name);
  return (
    <div
      className={styles.avatar}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        background: imageUrl ? undefined : `linear-gradient(135deg, ${from}, ${to})`,
      }}
      aria-hidden
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
        />
      ) : (
        initials(name)
      )}
    </div>
  );
}
