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

async function ensurePca(): Promise<PublicClientApplication> {
  if (!pca) {
    pca = new PublicClientApplication({
      auth: {
        clientId: SHAREPOINT_CONFIG.clientId,
        authority: SHAREPOINT_CONFIG.authority,
        redirectUri: window.location.origin,
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

/** Interactive popup (must be called from a user gesture). Null on failure. */
export async function getGraphTokenInteractive(loginHint?: string): Promise<string | null> {
  if (!isSharePointConfigured()) return null;
  try {
    const p = await ensurePca();
    return remember(await p.acquireTokenPopup({ scopes: SCOPES, loginHint }));
  } catch (err) {
    console.warn('Graph interactive sign-in failed.', err);
    return null;
  }
}

/** GET a Graph URL with the token; throws on non-2xx. */
export async function graphGet<T>(token: string, url: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`Graph request failed (${res.status}) for ${url}`);
  }
  return (await res.json()) as T;
}
