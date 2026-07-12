import { AzureDevOpsClient } from './AzureDevOpsClient';
import { ClientDirectoryService } from './ClientDirectoryService';
import { IdentityService } from './IdentityService';
import { PermissionService } from './PermissionService';
import { ProjectPropertiesService } from './ProjectPropertiesService';
import { WorkItemService } from './WorkItemService';
import { SdkContext } from './sdkContext';

/**
 * Bundles the fully-wired services for the current Azure DevOps context. Built
 * once after SDK.ready() by {@link createAppServices} and passed down to hooks.
 */
export interface AppServices {
  context: SdkContext;
  properties: ProjectPropertiesService;
  identities: IdentityService;
  permissions: PermissionService;
  clientDirectory: ClientDirectoryService;
  workItems: WorkItemService;
}

/** Wire the services for a resolved {@link SdkContext} (reused per project). */
export function appServicesFromContext(
  context: SdkContext,
  client: AzureDevOpsClient = new AzureDevOpsClient(),
): AppServices {
  return {
    context,
    properties: new ProjectPropertiesService(client, context.coreBaseUrl, context.project.id),
    identities: new IdentityService(),
    permissions: new PermissionService(context.currentUser.descriptor, context.project.id),
    clientDirectory: new ClientDirectoryService(),
    workItems: new WorkItemService(
      client,
      context.coreBaseUrl,
      context.project.id,
      context.analyticsBaseUrl,
    ),
  };
}

export async function createAppServices(): Promise<AppServices> {
  const context = await SdkContext.resolve();
  return appServicesFromContext(context);
}
