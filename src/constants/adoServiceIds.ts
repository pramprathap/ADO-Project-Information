/**
 * Official Azure DevOps `CommonServiceIds` contribution ids and REST resource
 * area ids. Declared here (rather than importing the large
 * `azure-devops-extension-api` package) so the bundle stays small; the string
 * values are the documented, officially-supported constants.
 *
 * Sources:
 *  - CommonServiceIds — learn.microsoft.com/javascript/api/azure-devops-extension-api/commonserviceids
 *  - Resource area ids — the stable GUIDs used by the Core and Graph REST areas.
 */
export const CommonServiceIds = {
  ProjectPageService: 'ms.vss-tfs-web.tfs-page-data-service',
  LocationService: 'ms.vss-features.location-service',
  HostPageLayoutService: 'ms.vss-features.host-page-layout-service',
  GlobalMessagesService: 'ms.vss-tfs-web.tfs-global-messages-service',
} as const;

/** Resource area GUIDs used with ILocationService.getResourceAreaLocation. */
export const ResourceAreaIds = {
  /** Core (projects, project properties) — served from dev.azure.com/{org}. */
  Core: '79134c72-4a58-4b42-976c-04e7115f32bf',
  /** Graph (identities) — served from vssps.dev.azure.com/{org}. */
  Graph: 'bb1e7ec9-e901-4b68-999a-de7012b920f8',
} as const;

/** REST API version pinned across all requests. */
export const API_VERSION = '7.1-preview.1';
