import type {
  BillingType,
  ContractType,
  HostingModel,
  ProjectHealth,
  ProjectPhase,
  ProjectStatus,
  ProjectType,
  ClientRegion,
  RepositorySource,
} from '@/models/ProjectInformation';

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
  /** Optional swatch colour shown before the label (CSS colour or var()). */
  color?: string;
}

export const PROJECT_STATUS_OPTIONS: DropdownOption<ProjectStatus>[] = [
  { value: 'NotStarted', label: 'Not Started', color: 'var(--pi-neutral-swatch)' },
  { value: 'InProgress', label: 'In Progress', color: 'var(--pi-accent)' },
  { value: 'OnHold', label: 'On Hold', color: 'var(--pi-warn)' },
  { value: 'Completed', label: 'Completed', color: 'var(--pi-good)' },
  { value: 'Cancelled', label: 'Cancelled', color: 'var(--pi-danger)' },
];

export const PROJECT_HEALTH_OPTIONS: DropdownOption<ProjectHealth>[] = [
  { value: 'Green', label: 'Green', color: 'var(--pi-good)' },
  { value: 'Amber', label: 'Amber', color: 'var(--pi-warn)' },
  { value: 'Red', label: 'Red', color: 'var(--pi-danger)' },
];

export const PROJECT_TYPE_OPTIONS: DropdownOption<ProjectType>[] = [
  { value: 'Development', label: 'Development' },
  { value: 'Support', label: 'Support' },
  { value: 'ResourcingModel', label: 'Resourcing Model' },
  { value: 'TrainingAndLearning', label: 'Training & Learning' },
  { value: 'Internal', label: 'Internal' },
  { value: 'Internship', label: 'Internship' },
  { value: 'POC', label: 'POC' },
  { value: 'Other', label: 'Other' },
];

export const PROJECT_PHASE_OPTIONS: DropdownOption<ProjectPhase>[] = [
  { value: 'Discovery', label: 'Discovery' },
  { value: 'RequirementGathering', label: 'Requirement Gathering' },
  { value: 'Design', label: 'Design' },
  { value: 'Development', label: 'Development' },
  { value: 'QCTesting', label: 'QC Testing' },
  { value: 'UAT', label: 'UAT' },
  { value: 'Production', label: 'Production' },
  { value: 'PostProduction', label: 'Post Production' },
  { value: 'Support', label: 'Support' },
  { value: 'Closed', label: 'Closed' },
];

export const BILLING_TYPE_OPTIONS: DropdownOption<BillingType>[] = [
  { value: 'FixedPrice', label: 'Fixed Price' },
  { value: 'TimeAndMaterial', label: 'Time and Material' },
  { value: 'Retainer', label: 'Retainer' },
  { value: 'InternalProject', label: 'Internal Project' },
  { value: 'NonBillable', label: 'Non-Billable' },
];

export const CONTRACT_TYPE_OPTIONS: DropdownOption<ContractType>[] = [
  { value: 'NewImplementation', label: 'New Implementation' },
  { value: 'Enhancement', label: 'Enhancement' },
  { value: 'Migration', label: 'Migration' },
  { value: 'Support', label: 'Support' },
  { value: 'ManagedServices', label: 'Managed Services' },
  { value: 'InternalDevelopment', label: 'Internal Development' },
];

export const REPOSITORY_SOURCE_OPTIONS: DropdownOption<RepositorySource>[] = [
  { value: 'AzureDevOps', label: 'Azure DevOps' },
  { value: 'AzureDevOpsServer', label: 'Azure DevOps Server' },
  { value: 'GitHub', label: 'GitHub' },
  { value: 'GitLab', label: 'GitLab' },
  { value: 'Bitbucket', label: 'Bitbucket' },
  { value: 'Other', label: 'Other' },
];

export const HOSTING_MODEL_OPTIONS: DropdownOption<HostingModel>[] = [
  { value: 'Cloud', label: 'Cloud' },
  { value: 'OnPremises', label: 'On-Premises' },
  { value: 'Hybrid', label: 'Hybrid' },
];

export const CLIENT_REGION_OPTIONS: DropdownOption<ClientRegion>[] = [
  { value: 'EMEA', label: 'EMEA (Europe, the Middle East and Africa)' },
  { value: 'NA', label: 'NA (North America)' },
  { value: 'LATAM', label: 'LATAM (Latin America)' },
  { value: 'APAC', label: 'APAC (Asia-Pacific)' },
  { value: 'India', label: 'India' },
  { value: 'Internal', label: 'Internal' },
];

/**
 * A configurable, non-exhaustive list of business units. Business Unit is a
 * free-text field per the spec ("Text or configurable dropdown"); these values
 * are offered as suggestions only and arbitrary text remains allowed.
 */
export const BUSINESS_UNIT_SUGGESTIONS: string[] = [
  'Application Development',
  'Cloud & Infrastructure',
  'Data & Analytics',
  'Digital Experience',
  'Managed Services',
  'Quality Engineering',
];

/** Sets of valid enum values used by the mapper to validate stored data. */
export const VALID_PROJECT_STATUS = new Set(PROJECT_STATUS_OPTIONS.map((o) => o.value));
export const VALID_PROJECT_TYPE = new Set(PROJECT_TYPE_OPTIONS.map((o) => o.value));
export const VALID_PROJECT_HEALTH = new Set(PROJECT_HEALTH_OPTIONS.map((o) => o.value));
export const VALID_PROJECT_PHASE = new Set(PROJECT_PHASE_OPTIONS.map((o) => o.value));
export const VALID_BILLING_TYPE = new Set(BILLING_TYPE_OPTIONS.map((o) => o.value));
export const VALID_CONTRACT_TYPE = new Set(CONTRACT_TYPE_OPTIONS.map((o) => o.value));
/**
 * Suggested project-team roles. Stored as the string value; "Other" lets teams
 * capture a role not in the list.
 */
export const TEAM_ROLE_OPTIONS: DropdownOption<string>[] = [
  { value: 'Project Lead', label: 'Project Lead' },
  { value: 'Delivery Manager', label: 'Delivery Manager' },
  { value: 'Technical Lead', label: 'Technical Lead' },
  { value: 'Architect', label: 'Architect' },
  { value: 'Business Analyst', label: 'Business Analyst' },
  { value: 'UI/UX Designer', label: 'UI/UX Designer' },
  { value: 'Developer', label: 'Developer' },
  { value: 'QA/QC', label: 'QA/QC Team' },
  { value: 'DevOps', label: 'DevOps Engineer' },
  { value: 'Support', label: 'Support' },
  { value: 'Internal Sponsor', label: 'Internal Sponsor' },
  { value: 'Other', label: 'Other' },
];

export const VALID_HOSTING_MODEL = new Set(HOSTING_MODEL_OPTIONS.map((o) => o.value));
export const VALID_REPOSITORY_SOURCE = new Set(REPOSITORY_SOURCE_OPTIONS.map((o) => o.value));
export const VALID_CLIENT_REGION = new Set(CLIENT_REGION_OPTIONS.map((o) => o.value));
