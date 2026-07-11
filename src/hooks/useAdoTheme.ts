import { useEffect, useState } from 'react';
import {
  teamsHighContrastTheme,
  webDarkTheme,
  webLightTheme,
  type Theme,
} from '@fluentui/react-components';

export type Appearance = 'light' | 'dark' | 'contrast';

interface DetectedTheme {
  theme: Theme;
  appearance: Appearance;
}

/**
 * Maps the Azure DevOps host theme (applied to the document by
 * SDK.init({ applyTheme: true })) onto the corresponding Fluent UI theme so the
 * extension honours light, dark, and high-contrast modes without hard-coding
 * colours.
 *
 * It also stamps `data-appearance` on <html> so our custom palette in
 * styles.css (accent, health tints, glass) stays perfectly in sync with the
 * Fluent theme we render — the background and every accent follow the user's
 * Azure DevOps theme.
 */
export function useAdoTheme(): Theme {
  const [detected, setDetected] = useState<DetectedTheme>(() => detectTheme());

  useEffect(() => {
    document.documentElement.setAttribute('data-appearance', detected.appearance);
  }, [detected.appearance]);

  useEffect(() => {
    const update = (): void => setDetected(detectTheme());

    // SDK.applyTheme injects a <style> element into <head> during init and on
    // theme changes, and fires a `themeChanged` window event. Watch all of
    // these plus re-check shortly after mount (init resolves asynchronously).
    window.addEventListener('themeChanged', update);

    const headObserver = new MutationObserver(update);
    headObserver.observe(document.head, { childList: true });
    const rootObserver = new MutationObserver(update);
    rootObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'class', 'data-theme'],
    });

    const contrastQuery = window.matchMedia('(forced-colors: active)');
    contrastQuery.addEventListener('change', update);

    const timers = [setTimeout(update, 150), setTimeout(update, 600), setTimeout(update, 1500)];

    return () => {
      window.removeEventListener('themeChanged', update);
      headObserver.disconnect();
      rootObserver.disconnect();
      contrastQuery.removeEventListener('change', update);
      timers.forEach(clearTimeout);
    };
  }, []);

  return detected.theme;
}

function detectTheme(): DetectedTheme {
  if (typeof window !== 'undefined' && window.matchMedia('(forced-colors: active)').matches) {
    return { theme: teamsHighContrastTheme, appearance: 'contrast' };
  }
  return isDarkTheme()
    ? { theme: webDarkTheme, appearance: 'dark' }
    : { theme: webLightTheme, appearance: 'light' };
}

/**
 * Determine whether the Azure DevOps theme is dark.
 *
 * The most reliable signal is the body text colour: SDK.applyTheme sets
 * `body { color: var(--text-primary-color) }`, so light text implies a dark
 * theme and dark text implies a light theme. We fall back to the injected
 * `--background-color` custom property, then to the OS colour-scheme preference.
 */
function isDarkTheme(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const textLuminance = relativeLuminance(getComputedStyle(document.body).color);
  if (textLuminance !== null) {
    return textLuminance > 0.5;
  }
  const bgCandidates = [
    getComputedStyle(document.documentElement).getPropertyValue('--background-color'),
    getComputedStyle(document.body).getPropertyValue('--background-color'),
    getComputedStyle(document.body).backgroundColor,
  ];
  for (const raw of bgCandidates) {
    const luminance = relativeLuminance(raw);
    if (luminance !== null) {
      return luminance < 0.5;
    }
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Parse a CSS colour to a 0..1 luminance, or null if it can't be parsed. */
function relativeLuminance(color: string): number | null {
  const value = color.trim();
  if (!value) {
    return null;
  }
  let r: number, g: number, b: number;
  const rgbMatch = value.match(/rgba?\(([^)]+)\)/i);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(/[,/\s]+/).map((p) => parseFloat(p));
    [r, g, b] = parts;
    // A fully transparent colour carries no theme signal — treat as unknown so
    // the caller falls through to a more reliable source.
    if (parts.length >= 4 && parts[3] === 0) {
      return null;
    }
  } else if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) {
    const hex = value.slice(1);
    const full =
      hex.length === 3
        ? hex
            .split('')
            .map((c) => c + c)
            .join('')
        : hex;
    r = parseInt(full.slice(0, 2), 16);
    g = parseInt(full.slice(2, 4), 16);
    b = parseInt(full.slice(4, 6), 16);
  } else {
    return null;
  }
  if ([r, g, b].some((n) => Number.isNaN(n))) {
    return null;
  }
  // Perceived luminance (sRGB, simple coefficients).
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
