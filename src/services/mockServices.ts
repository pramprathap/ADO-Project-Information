import type { AppServices } from './appServices';
import type { SdkContext } from './sdkContext';
import type { ProjectPropertiesService } from './ProjectPropertiesService';
import type { IdentityService } from './IdentityService';
import type { PermissionService } from './PermissionService';
import type { PatchOperation, PropertyBag } from '@/utils/propertyMapper';
import type { AzureDevOpsIdentity } from '@/models/AzureDevOpsIdentity';

/**
 * In-memory service implementations used ONLY for local preview (`npm run dev`),
 * where the Azure DevOps SDK is not available because the page is not hosted in
 * the Azure DevOps iframe. This lets a developer see the real UI, theming,
 * validation, people-picker and save/dirty behaviour without deploying.
 *
 * This module is never used in the production build (the DEV branch that imports
 * it is compiled out when `import.meta.env.DEV` is false).
 */

const MOCK_USERS: AzureDevOpsIdentity[] = [
  {
    descriptor: 'aad.user1',
    displayName: 'Ali Abuthahir',
    email: 'ali@veelead.com',
    isActive: true,
  },
  {
    descriptor: 'aad.user2',
    displayName: 'Arun Kumar P',
    email: 'arunkumar.p@veelead.com',
    isActive: true,
  },
  { descriptor: 'aad.user3', displayName: 'Rajesh K', email: 'raj@veelead.com', isActive: true },
  {
    descriptor: 'aad.user4',
    displayName: 'Venkata Teja K',
    email: 'teja@veelead.com',
    isActive: true,
  },
  {
    descriptor: 'aad.user5',
    displayName: 'RamPrathap P Veelead',
    email: 'ramprathap.p@veelead.com',
    isActive: true,
  },
];

export function createMockAppServices(): AppServices {
  // A shared in-memory property bag that persists across save/reload in preview.
  const store: PropertyBag = {};

  const context = {
    project: { id: 'preview-project', name: 'AAF - HelpDesk (Preview)' },
    coreBaseUrl: 'https://preview.local',
    graphBaseUrl: 'https://preview.local',
    currentUser: {
      descriptor: 'aad.user5',
      displayName: 'RamPrathap P Veelead',
      email: 'ramprathap.p@veelead.com',
      isActive: true,
    } as AzureDevOpsIdentity,
  } as unknown as SdkContext;

  const properties = {
    async load(): Promise<PropertyBag> {
      return { ...store };
    },
    async save(operations: PatchOperation[]): Promise<void> {
      for (const op of operations) {
        const key = op.path.replace(/^\//, '');
        if (op.op === 'remove') {
          delete store[key];
        } else if (op.value !== undefined) {
          store[key] = op.value;
        }
      }
    },
  } as unknown as ProjectPropertiesService;

  const identities = {
    async searchUsers(query: string): Promise<AzureDevOpsIdentity[]> {
      const q = query.trim().toLowerCase();
      return MOCK_USERS.filter(
        (u) => u.displayName.toLowerCase().includes(q) || (u.email ?? '').toLowerCase().includes(q),
      );
    },
    async resolveByDescriptor(stored: AzureDevOpsIdentity): Promise<AzureDevOpsIdentity> {
      const match = MOCK_USERS.find((u) => u.descriptor === stored.descriptor);
      return match ?? { ...stored, isActive: false };
    },
  } as unknown as IdentityService;

  const permissions = {
    async canEditProjectInformation() {
      return { canEdit: true, checkFailed: false };
    },
  } as unknown as PermissionService;

  return { context, properties, identities, permissions };
}
