import { AzureDevOpsClient } from './AzureDevOpsClient';
import type { PatchOperation, PropertyBag } from '@/utils/propertyMapper';
import { PROPERTY_NAMESPACE } from '@/constants/propertyKeys';

interface ProjectPropertyValue {
  name: string;
  value: unknown;
}

interface ProjectPropertiesResponse {
  count: number;
  value: ProjectPropertyValue[];
}

/**
 * Reads and writes the current project's custom properties via the official
 * Core "project properties" REST API:
 *
 *   GET   {core}/_apis/projects/{projectId}/properties?keys=Veelead.ProjectInformation.*
 *   PATCH {core}/_apis/projects/{projectId}/properties   (application/json-patch+json)
 *
 * Only properties in the `Veelead.ProjectInformation.` namespace are read and
 * written, so unrelated project properties are never affected.
 */
export class ProjectPropertiesService {
  constructor(
    private readonly client: AzureDevOpsClient,
    private readonly coreBaseUrl: string,
    private readonly projectId: string,
  ) {}

  private get path(): string {
    return `_apis/projects/${encodeURIComponent(this.projectId)}/properties`;
  }

  /**
   * Load this extension's properties for the current project. Returns an empty
   * bag for a newly-created project that has no properties yet.
   */
  async load(): Promise<PropertyBag> {
    const response = await this.client.request<ProjectPropertiesResponse>(
      this.coreBaseUrl,
      this.path,
      {
        method: 'GET',
        // Server-side filter to only our namespace. The trailing `*` is a
        // supported wildcard for the `keys` parameter.
        query: { keys: `${PROPERTY_NAMESPACE}*` },
      },
    );

    const bag: PropertyBag = {};
    if (response && Array.isArray(response.value)) {
      for (const entry of response.value) {
        if (entry && typeof entry.name === 'string' && entry.name.startsWith(PROPERTY_NAMESPACE)) {
          // Project property values are strings for this extension; coerce
          // defensively so a non-string stored value never crashes the mapper.
          bag[entry.name] = entry.value == null ? undefined : String(entry.value);
        }
      }
    }
    return bag;
  }

  /**
   * Apply patch operations. The project-properties endpoint applies operations
   * atomically for a single request, so a well-formed patch either fully
   * succeeds or fully fails. A no-op patch is skipped.
   */
  async save(operations: PatchOperation[]): Promise<void> {
    if (operations.length === 0) {
      return;
    }
    await this.client.requestRaw(this.coreBaseUrl, this.path, {
      method: 'PATCH',
      contentType: 'application/json-patch+json',
      body: operations,
      // Do not retry writes automatically to avoid duplicate side effects;
      // 429/5xx are surfaced and the user can retry via the UI.
      retry: false,
    });
  }
}
