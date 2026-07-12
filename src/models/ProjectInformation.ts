import type { AzureDevOpsIdentity } from './AzureDevOpsIdentity';

export type ProjectStatus = 'NotStarted' | 'InProgress' | 'OnHold' | 'Completed' | 'Cancelled';

export type ProjectType =
  'Development' | 'Support' | 'TrainingAndLearning' | 'Internal' | 'Internship' | 'POC' | 'Other';

export type ProjectHealth = 'Green' | 'Amber' | 'Red';

export type ProjectPhase =
  | 'Discovery'
  | 'RequirementGathering'
  | 'Design'
  | 'Development'
  | 'QCTesting'
  | 'UAT'
  | 'Production'
  | 'PostProduction'
  | 'Support'
  | 'Closed';

export type BillingType =
  'FixedPrice' | 'TimeAndMaterial' | 'Retainer' | 'InternalProject' | 'NonBillable';

export type ContractType =
  | 'NewImplementation'
  | 'Enhancement'
  | 'Migration'
  | 'Support'
  | 'ManagedServices'
  | 'InternalDevelopment';

export type HostingModel = 'Cloud' | 'OnPremises' | 'Hybrid';

export type RepositorySource =
  'AzureDevOps' | 'AzureDevOpsServer' | 'GitHub' | 'GitLab' | 'Bitbucket' | 'Other';

export type ClientRegion = 'EMEA' | 'NA' | 'LATAM' | 'APAC' | 'India' | 'Internal';

/**
 * The full, strongly-typed project-information record edited by the UI and
 * (de)serialised to Azure DevOps project properties by the mapper.
 *
 * Dates are stored as ISO date strings (`YYYY-MM-DD`). `lastUpdatedAt` is an
 * ISO 8601 UTC timestamp.
 */
export interface ProjectInformation {
  schemaVersion: number;

  // A. Project Identification
  clientName: string;
  projectType?: ProjectType;
  projectCode: string;
  businessUnit?: string;

  // B. Project Ownership
  projectManager: AzureDevOpsIdentity | null;
  deliveryManager: AzureDevOpsIdentity | null;
  technicalLead: AzureDevOpsIdentity | null;

  // C. Timeline
  projectStartDate: string;
  plannedEndDate?: string;
  actualEndDate?: string;
  /** Times the Actual / Revised End Date has changed across saves. */
  endDateRevisionCount: number;

  // D. Delivery Status
  projectStatus: ProjectStatus | '';
  projectHealth: ProjectHealth | '';
  currentPhase?: ProjectPhase;

  // E. Commercial Information
  billingType?: BillingType;
  contractType?: ContractType;
  purchaseOrderNumber?: string;

  // F. Client Information
  clientContacts: ClientContact[];
  clientSponsor?: string;
  clientRegion: ClientRegion | '';
  internalSponsor: AzureDevOpsIdentity | null;

  // Project team (variable-length list of role + person)
  team: TeamMember[];

  // G. Technical Information
  technologyStack?: string;
  repositorySource?: RepositorySource;
  repositoryUrl?: string;
  hostingModel?: HostingModel;
  additionalNotes?: string;

  // Audit
  lastUpdatedAt?: string;
  lastUpdatedBy?: AzureDevOpsIdentity;
}

/** A single project-team assignment: a role held by an Azure DevOps identity. */
export interface TeamMember {
  role: string;
  identity: AzureDevOpsIdentity | null;
}

/** A client-side point of contact (free text — not an Azure DevOps identity). */
export interface ClientContact {
  name: string;
  email: string;
}

/** Maximum number of client contacts that can be captured. */
export const MAX_CLIENT_CONTACTS = 3;

/** A blank record used for newly-created projects with no stored properties. */
export function createEmptyProjectInformation(): ProjectInformation {
  return {
    schemaVersion: 1,
    clientName: '',
    projectType: undefined,
    projectCode: '',
    businessUnit: '',
    projectManager: null,
    deliveryManager: null,
    technicalLead: null,
    projectStartDate: '',
    plannedEndDate: '',
    actualEndDate: '',
    endDateRevisionCount: 0,
    projectStatus: '',
    projectHealth: '',
    currentPhase: undefined,
    billingType: undefined,
    contractType: undefined,
    purchaseOrderNumber: '',
    clientContacts: [],
    clientSponsor: '',
    clientRegion: '',
    internalSponsor: null,
    team: [],
    technologyStack: '',
    repositorySource: undefined,
    repositoryUrl: '',
    hostingModel: undefined,
    additionalNotes: '',
  };
}
