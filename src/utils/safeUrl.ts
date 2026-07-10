/**
 * URL safety helpers. Repository URLs are user-controlled and may later be
 * rendered as clickable links, so we only permit HTTPS (and optionally SSH git
 * URLs) and explicitly reject dangerous schemes such as javascript: and data:.
 */

const ALLOWED_SCHEMES = new Set(['https:']);

/**
 * Some teams store git remotes as `git@host:org/repo.git` (SCP-like syntax) or
 * `ssh://git@host/...`. We treat these as acceptable repository URLs but never
 * render them as anchor hrefs.
 */
const SCP_LIKE_SSH_RE = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+:[^\s]+$/;

export interface UrlValidationResult {
  isValid: boolean;
  /** Safe to use as an <a href>. Only true for https URLs. */
  isLinkable: boolean;
  message?: string;
}

export function validateRepositoryUrl(raw: string | undefined | null): UrlValidationResult {
  const value = (raw ?? '').trim();
  if (value === '') {
    return { isValid: true, isLinkable: false };
  }

  if (value.toLowerCase().startsWith('ssh://') || SCP_LIKE_SSH_RE.test(value)) {
    // Accept SSH git remotes but never render them as anchor hrefs.
    return { isValid: true, isLinkable: false };
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return {
      isValid: false,
      isLinkable: false,
      message: 'Enter a valid URL (must start with https://).',
    };
  }

  const scheme = parsed.protocol.toLowerCase();
  if (!ALLOWED_SCHEMES.has(scheme)) {
    return {
      isValid: false,
      isLinkable: false,
      message: `URL scheme "${scheme.replace(':', '')}" is not allowed. Use https://.`,
    };
  }

  return { isValid: true, isLinkable: true };
}

/**
 * Returns the URL only if it is safe to place in an <a href>, else undefined.
 * Used at render time as defence-in-depth against stored unsafe values.
 */
export function toSafeHref(raw: string | undefined | null): string | undefined {
  const result = validateRepositoryUrl(raw);
  if (!result.isValid || !result.isLinkable) {
    return undefined;
  }
  return (raw ?? '').trim();
}
