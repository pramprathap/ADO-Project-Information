import type {
  GraphRestClient,
  GraphUser,
  GraphSubjectQuery,
} from 'azure-devops-extension-api/Graph';
import type { AzureDevOpsIdentity } from '@/models/AzureDevOpsIdentity';

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
  const avatar = user._links?.avatar?.href as string | undefined;
  if (avatar) {
    identity.imageUrl = avatar;
  }
  return identity;
}

/**
 * Searches and resolves Azure DevOps identities via the official
 * `azure-devops-extension-api` Graph REST client (`getClient(GraphRestClient)`).
 *
 * Using the SDK's own client (rather than a hand-rolled fetch) means requests
 * are authenticated and routed the way Azure DevOps expects from inside the
 * extension iframe, which avoids the CORS / 401 failures that a raw
 * cross-origin fetch to the identity/graph services hits.
 *
 *   querySubjects({ query, subjectKind: ['User'] })  — search organisation users
 *   getUser(descriptor)                              — reload a stored identity
 */
export class IdentityService {
  private clientInstance: GraphRestClient | undefined;

  /**
   * Lazily load and construct the Graph client. The `azure-devops-extension-api`
   * module is imported dynamically (not at startup) so its module-scope code
   * only runs once the SDK is ready and never during local preview — a static
   * import would execute before SDK.init and blank the page.
   */
  private async getGraphClient(): Promise<GraphRestClient> {
    if (!this.clientInstance) {
      const [{ getClient }, { GraphRestClient }] = await Promise.all([
        import('azure-devops-extension-api'),
        import('azure-devops-extension-api/Graph'),
      ]);
      this.clientInstance = getClient(GraphRestClient);
    }
    return this.clientInstance;
  }

  async searchUsers(query: string, limit = 25): Promise<AzureDevOpsIdentity[]> {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return [];
    }

    const client = await this.getGraphClient();
    // Only `query` and `subjectKind` are meaningful here; the remaining
    // GraphSubjectQuery fields are optional in practice, so we assert the type.
    const subjectQuery = { query: trimmed, subjectKind: ['User'] } as GraphSubjectQuery;
    const subjects = (await client.querySubjects(subjectQuery)) as GraphUser[];

    const results: AzureDevOpsIdentity[] = [];
    for (const subject of subjects ?? []) {
      if (isLikelyServiceAccount(subject.displayName ?? '', subject.principalName ?? '')) {
        continue;
      }
      const identity = fromGraphUser(subject, true);
      if (identity) {
        results.push(identity);
      }
      if (results.length >= limit) {
        break;
      }
    }
    return results;
  }

  /**
   * Re-resolve a stored identity by its descriptor when the page loads. Returns
   * the identity with `isActive: false` (preserving the stored display
   * name/email) when the user has been removed / disabled (HTTP 404).
   */
  async resolveByDescriptor(stored: AzureDevOpsIdentity): Promise<AzureDevOpsIdentity> {
    try {
      const client = await this.getGraphClient();
      const user = await client.getUser(stored.descriptor);
      const resolved = fromGraphUser(user, true);
      return resolved ?? { ...stored, isActive: false };
    } catch (err) {
      const status = (err as { status?: number } | undefined)?.status;
      if (status === 404) {
        return { ...stored, isActive: false };
      }
      console.warn('Failed to resolve identity by descriptor; using stored value.', err);
      return { ...stored };
    }
  }
}
