import * as SDK from 'azure-devops-extension-sdk';

/**
 * Minimal shapes of the official Extension Data Service. Declared locally (the
 * service id is the documented CommonServiceIds value) so we avoid a heavy
 * import; no additional manifest scope is required to use extension data.
 */
interface IExtensionDataManager {
  getValue<T>(
    key: string,
    documentOptions?: { scopeType?: string; scopeValue?: string; defaultValue?: T },
  ): Promise<T>;
  setValue<T>(
    key: string,
    value: T,
    documentOptions?: { scopeType?: string; scopeValue?: string },
  ): Promise<T>;
}

interface IExtensionDataService {
  getExtensionDataManager(extensionId: string, accessToken: string): Promise<IExtensionDataManager>;
}

const EXTENSION_DATA_SERVICE_ID = 'ms.vss-features.extension-data-service';
const CLIENT_NAMES_KEY = 'Veelead.ClientNames';
// "Default" scope stores the document at the organisation (collection) level,
// shared across all projects and users — exactly what we want for a shared
// directory of client names.
const SHARED_SCOPE = { scopeType: 'Default' as const };

/**
 * A shared, organisation-wide directory of client names used to power
 * type-ahead on the Client Name field. Selecting from the list (or adding a new
 * value that is remembered for next time) reduces spelling/duplication errors
 * across projects.
 */
export class ClientDirectoryService {
  private managerPromise: Promise<IExtensionDataManager> | undefined;

  private manager(): Promise<IExtensionDataManager> {
    if (!this.managerPromise) {
      this.managerPromise = (async () => {
        const service = await SDK.getService<IExtensionDataService>(EXTENSION_DATA_SERVICE_ID);
        const ctx = SDK.getExtensionContext();
        const token = await SDK.getAccessToken();
        return service.getExtensionDataManager(`${ctx.publisherId}.${ctx.extensionId}`, token);
      })();
    }
    return this.managerPromise;
  }

  async getClientNames(): Promise<string[]> {
    try {
      const manager = await this.manager();
      const names = await manager.getValue<string[]>(CLIENT_NAMES_KEY, {
        ...SHARED_SCOPE,
        defaultValue: [],
      });
      return Array.isArray(names) ? names.filter((n) => typeof n === 'string') : [];
    } catch (err) {
      console.warn('Could not load the shared client-name directory.', err);
      return [];
    }
  }

  /** Add a client name to the shared directory if not already present. */
  async addClientName(name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    try {
      const manager = await this.manager();
      const current = await manager.getValue<string[]>(CLIENT_NAMES_KEY, {
        ...SHARED_SCOPE,
        defaultValue: [],
      });
      const list = Array.isArray(current) ? current.filter((n) => typeof n === 'string') : [];
      if (list.some((n) => n.toLowerCase() === trimmed.toLowerCase())) {
        return; // already known
      }
      list.push(trimmed);
      list.sort((a, b) => a.localeCompare(b));
      await manager.setValue(CLIENT_NAMES_KEY, list, SHARED_SCOPE);
    } catch (err) {
      // Non-fatal: the client information still saves; only the suggestion list
      // update failed.
      console.warn('Could not update the shared client-name directory.', err);
    }
  }
}
