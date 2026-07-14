import {
  PublicClientApplication,
  type AccountInfo,
  type AuthenticationResult,
} from '@azure/msal-browser';
import { SHAREPOINT_CONFIG } from '@/constants/sharepointConfig';

/**
 * Minimal Microsoft Graph token/client for reading the SharePoint LMS and
 * Timesheet lists with the signed-in user's identity (delegated
 * Sites.Read.All). Silent SSO is attempted first; if the browser blocks it
 * (third-party-cookie rules inside the Azure DevOps iframe) the caller can
 * trigger an interactive popup from a user gesture via
 * {@link getGraphTokenInteractive}.
 */
const SCOPES = ['https://graph.microsoft.com/Sites.Read.All'];

let pca: PublicClientApplication | null = null;
let account: AccountInfo | null = null;

export function isSharePointConfigured(): boolean {
  return SHAREPOINT_CONFIG.clientId.length > 0;
}

/**
 * The EXACT redirect URI MSAL uses — must be registered on the Entra app as a
 * Single-page application redirect URI, character-for-character (no trailing
 * slash). This is the iframe origin the extension is served from.
 */
export function getRedirectUri(): string {
  return window.location.origin;
}

async function ensurePca(): Promise<PublicClientApplication> {
  if (!pca) {
    // Surface the redirect URI so it can be copied into the Entra app if the
    // popup fails with AADSTS500113 (no reply address registered).
    console.info('[SharePoint] MSAL redirect URI (register this exactly, SPA platform):', getRedirectUri());
    pca = new PublicClientApplication({
      auth: {
        clientId: SHAREPOINT_CONFIG.clientId,
        authority: SHAREPOINT_CONFIG.authority,
        redirectUri: getRedirectUri(),
      },
      cache: { cacheLocation: 'localStorage' },
    });
    await pca.initialize();
  }
  return pca;
}

function remember(result: AuthenticationResult): string {
  account = result.account ?? account;
  return result.accessToken;
}

/** Try to get a Graph token without user interaction. Null if not possible. */
export async function getGraphTokenSilent(loginHint?: string): Promise<string | null> {
  if (!isSharePointConfigured()) return null;
  try {
    const p = await ensurePca();
    account = account ?? p.getAllAccounts()[0] ?? null;
    if (account) {
      return remember(await p.acquireTokenSilent({ scopes: SCOPES, account }));
    }
    if (loginHint) {
      return remember(await p.ssoSilent({ scopes: SCOPES, loginHint }));
    }
    return null;
  } catch (err) {
    console.warn('Graph silent token acquisition failed.', err);
    return null;
  }
}

/**
 * Interactive popup (must be called from a user gesture). Null on failure.
 * Forces a fresh consent so the returned token definitely carries the current
 * scopes — this clears a stale cached token that predates the Sites.Read.All
 * grant (the usual cause of a 403 on the site read).
 */
export async function getGraphTokenInteractive(loginHint?: string): Promise<string | null> {
  if (!isSharePointConfigured()) return null;
  try {
    const p = await ensurePca();
    await resetGraphAuth();
    return remember(await p.acquireTokenPopup({ scopes: SCOPES, loginHint, prompt: 'consent' }));
  } catch (err) {
    console.warn('Graph interactive sign-in failed.', err);
    return null;
  }
}

/** Clear the cached account/token so the next sign-in mints a fresh one. */
export async function resetGraphAuth(): Promise<void> {
  account = null;
  try {
    await pca?.clearCache?.();
  } catch (err) {
    console.warn('Graph cache clear failed (non-fatal).', err);
  }
}

/** Error carrying the HTTP status so callers can distinguish auth failures. */
export class GraphError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GraphError';
  }
}

/** True for 401/403 — token missing/expired or not authorized for the resource. */
export function isGraphAuthError(err: unknown): boolean {
  return err instanceof GraphError && (err.status === 401 || err.status === 403);
}

/** GET a Graph URL with the token; throws a {@link GraphError} on non-2xx. */
export async function graphGet<T>(token: string, url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 400);
    } catch {
      /* body not readable */
    }
    throw new GraphError(res.status, `Graph request failed (${res.status}) for ${url}${detail ? ` — ${detail}` : ''}`);
  }
  return (await res.json()) as T;
}
