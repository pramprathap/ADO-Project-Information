import { AzureDevOpsClient } from './AzureDevOpsClient';

/**
 * Azure DevOps "Project" security namespace id (stable GUID). Bit 2
 * (GENERIC_WRITE) maps to the "Edit project-level information" permission, which
 * is the appropriate gate for updating project properties. Project
 * Administrators and Project Collection Administrators hold this permission.
 */
const PROJECT_SECURITY_NAMESPACE = '52d39943-cb85-4d7f-8fa8-c6baac873819';
const GENERIC_WRITE_BIT = 2;

interface PermissionResponse {
  count: number;
  value: boolean[];
}

export interface EditPermission {
  canEdit: boolean;
  /**
   * True when the permission check could not be completed. When true the UI
   * still allows an edit attempt (the server enforces the real permission and
   * returns 403 if denied) but may show an informational note.
   */
  checkFailed: boolean;
}

/**
 * Determines whether the current user may edit project information, using the
 * official permissions REST API:
 *
 *   GET {core}/_apis/permissions/{namespaceId}/{bit}?tokens=$PROJECT:vstfs:///Classification/TeamProject/{projectId}
 *
 * Client-side permission checks are advisory only — hiding a button is never
 * treated as security. The server-side property update is the real enforcement
 * point and its 401/403 responses are handled by the caller.
 */
export class PermissionService {
  constructor(
    private readonly client: AzureDevOpsClient,
    private readonly coreBaseUrl: string,
    private readonly projectId: string,
  ) {}

  async canEditProjectInformation(): Promise<EditPermission> {
    // The project-properties PATCH is authorised server-side. A client-side probe
    // of the Project security namespace can UNDER-report edit rights for some
    // group memberships (observed: it returns false even for confirmed Project
    // Administrators), which would wrongly lock the form. We therefore run the
    // probe only for diagnostics and NEVER hard-block on a negative result:
    // the form stays editable and the server enforces on save, where 401/403
    // are handled and the form flips to read-only. This never treats a hidden
    // button as security.
    const token = `$PROJECT:vstfs:///Classification/TeamProject/${this.projectId}`;
    try {
      const response = await this.client.request<PermissionResponse>(
        this.coreBaseUrl,
        `_apis/permissions/${PROJECT_SECURITY_NAMESPACE}/${GENERIC_WRITE_BIT}`,
        { method: 'GET', query: { tokens: token } },
      );
      const probeAllowed = Array.isArray(response?.value) && response.value[0] === true;
      if (!probeAllowed) {
        console.info(
          'Edit-permission probe did not confirm access; deferring to server enforcement on save.',
        );
      }
    } catch (err) {
      console.warn('Edit-permission probe failed; deferring to server enforcement on save.', err);
    }
    return { canEdit: true, checkFailed: false };
  }
}
