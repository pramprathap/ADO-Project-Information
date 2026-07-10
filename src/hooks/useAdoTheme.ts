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

    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['style', 'class', 'data-theme'],
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'class', 'data-theme'],
    });

    const contrastQuery = window.matchMedia('(forced-colors: active)');
    const schemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    contrastQuery.addEventListener('change', update);
    schemeQuery.addEventListener('change', update);

    return () => {
      observer.disconnect();
      contrastQuery.removeEventListener('change', update);
      schemeQuery.removeEventListener('change', update);
    };
  }, []);

  return detected.theme;
}

function detectTheme(): DetectedTheme {
  if (typeof window !== 'undefined' && window.matchMedia('(forced-colors: active)').matches) {
    return { theme: teamsHighContrastTheme, appearance: 'contrast' };
  }
  return isDarkBackground()
    ? { theme: webDarkTheme, appearance: 'dark' }
    : { theme: webLightTheme, appearance: 'light' };
}

/**
 * Determine whether the current background is dark. Prefers the ADO
 * `--background-color` custom property; falls back to the computed body
 * background, then to the OS colour-scheme preference.
 */
function isDarkBackground(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const styles = getComputedStyle(document.body);
  const candidates = [
    styles.getPropertyValue('--background-color'),
    styles.backgroundColor,
    getComputedStyle(document.documentElement).getPropertyValue('--background-color'),
  ];
  for (const raw of candidates) {
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
    const parts = rgbMatch[1].split(',').map((p) => parseFloat(p));
    [r, g, b] = parts;
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
