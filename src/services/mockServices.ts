import type { AppServices } from './appServices';
import type { SdkContext } from './sdkContext';
import type { ProjectPropertiesService } from './ProjectPropertiesService';
import type { IdentityService } from './IdentityService';
import type { PermissionService } from './PermissionService';
import type { ClientDirectoryService } from './ClientDirectoryService';
import type { WorkItemService } from './WorkItemService';
import type { PatchOperation, PropertyBag } from '@/utils/propertyMapper';
import type { AzureDevOpsIdentity } from '@/models/AzureDevOpsIdentity';
import type { ProjectReportMetrics } from '@/models/ProjectReport';

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
    async isProjectAdministrator() {
      return true;
    },
  } as unknown as PermissionService;

  const knownClients = ['AAF', 'Brecoflex', 'NMC', 'Summit'];
  const clientDirectory = {
    async getClientNames() {
      return [...knownClients];
    },
    async addClientName(name: string) {
      const trimmed = name.trim();
      if (trimmed && !knownClients.some((n) => n.toLowerCase() === trimmed.toLowerCase())) {
        knownClients.push(trimmed);
      }
    },
  } as unknown as ClientDirectoryService;

  const workItems = {
    async getReport(): Promise<ProjectReportMetrics> {
      return {
        asOf: '2026-07-11T09:00:00.000Z',
        truncated: false,
        total: 63,
        completed: 39,
        inProgress: 18,
        notStarted: 6,
        completionPct: 62,
        overdue: 3,
        blockers: 2,
        byState: [
          { key: 'Closed', count: 39 },
          { key: 'Active', count: 14 },
          { key: 'New', count: 6 },
          { key: 'Resolved', count: 4 },
        ],
        byType: [
          { key: 'Task', count: 28 },
          { key: 'User Story', count: 17 },
          { key: 'Bug', count: 12 },
          { key: 'Epic', count: 6 },
        ],
        bugs: { total: 12, open: 4, closed: 8, reopened: 1, reworkRate: 1 / 8 },
        milestonesAvailable: true,
        milestonesOverdue: 5,
        milestones: [
          {
            phase: 'Requirement',
            revisedCount: 0,
            status: 'completed',
            overdue: false,
            targetDate: '2025-08-05',
          },
          {
            phase: 'Development',
            revisedCount: 1,
            status: 'overdue',
            overdue: true,
            slipDays: 318,
            targetDate: '2025-08-10',
            revisedDate: '2025-08-20',
          },
          {
            phase: 'QA / QC',
            revisedCount: 0,
            status: 'overdue',
            overdue: true,
            slipDays: 316,
            targetDate: '2025-08-12',
          },
          {
            phase: 'UAT',
            revisedCount: 0,
            status: 'overdue',
            overdue: true,
            slipDays: 314,
            targetDate: '2025-08-13',
          },
          {
            phase: 'Go-Live',
            revisedCount: 2,
            status: 'overdue',
            overdue: true,
            slipDays: 313,
            targetDate: '2025-08-15',
            revisedDate: '2025-08-18',
          },
          {
            phase: 'Post-Production',
            revisedCount: 0,
            status: 'overdue',
            overdue: true,
            slipDays: 311,
            targetDate: '2025-08-16',
          },
          {
            phase: 'Sign-Off',
            revisedCount: 0,
            status: 'upcoming',
            overdue: false,
            targetDate: '2026-08-21',
          },
        ],
        typeBreakdown: [
          { type: 'Epic', open: 0, inProgress: 1, completed: 0, overdue: 0, total: 1 },
          { type: 'Feature', open: 1, inProgress: 1, completed: 1, overdue: 0, total: 3 },
          { type: 'User Story', open: 3, inProgress: 1, completed: 2, overdue: 2, total: 6 },
          { type: 'Task', open: 4, inProgress: 1, completed: 5, overdue: 3, total: 10 },
          { type: 'Bug', open: 3, inProgress: 0, completed: 2, overdue: 2, total: 5 },
        ],
        effort: {
          plannedHrs: 320,
          actualHrs: 410,
          enteredHrs: 455,
          gapAccuracyPct: 28,
          gapHygienePct: 11,
          gapBudgetPct: 42,
        },
        team: [
          { name: 'RamPrathap P', initials: 'RP', loggedHrs: 225, effortPct: 55, leaveHrs: 0 },
          { name: 'Priya N', initials: 'PN', loggedHrs: 185, effortPct: 45, leaveHrs: 8 },
        ],
        teamLoggedHrs: 410,
        teamLeaveHrs: 8,
        analyticsUsed: false,
        remainingHrs: 217,
        weekly: [
          { label: 'W1', opened: 8, closed: 6, remainingHrs: 430, idealHrs: 385 },
          { label: 'W2', opened: 5, closed: 7, remainingHrs: 405, idealHrs: 330 },
          { label: 'W3', opened: 9, closed: 6, remainingHrs: 372, idealHrs: 275 },
          { label: 'W4', opened: 6, closed: 7, remainingHrs: 338, idealHrs: 220 },
          { label: 'W5', opened: 4, closed: 5, remainingHrs: 300, idealHrs: 165 },
          { label: 'W6', opened: 5, closed: 6, remainingHrs: 268, idealHrs: 110 },
          { label: 'W7', opened: 3, closed: 8, remainingHrs: 232, idealHrs: 55 },
          { label: 'W8', opened: 6, closed: 7, remainingHrs: 217, idealHrs: 0 },
        ],
        signOff: {
          criticalOpen: 2,
          blockedItems: 4,
          overdueOpen: 4,
          openBugs: 4,
          pendingApprovals: 2,
          status: 'Blocked',
        },
        dataQuality: [
          { id: 21830, type: 'Epic', title: 'Portfolio App Change Request 01 Delivery', state: 'Active', issues: ['Stale 7d'] },
          { id: 21549, type: 'Feature', title: 'Requirement', state: 'Completed', issues: ['No start date', 'No original estimate'] },
          { id: 21600, type: 'Feature', title: 'Development', state: 'Active', issues: ['No start date', 'No original estimate'] },
        ],
        openItems: [
          { id: 1600, type: 'Blocker', kind: 'Blocker', title: 'Client decision on auth model', state: 'Active', owner: 'RamPrathap P', raisedTo: 'Client', ageDays: 21 },
          { id: 1601, type: 'Blocker', kind: 'Blocker', title: 'API contract from Atkore IT', state: 'Active', owner: 'RamPrathap P', raisedTo: 'Client', ageDays: 14 },
          { id: 1701, type: 'Clarifications', kind: 'Clarification', title: 'Firewall / IP whitelisting', state: 'New', owner: 'Client IT', raisedTo: 'Client', ageDays: 13 },
          { id: 1602, type: 'Clarifications', kind: 'Clarification', title: 'UAT environment access?', state: 'Active', owner: 'DevOps', raisedTo: 'Internal', ageDays: 9 },
          { id: 1700, type: 'Clarifications', kind: 'Clarification', title: 'Sign-off on wireframes', state: 'Active', owner: 'Client SME', raisedTo: 'Internal', ageDays: 6 },
          { id: 1603, type: 'Blocker', kind: 'Blocker', title: 'Change request sign-off', state: 'Active', owner: 'PMO', raisedTo: 'Client', ageDays: 5 },
        ],
        sprints: [
          {
            name: 'Sprint 4',
            path: '\\Sprint 4',
            startDate: '2026-05-01',
            finishDate: '2026-05-14',
            timeframe: 'past',
          },
          {
            name: 'Sprint 5',
            path: '\\Sprint 5',
            startDate: '2026-05-15',
            finishDate: '2026-05-28',
            timeframe: 'past',
          },
          {
            name: 'Sprint 6',
            path: '\\Sprint 6',
            startDate: '2026-07-06',
            finishDate: '2026-07-19',
            timeframe: 'current',
          },
          {
            name: 'Sprint 7',
            path: '\\Sprint 7',
            startDate: '2026-07-20',
            finishDate: '2026-08-02',
            timeframe: 'future',
          },
        ],
        sprintStats: { total: 4, done: 2, inProgress: 1, pending: 1 },
        epics: [
          {
            id: 21863,
            title: 'PRC Application Delivery',
            epicType: 'Development',
            isDevelopment: true,
            track: 'Phased delivery',
            lead: 'Venkata Teja K',
            state: 'Active',
            completed: false,
            goLiveDate: '2025-08-18',
            goLiveStatus: 'Overdue',
            openBlockers: 2,
            openClarifications: 1,
            milestonesOverdue: 5,
            milestones: [
              { phase: 'Requirement', revisedCount: 0, status: 'completed', overdue: false, targetDate: '2025-08-05' },
              { phase: 'Development', revisedCount: 1, status: 'overdue', overdue: true, slipDays: 318, targetDate: '2025-08-10', revisedDate: '2025-08-20' },
              { phase: 'QA / QC', revisedCount: 0, status: 'overdue', overdue: true, slipDays: 316, targetDate: '2025-08-12' },
              { phase: 'UAT', revisedCount: 0, status: 'overdue', overdue: true, slipDays: 314, targetDate: '2025-08-13' },
              { phase: 'Go-Live', revisedCount: 2, status: 'overdue', overdue: true, slipDays: 313, targetDate: '2025-08-15', revisedDate: '2025-08-18' },
              { phase: 'Post-Production', revisedCount: 0, status: 'overdue', overdue: true, slipDays: 311, targetDate: '2025-08-16' },
              { phase: 'Sign-Off', revisedCount: 0, status: 'upcoming', overdue: false, targetDate: '2026-08-21' },
            ],
            openItems: [
              { id: 1600, type: 'Blocker', kind: 'Blocker', title: 'Client decision on auth model', state: 'Active', owner: 'RamPrathap P', raisedTo: 'Client', ageDays: 21 },
              { id: 1701, type: 'Clarifications', kind: 'Clarification', title: 'Firewall / IP whitelisting', state: 'New', owner: 'Client IT', ageDays: 13 },
            ],
          },
          {
            id: 21970,
            title: 'Support & Enhancements',
            epicType: 'Support',
            isDevelopment: false,
            track: 'Continuous / Activity-based',
            lead: 'Rajesh K',
            state: 'Closed',
            completed: true,
            goLiveStatus: 'Completed',
            openBlockers: 0,
            openClarifications: 1,
            milestonesOverdue: 0,
            milestones: [],
            openItems: [
              { id: 1700, type: 'Clarifications', kind: 'Clarification', title: 'Sign-off on wireframes', state: 'Active', owner: 'Client SME', ageDays: 6 },
            ],
          },
        ],
        workItems: [
          {
            id: 700,
            type: 'Epic',
            title: 'Portfolio App Change Request 01 Delivery',
            state: 'Active',
            assignedTo: 'RamPrathap P',
            iteration: '\\Program',
            overdue: false,
            depth: 0,
          },
          {
            id: 790,
            type: 'User Story',
            title: 'Dataverse migration of accounts',
            state: 'Active',
            assignedTo: 'Rajesh K',
            iteration: '\\Sprint 6',
            overdue: false,
            parentId: 700,
            depth: 1,
          },
          {
            id: 733,
            type: 'Task',
            title: 'Configure Power BI workspace',
            state: 'Closed',
            assignedTo: 'Venkata Teja K',
            iteration: '\\Sprint 5',
            overdue: false,
            parentId: 790,
            depth: 2,
          },
          {
            id: 812,
            type: 'Bug',
            title: 'Login fails on Safari',
            state: 'Active',
            assignedTo: 'Arun Kumar P',
            dueDate: '2026-07-05',
            iteration: '\\Sprint 6',
            overdue: true,
            parentId: 790,
            depth: 2,
          },
        ],
        openItemsTree: [
          { id: 950, type: 'Feature', title: 'Open Items / Clarifications', state: 'Active', overdue: false, depth: 0 },
          { id: 951, type: 'Open Items', title: 'User Onboarding – HR Process', state: 'New', overdue: false, parentId: 950, depth: 1 },
          { id: 952, type: 'Clarifications', title: 'Define all the onboarding activities', state: 'New', overdue: false, parentId: 951, depth: 2 },
          { id: 953, type: 'Clarifications', title: 'Who in HR can submit onboarding requests?', state: 'New', overdue: false, parentId: 951, depth: 2 },
          { id: 954, type: 'Blocker', title: 'VPN access provisioning', state: 'Active', overdue: false, parentId: 951, depth: 2 },
          { id: 955, type: 'Open Items', title: 'User Onboarding Naming & UPN', state: 'New', overdue: false, parentId: 950, depth: 1 },
          { id: 956, type: 'Clarifications', title: 'Does HR use an HRIS system?', state: 'New', overdue: false, parentId: 955, depth: 2 },
        ],
      };
    },
  } as unknown as WorkItemService;

  return { context, properties, identities, permissions, clientDirectory, workItems };
}
