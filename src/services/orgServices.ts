import { AzureDevOpsClient } from './AzureDevOpsClient';
import { appServicesFromContext, type AppServices } from './appServices';
import { resolveBaseUrls, resolveCurrentUser, SdkContext, type AdoBaseUrls } from './sdkContext';
import { fromProperties } from '@/utils/propertyMapper';
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

/**
 * List projects for the org-level reports, EXCLUDING projects whose Project
 * Information "Current Phase" is Closed — closed engagements are dropped from
 * every organisation report and calculation by policy. Each project's stored
 * properties are read (bounded concurrency); projects whose properties cannot
 * be read are kept (fail open) so a transient error never hides live work.
 */
export async function listActiveProjects(
  org: OrgContext,
  onProgress?: (done: number, total: number) => void,
): Promise<ProjectRef[]> {
  const all = await listProjects(org);
  const active: ProjectRef[] = [];
  let done = 0;
  const queue = [...all];
  const worker = async (): Promise<void> => {
    for (;;) {
      const project = queue.shift();
      if (!project) return;
      try {
        const bag = await buildProjectServices(org, project).properties.load();
        if (fromProperties(bag).currentPhase !== 'Closed') {
          active.push(project);
        }
      } catch {
        active.push(project); // fail open
      } finally {
        done += 1;
        onProgress?.(done, all.length);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, all.length || 1) }, worker));
  return active.sort((a, b) => a.name.localeCompare(b.name));
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
