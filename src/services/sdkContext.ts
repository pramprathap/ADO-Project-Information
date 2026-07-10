import * as SDK from 'azure-devops-extension-sdk';
import { CommonServiceIds, ResourceAreaIds } from '@/constants/adoServiceIds';
import type { AzureDevOpsIdentity } from '@/models/AzureDevOpsIdentity';

/** Minimal shape of the current project from IProjectPageService.getProject(). */
export interface ProjectContext {
  id: string;
  name: string;
}

interface IProjectPageService {
  getProject(): Promise<ProjectContext | undefined>;
}

interface ILocationService {
  getResourceAreaLocation(resourceAreaId: string): Promise<string>;
}

/**
 * Resolves and caches the pieces of Azure DevOps context this extension needs:
 * the current project, and the base URLs for the Core and Graph REST areas.
 *
 * Nothing here is organisation-specific or hard-coded — everything is derived
 * from the host via the official SDK services, so the extension works in any
 * organisation in which it is installed.
 */
export class SdkContext {
  private constructor(
    readonly project: ProjectContext,
    readonly coreBaseUrl: string,
    readonly graphBaseUrl: string,
    readonly currentUser: AzureDevOpsIdentity,
  ) {}

  static async resolve(): Promise<SdkContext> {
    const projectService = await SDK.getService<IProjectPageService>(
      CommonServiceIds.ProjectPageService,
    );
    const project = await projectService.getProject();
    if (!project || !project.id) {
      throw new Error('No Azure DevOps project context is available on this page.');
    }

    const locationService = await SDK.getService<ILocationService>(
      CommonServiceIds.LocationService,
    );

    // Resolve base URLs from the location service. Fall back to the well-known
    // Azure DevOps Services hosts derived from the organisation name if the
    // location service is unavailable for any reason.
    const orgName = SDK.getHost().name;
    const coreBaseUrl = normalizeBase(
      await safeResourceLocation(
        locationService,
        ResourceAreaIds.Core,
        `https://dev.azure.com/${orgName}`,
      ),
    );
    const graphBaseUrl = normalizeBase(
      await safeResourceLocation(
        locationService,
        ResourceAreaIds.Graph,
        `https://vssps.dev.azure.com/${orgName}`,
      ),
    );

    const user = SDK.getUser();
    const currentUser: AzureDevOpsIdentity = {
      descriptor: user.descriptor,
      displayName: user.displayName || user.name,
      email: user.name,
      principalName: user.name,
      imageUrl: user.imageUrl,
      isActive: true,
    };

    return new SdkContext(project, coreBaseUrl, graphBaseUrl, currentUser);
  }
}

async function safeResourceLocation(
  service: ILocationService,
  resourceAreaId: string,
  fallback: string,
): Promise<string> {
  try {
    const url = await service.getResourceAreaLocation(resourceAreaId);
    return url && url.startsWith('http') ? url : fallback;
  } catch (err) {
    // Non-fatal: log and use the documented default host.
    console.warn('LocationService.getResourceAreaLocation failed; using fallback host.', err);
    return fallback;
  }
}

function normalizeBase(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}
