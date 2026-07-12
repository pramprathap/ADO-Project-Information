import { useEffect } from 'react';
import { useVlDark, vlCanvasClass } from './vlTheme';

const NAVY = '#323F7C';
const ORANGE = '#F47C20';

function ensureKeyframes(): void {
  if (document.getElementById('vl-progress-kf')) return;
  const style = document.createElement('style');
  style.id = 'vl-progress-kf';
  style.textContent = `
@keyframes vlStripes { from { background-position: 0 0; } to { background-position: 28px 0; } }
@keyframes vlPulse { 0%,100% { opacity: .55; } 50% { opacity: 1; } }
`;
  document.head.appendChild(style);
}

/** Branded animated progress bar used while org-wide data streams in. */
export function ProgressLoader({ done, total, label }: { done: number; total: number; label: string }) {
  useEffect(ensureKeyframes, []);
  const dark = useVlDark();
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className={vlCanvasClass(dark)} style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--vl-page)', fontFamily: '"Segoe UI","Open Sans",system-ui,sans-serif' }}>
      <div style={{ background: 'var(--vl-card)', border: '1px solid var(--vl-line)', borderRadius: 12, boxShadow: '0 4px 18px rgba(16,24,64,.10)', padding: '26px 30px', width: 420, maxWidth: '86vw' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <span style={{ font: '700 14px "Open Sans",sans-serif', color: dark ? '#9daaf0' : NAVY }}>{label}</span>
          <span style={{ font: '800 16px "Open Sans",sans-serif', color: ORANGE }}>{pct}%</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--vl-sub)', marginBottom: 12, animation: 'vlPulse 1.6s ease-in-out infinite' }}>
          {total > 0 ? `Scanning project ${Math.min(done + 1, total)} of ${total}…` : 'Connecting to Azure DevOps…'}
        </div>
        <div style={{ height: 12, borderRadius: 999, background: 'var(--vl-track2)', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${Math.max(4, pct)}%`,
              borderRadius: 999,
              transition: 'width .35s ease',
              backgroundImage: `linear-gradient(90deg, ${NAVY}, ${ORANGE}), linear-gradient(45deg, rgba(255,255,255,.22) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.22) 50%, rgba(255,255,255,.22) 75%, transparent 75%, transparent)`,
              backgroundBlendMode: 'overlay',
              backgroundSize: '100% 100%, 28px 28px',
              animation: 'vlStripes .7s linear infinite',
            }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10, color: 'var(--vl-faint)' }}>
          <span>Azure Boards · live data</span>
          <span>
            {done}/{total || '…'} projects
          </span>
        </div>
      </div>
    </div>
  );
}
