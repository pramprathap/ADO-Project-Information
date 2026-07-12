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
/** The Azure DevOps REST base URLs for the current organisation. */
export interface AdoBaseUrls {
  coreBaseUrl: string;
  graphBaseUrl: string;
  /** Analytics OData host (e.g. https://analytics.dev.azure.com/{org}). */
  analyticsBaseUrl: string;
}

/**
 * Resolve the Core / Graph / Analytics base URLs for the organisation. Works
 * without a project context, so it can be used by the organisation-level report.
 */
export async function resolveBaseUrls(): Promise<AdoBaseUrls> {
  const locationService = await SDK.getService<ILocationService>(CommonServiceIds.LocationService);
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
  const analyticsBaseUrl = deriveAnalyticsBase(coreBaseUrl, orgName);
  return { coreBaseUrl, graphBaseUrl, analyticsBaseUrl };
}

/** The signed-in Azure DevOps user as an identity. */
export function resolveCurrentUser(): AzureDevOpsIdentity {
  const user = SDK.getUser();
  return {
    descriptor: user.descriptor,
    displayName: user.displayName || user.name,
    email: user.name,
    principalName: user.name,
    imageUrl: user.imageUrl,
    isActive: true,
  };
}

export class SdkContext {
  private constructor(
    readonly project: ProjectContext,
    readonly coreBaseUrl: string,
    readonly graphBaseUrl: string,
    /** Analytics OData host (e.g. https://analytics.dev.azure.com/{org}). */
    readonly analyticsBaseUrl: string,
    readonly currentUser: AzureDevOpsIdentity,
  ) {}

  /** Build a context for an explicit project (used by the org-level report). */
  static create(
    project: ProjectContext,
    urls: AdoBaseUrls,
    currentUser: AzureDevOpsIdentity,
  ): SdkContext {
    return new SdkContext(
      project,
      urls.coreBaseUrl,
      urls.graphBaseUrl,
      urls.analyticsBaseUrl,
      currentUser,
    );
  }

  static async resolve(): Promise<SdkContext> {
    const projectService = await SDK.getService<IProjectPageService>(
      CommonServiceIds.ProjectPageService,
    );
    const project = await projectService.getProject();
    if (!project || !project.id) {
      throw new Error('No Azure DevOps project context is available on this page.');
    }

    const urls = await resolveBaseUrls();
    return SdkContext.create(project, urls, resolveCurrentUser());
  }
}

/**
 * Derive the Analytics OData host from the Core host. On Azure DevOps Services,
 * `dev.azure.com/{org}` → `analytics.dev.azure.com/{org}` and the legacy
 * `{org}.visualstudio.com` → `{org}.analytics.visualstudio.com`.
 */
function deriveAnalyticsBase(coreBaseUrl: string, orgName: string): string {
  try {
    const u = new URL(coreBaseUrl);
    if (u.hostname === 'dev.azure.com') {
      u.hostname = 'analytics.dev.azure.com';
      return normalizeBase(u.toString());
    }
    const vs = u.hostname.match(/^(.+)\.visualstudio\.com$/i);
    if (vs) {
      u.hostname = `${vs[1]}.analytics.visualstudio.com`;
      return normalizeBase(u.toString());
    }
  } catch {
    /* fall through to the documented default */
  }
  return `https://analytics.dev.azure.com/${orgName}`;
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
