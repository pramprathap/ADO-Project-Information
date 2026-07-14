import { useEffect, useState } from 'react';

/**
 * Theme support for the portfolio (org-level) pages.
 *
 * The pages are styled with `--vl-*` CSS variables declared on the `.vl-canvas`
 * wrapper; `.vl-dark` swaps the surface palette. Brand/status colours (navy,
 * orange, RAG greens/reds, pastel chips) intentionally stay fixed. Print always
 * forces the light palette so the Weekly Status PDF stays a white report.
 */
export function ensureVlThemeCss(): void {
  if (document.getElementById('vl-theme-css')) return;
  const style = document.createElement('style');
  style.id = 'vl-theme-css';
  style.textContent = `
.vl-canvas{
  color-scheme: light;
  --vl-page:#eef0f4; --vl-card:#ffffff; --vl-soft:#faf9f8; --vl-soft2:#f5f6fb;
  --vl-navySoft:#eef2fb; --vl-ink:#252423; --vl-ink2:#323130; --vl-sub:#605e5c;
  --vl-faint:#a19f9d; --vl-line:#ececf1; --vl-line2:#f3f2f1;
  --vl-borderStrong:#c8c6c4; --vl-track:#edebe9; --vl-track2:#f0eff5;
  --vl-hover:#fff7f0; --vl-goodSoft:#f7fbf8; --vl-goodBorder:#cfe9d4;
  --vl-brandText:#323F7C;
}
.vl-canvas.vl-dark{
  color-scheme: dark;
  --vl-page:#16181f; --vl-card:#20242e; --vl-soft:#282c38; --vl-soft2:#262b3a;
  --vl-navySoft:#273052; --vl-ink:#f2f3f6; --vl-ink2:#e5e7ec; --vl-sub:#b8bdc9;
  --vl-faint:#8b91a1; --vl-line:#343947; --vl-line2:#2e3340;
  --vl-borderStrong:#4b5162; --vl-track:#3a4152; --vl-track2:#333a4b;
  --vl-hover:#2d3242; --vl-goodSoft:#223028; --vl-goodBorder:#2f4a38;
  --vl-brandText:#9daaf0;
}
.vl-canvas .vl-row:hover{ background: var(--vl-hover) !important; }
@keyframes vlSpin { to { transform: rotate(360deg); } }
@media print {
  .vl-canvas, .vl-canvas.vl-dark{
    color-scheme: light;
    --vl-page:#ffffff; --vl-card:#ffffff; --vl-soft:#faf9f8; --vl-soft2:#f5f6fb;
    --vl-navySoft:#eef2fb; --vl-ink:#252423; --vl-ink2:#323130; --vl-sub:#605e5c;
    --vl-faint:#a19f9d; --vl-line:#ececf1; --vl-line2:#f3f2f1;
    --vl-borderStrong:#c8c6c4; --vl-track:#edebe9; --vl-track2:#f0eff5;
    --vl-hover:#ffffff; --vl-goodSoft:#f7fbf8; --vl-goodBorder:#cfe9d4;
    --vl-brandText:#323F7C;
  }
}`;
  document.head.appendChild(style);
}

/**
 * Whether the Azure DevOps host theme is dark. Reads the `data-appearance`
 * attribute that useAdoTheme stamps on <html> (App always runs that hook) and
 * tracks changes.
 */
export function useVlDark(): boolean {
  const [dark, setDark] = useState(
    () => document.documentElement.getAttribute('data-appearance') === 'dark',
  );
  useEffect(() => {
    ensureVlThemeCss();
    const observer = new MutationObserver(() => {
      setDark(document.documentElement.getAttribute('data-appearance') === 'dark');
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-appearance'],
    });
    return () => observer.disconnect();
  }, []);
  return dark;
}

/** Class for a portfolio page root: applies the variable palette (+dark). */
export function vlCanvasClass(dark: boolean): string {
  return `vl-canvas${dark ? ' vl-dark' : ''}`;
}
