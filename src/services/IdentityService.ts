import { AzureDevOpsClient } from './AzureDevOpsClient';
import { ApiError } from './errors';
import type { AzureDevOpsIdentity } from '@/models/AzureDevOpsIdentity';

// ---- Identity Picker API (searches the org + Entra ID / AAD directory) -------

interface IdentityPickerIdentity {
  entityId?: string;
  displayName?: string;
  mail?: string;
  signInAddress?: string;
  samAccountName?: string;
  subjectDescriptor?: string;
  active?: boolean;
  entityType?: string; // "User" | "Group" | ...
  originDirectory?: string; // "aad" | "vsd" | ...
  image?: string;
  description?: string;
}

interface IdentityPickerResponse {
  results?: { queryToken?: string; identities?: IdentityPickerIdentity[] }[];
}

// ---- Graph API (used to re-resolve a stored descriptor on load) --------------

interface GraphUser {
  descriptor?: string;
  displayName?: string;
  mailAddress?: string;
  principalName?: string;
  subjectKind?: string;
  metaType?: string;
  _links?: { avatar?: { href?: string } };
}

interface GraphSubjectQueryResponse {
  count: number;
  value: GraphUser[];
}

/**
 * Case-insensitive patterns for Azure DevOps service / build accounts that
 * should not be selectable as people. Best-effort — there is no single reliable
 * "is service account" flag.
 */
const SERVICE_ACCOUNT_PATTERNS = [
  /^Project Collection Build Service/i,
  /^Project Build Service/i,
  /Build Service \(/i,
  /^Agent Pool Service/i,
  /^PipelinesSDK/i,
  /\bService Account\b/i,
];

function isLikelyServiceAccount(name: string, principal: string): boolean {
  return SERVICE_ACCOUNT_PATTERNS.some((re) => re.test(name) || re.test(principal));
}

function fromPickerIdentity(id: IdentityPickerIdentity): AzureDevOpsIdentity | null {
  // The canonical stored id is the Graph subject descriptor. Skip entries that
  // do not expose one (they cannot be reliably re-resolved later).
  const descriptor = id.subjectDescriptor;
  if (!descriptor) {
    return null;
  }
  const email = id.mail || id.signInAddress || undefined;
  const identity: AzureDevOpsIdentity = {
    descriptor,
    displayName: id.displayName || id.signInAddress || id.mail || descriptor,
    isActive: id.active !== false,
  };
  if (email) {
    identity.email = email;
  }
  const principal = id.signInAddress || id.mail;
  if (principal) {
    identity.principalName = principal;
  }
  if (id.image) {
    identity.imageUrl = id.image;
  }
  return identity;
}

function fromGraphUser(user: GraphUser, isActive: boolean): AzureDevOpsIdentity | null {
  if (!user.descriptor) {
    return null;
  }
  const identity: AzureDevOpsIdentity = {
    descriptor: user.descriptor,
    displayName: user.displayName || user.principalName || user.mailAddress || user.descriptor,
    isActive,
  };
  if (user.mailAddress) {
    identity.email = user.mailAddress;
  }
  if (user.principalName) {
    identity.principalName = user.principalName;
  }
  const avatar = user._links?.avatar?.href;
  if (avatar) {
    identity.imageUrl = avatar;
  }
  return identity;
}

/**
 * Searches and resolves Azure DevOps / Entra ID identities.
 *
 * Search uses the **Identity Picker** service — the same API that powers Azure
 * DevOps' own people pickers — with `operationScopes: ["ims", "source"]` so it
 * queries both the organisation (IMS) and the backing **Entra ID (AAD)
 * directory**. This finds users by name or email, including directory users, so
 * the picker behaves like the native ADO identity control.
 *
 *   POST {org}/_apis/IdentityPicker/Identities   (search-as-you-type)
 *   GET  {graph}/_apis/graph/users/{descriptor}  (reload a stored identity)
 *
 * If the Identity Picker call fails, it falls back to the Graph subjectQuery API
 * (organisation members only).
 */
export class IdentityService {
  constructor(
    private readonly client: AzureDevOpsClient,
    private readonly orgBaseUrl: string,
    private readonly graphBaseUrl: string,
  ) {}

  async searchUsers(query: string, limit = 25): Promise<AzureDevOpsIdentity[]> {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return [];
    }

    try {
      const results = await this.searchViaIdentityPicker(trimmed, limit);
      if (results.length > 0) {
        return results;
      }
    } catch (err) {
      console.warn('Identity Picker search failed; falling back to Graph subjectQuery.', err);
    }

    // Fallback: organisation members via Graph.
    try {
      return await this.searchViaGraph(trimmed, limit);
    } catch (err) {
      console.error('Graph identity search failed.', err);
      throw err;
    }
  }

  private async searchViaIdentityPicker(
    query: string,
    limit: number,
  ): Promise<AzureDevOpsIdentity[]> {
    const response = await this.client.request<IdentityPickerResponse>(
      this.orgBaseUrl,
      '_apis/IdentityPicker/Identities',
      {
        method: 'POST',
        apiVersion: '5.0-preview.1',
        body: {
          query,
          identityTypes: ['user'],
          // "ims" = this organisation, "source" = backing Entra ID directory.
          operationScopes: ['ims', 'source'],
          properties: [
            'DisplayName',
            'Mail',
            'SignInAddress',
            'SamAccountName',
            'Active',
            'SubjectDescriptor',
          ],
          options: { MinResults: 5, MaxResults: Math.max(limit, 10) },
        },
      },
    );

    const identities = (response?.results ?? []).flatMap((r) => r.identities ?? []);
    const out: AzureDevOpsIdentity[] = [];
    for (const raw of identities) {
      if (raw.entityType && raw.entityType.toLowerCase() !== 'user') {
        continue;
      }
      if (isLikelyServiceAccount(raw.displayName ?? '', raw.signInAddress ?? raw.mail ?? '')) {
        continue;
      }
      const identity = fromPickerIdentity(raw);
      if (identity) {
        out.push(identity);
      }
      if (out.length >= limit) {
        break;
      }
    }
    return out;
  }

  private async searchViaGraph(query: string, limit: number): Promise<AzureDevOpsIdentity[]> {
    const response = await this.client.request<GraphSubjectQueryResponse>(
      this.graphBaseUrl,
      '_apis/graph/subjectquery',
      { method: 'POST', body: { query, subjectKind: ['User'] } },
    );
    const users = Array.isArray(response?.value) ? response.value : [];
    const out: AzureDevOpsIdentity[] = [];
    for (const user of users) {
      if (user.subjectKind && user.subjectKind.toLowerCase() !== 'user') {
        continue;
      }
      if (isLikelyServiceAccount(user.displayName ?? '', user.principalName ?? '')) {
        continue;
      }
      const identity = fromGraphUser(user, true);
      if (identity) {
        out.push(identity);
      }
      if (out.length >= limit) {
        break;
      }
    }
    return out;
  }

  /**
   * Re-resolve a stored identity by its descriptor when the page loads. Returns
   * the identity with `isActive: false` (preserving the stored display
   * name/email) when the user has been removed/disabled (HTTP 404).
   */
  async resolveByDescriptor(stored: AzureDevOpsIdentity): Promise<AzureDevOpsIdentity> {
    try {
      const user = await this.client.request<GraphUser>(
        this.graphBaseUrl,
        `_apis/graph/users/${encodeURIComponent(stored.descriptor)}`,
        { method: 'GET' },
      );
      const resolved = fromGraphUser(user, true);
      return resolved ?? { ...stored, isActive: false };
    } catch (err) {
      if (err instanceof ApiError && err.kind === 'notFound') {
        return { ...stored, isActive: false };
      }
      console.warn('Failed to resolve identity by descriptor; using stored value.', err);
      return { ...stored };
    }
  }
}
