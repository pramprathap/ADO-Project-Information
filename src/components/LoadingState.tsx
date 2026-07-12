import { useEffect } from 'react';
import { tokens } from '@fluentui/react-components';

interface LoadingStateProps {
  label?: string;
}

const NAVY = '#323F7C';
const ORANGE = '#F47C20';

/** Inject the loader keyframes once (shared with ProgressLoader). */
function ensureLoaderKeyframes(): void {
  if (document.getElementById('vl-progress-kf')) return;
  const style = document.createElement('style');
  style.id = 'vl-progress-kf';
  style.textContent = `
@keyframes vlStripes { from { background-position: 0 0; } to { background-position: 28px 0; } }
@keyframes vlPulse { 0%,100% { opacity: .55; } 50% { opacity: 1; } }
`;
  document.head.appendChild(style);
}

/**
 * Branded loading card — the SAME visual as the org pages' ProgressLoader
 * (navy→orange striped bar), but indeterminate. Theme-aware via Fluent tokens
 * so it reads correctly on the project-scoped (token-themed) pages too.
 */
export function LoadingState({ label = 'Loading…' }: LoadingStateProps) {
  useEffect(ensureLoaderKeyframes, []);
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'grid',
        placeItems: 'center',
        minHeight: '260px',
        padding: '48px',
      }}
    >
      <div
        style={{
          background: tokens.colorNeutralBackground1,
          border: `1px solid ${tokens.colorNeutralStroke2}`,
          borderRadius: 12,
          boxShadow: '0 4px 18px rgba(16,24,64,.10)',
          padding: '26px 30px',
          width: 420,
          maxWidth: '86vw',
          fontFamily: '"Segoe UI","Open Sans",system-ui,sans-serif',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <span style={{ font: '700 14px "Open Sans",sans-serif', color: tokens.colorNeutralForeground1 }}>{label}</span>
          <span style={{ font: '800 16px "Open Sans",sans-serif', color: ORANGE }}>…</span>
        </div>
        <div
          style={{
            fontSize: 11,
            color: tokens.colorNeutralForeground3,
            marginBottom: 12,
            animation: 'vlPulse 1.6s ease-in-out infinite',
          }}
        >
          Fetching live data from Azure Boards…
        </div>
        <div style={{ height: 12, borderRadius: 999, background: tokens.colorNeutralBackground4, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: '100%',
              borderRadius: 999,
              backgroundImage: `linear-gradient(90deg, ${NAVY}, ${ORANGE}), linear-gradient(45deg, rgba(255,255,255,.22) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.22) 50%, rgba(255,255,255,.22) 75%, transparent 75%, transparent)`,
              backgroundBlendMode: 'overlay',
              backgroundSize: '100% 100%, 28px 28px',
              animation: 'vlStripes .7s linear infinite',
            }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10, color: tokens.colorNeutralForeground3 }}>
          <span>Azure Boards · live data</span>
          <span>working…</span>
        </div>
      </div>
    </div>
  );
}
