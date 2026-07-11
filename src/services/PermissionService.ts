import type { GraphRestClient } from 'azure-devops-extension-api/Graph';

export interface EditPermission {
  canEdit: boolean;
  /** Retained for the UI contract; the current implementation always fails open. */
  checkFailed: boolean;
}

/**
 * Permission / role checks.
 *
 * Editing is enforced **server-side** (the project-properties PATCH returns
 * 401/403), so {@link canEditProjectInformation} fails open — a client-side
 * probe of the project security namespace proved unreliable across orgs and
 * wrongly locked out real administrators.
 *
 * {@link isProjectAdministrator} is a separate, best-effort check used ONLY to
 * reveal masked sensitive sections (Client Contact). It inspects the project's
 * "Project Administrators" Graph group membership and fails OPEN: it returns
 * true unless it can confidently determine the user is NOT an administrator, so
 * a legitimate admin is never hidden from data. (Client-side masking is a UI
 * convenience, not a security boundary.)
 */
export class PermissionService {
  private clientInstance: GraphRestClient | undefined;

  constructor(
    private readonly userDescriptor: string,
    private readonly projectId: string,
  ) {}

  async canEditProjectInformation(): Promise<EditPermission> {
    return { canEdit: true, checkFailed: false };
  }

  private async graph(): Promise<GraphRestClient> {
    if (!this.clientInstance) {
      const [{ getClient }, { GraphRestClient }] = await Promise.all([
        import('azure-devops-extension-api'),
        import('azure-devops-extension-api/Graph'),
      ]);
      this.clientInstance = getClient(GraphRestClient);
    }
    return this.clientInstance;
  }

  async isProjectAdministrator(): Promise<boolean> {
    if (!this.userDescriptor || !this.projectId) {
      return true; // unknown context -> fail open (show)
    }
    try {
      const graphModule = await import('azure-devops-extension-api/Graph');
      const client = await this.graph();

      // The groups the current user belongs to (direction "up").
      const memberships = await client.listMemberships(
        this.userDescriptor,
        graphModule.GraphTraversalDirection.Up,
      );
      if (!memberships || memberships.length === 0) {
        return true; // cannot determine -> fail open
      }

      // Resolve each container group and look for a "Project Administrators"
      // group the user belongs to. Matched by display name only — the project
      // domain/scope descriptor format proved unreliable to match, and admins
      // are practically always viewing a project they administer.
      const containers = memberships
        .map((m) => m.containerDescriptor)
        .filter(Boolean)
        .slice(0, 50);
      const groups = await Promise.all(
        containers.map((d) => client.getGroup(d).catch(() => undefined)),
      );
      for (const group of groups) {
        if ((group?.displayName ?? '').toLowerCase() === 'project administrators') {
          return true;
        }
      }
      // Memberships resolved and none is a Project Administrators group. (Note:
      // only direct memberships are considered; admins added via a nested group
      // are a rare edge case and would be treated as non-admin here.)
      return false;
    } catch (err) {
      console.warn('Project-administrator check failed; revealing sensitive sections.', err);
      return true;
    }
  }
}
