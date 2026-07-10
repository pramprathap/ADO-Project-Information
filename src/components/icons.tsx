/**
 * Small, dependency-free monoline SVG glyphs used for section headers, the hero
 * and the stat strip. Inlined (rather than depending on icon-name exports) so
 * they render identically to the approved design and never break the build.
 */
interface GlyphProps {
  size?: number;
}

function svgProps(size: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
}

export function IdentificationGlyph({ size = 18 }: GlyphProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
      <circle cx="12" cy="11" r="3" />
    </svg>
  );
}

export function OwnershipGlyph({ size = 18 }: GlyphProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function TimelineGlyph({ size = 18 }: GlyphProps) {
  return (
    <svg {...svgProps(size)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function StatusGlyph({ size = 18 }: GlyphProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M3 3v18h18" />
      <path d="m19 9-5 5-4-4-3 3" />
    </svg>
  );
}

export function MailGlyph({ size = 18 }: GlyphProps) {
  return (
    <svg {...svgProps(size)}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

export function CodeGlyph({ size = 18 }: GlyphProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />
    </svg>
  );
}

export function PulseGlyph({ size = 18 }: GlyphProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

export function CheckShieldGlyph({ size = 18 }: GlyphProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="m22 4-10 10-3-3" />
    </svg>
  );
}

export function PersonGlyph({ size = 18 }: GlyphProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export function TeamGlyph({ size = 18 }: GlyphProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    </svg>
  );
}

export function CalendarGlyph({ size = 18 }: GlyphProps) {
  return (
    <svg {...svgProps(size)}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

export function DocGlyph({ size = 15 }: GlyphProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M4 19V5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
      <path d="M14 3v6h6" />
    </svg>
  );
}
