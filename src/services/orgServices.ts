import { AzureDevOpsClient } from './AzureDevOpsClient';
import { appServicesFromContext, type AppServices } from './appServices';
import { resolveBaseUrls, resolveCurrentUser, SdkContext, type AdoBaseUrls } from './sdkContext';
import type { AzureDevOpsIdentity } from '@/models/AzureDevOpsIdentity';

/**
 * Organisation-level context: the base URLs + signed-in user + a shared REST
 * client, resolved once (without any project). Used by the org-wide Project
 * Health report to enumerate projects and build per-project services on demand.
 */
export interface OrgContext {
  urls: AdoBaseUrls;
  currentUser: AzureDevOpsIdentity;
  client: AzureDevOpsClient;
}

export interface ProjectRef {
  id: string;
  name: string;
}

/** Resolve the organisation context (call after SDK.ready()). */
export async function resolveOrgContext(): Promise<OrgContext> {
  const urls = await resolveBaseUrls();
  return { urls, currentUser: resolveCurrentUser(), client: new AzureDevOpsClient() };
}

interface ProjectsResponse {
  value?: { id: string; name: string }[];
}

/** List the well-formed projects the signed-in user can access, sorted by name. */
export async function listProjects(org: OrgContext): Promise<ProjectRef[]> {
  const res = await org.client.request<ProjectsResponse>(org.urls.coreBaseUrl, '_apis/projects', {
    method: 'GET',
    apiVersion: '7.1',
    query: { $top: 1000, stateFilter: 'wellFormed' },
  });
  return (res?.value ?? [])
    .filter((p) => p.id && p.name)
    .map((p) => ({ id: p.id, name: p.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Build the full app services bound to a specific project. */
export function buildProjectServices(org: OrgContext, project: ProjectRef): AppServices {
  const context = SdkContext.create(
    { id: project.id, name: project.name },
    org.urls,
    org.currentUser,
  );
  return appServicesFromContext(context, org.client);
}
