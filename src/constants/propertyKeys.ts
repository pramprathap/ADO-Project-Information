/**
 * Canonical Azure DevOps project-property keys used by this extension.
 *
 * All keys share the `Veelead.ProjectInformation.` namespace so we can read and
 * write only our own properties and never touch unrelated project properties.
 *
 * Person fields are stored as three separate properties (descriptor / display
 * name / email). The descriptor is the canonical, stable identity identifier.
 */
export const PROPERTY_NAMESPACE = 'Veelead.ProjectInformation.';

/** Increment when the stored shape changes in a non-backward-compatible way. */
export const CURRENT_SCHEMA_VERSION = 1;

export const PropertyKeys = {
  SchemaVersion: 'Veelead.ProjectInformation.SchemaVersion',

  // A. Project Identification
  ClientName: 'Veelead.ProjectInformation.ClientName',
  ProjectType: 'Veelead.ProjectInformation.ProjectType',
  ProjectCode: 'Veelead.ProjectInformation.ProjectCode',
  BusinessUnit: 'Veelead.ProjectInformation.BusinessUnit',

  // B. Project Ownership (person fields)
  ProjectManagerDescriptor: 'Veelead.ProjectInformation.ProjectManager.Descriptor',
  ProjectManagerDisplayName: 'Veelead.ProjectInformation.ProjectManager.DisplayName',
  ProjectManagerEmail: 'Veelead.ProjectInformation.ProjectManager.Email',

  DeliveryManagerDescriptor: 'Veelead.ProjectInformation.DeliveryManager.Descriptor',
  DeliveryManagerDisplayName: 'Veelead.ProjectInformation.DeliveryManager.DisplayName',
  DeliveryManagerEmail: 'Veelead.ProjectInformation.DeliveryManager.Email',

  TechnicalLeadDescriptor: 'Veelead.ProjectInformation.TechnicalLead.Descriptor',
  TechnicalLeadDisplayName: 'Veelead.ProjectInformation.TechnicalLead.DisplayName',
  TechnicalLeadEmail: 'Veelead.ProjectInformation.TechnicalLead.Email',

  // C. Timeline
  ProjectStartDate: 'Veelead.ProjectInformation.ProjectStartDate',
  PlannedEndDate: 'Veelead.ProjectInformation.PlannedEndDate',
  ActualEndDate: 'Veelead.ProjectInformation.ActualEndDate',
  /** How many times the Actual / Revised End Date has changed across saves. */
  EndDateRevisionCount: 'Veelead.ProjectInformation.EndDateRevisionCount',

  // D. Delivery Status
  ProjectStatus: 'Veelead.ProjectInformation.ProjectStatus',
  ProjectHealth: 'Veelead.ProjectInformation.ProjectHealth',
  CurrentPhase: 'Veelead.ProjectInformation.CurrentPhase',

  // E. Commercial Information
  BillingType: 'Veelead.ProjectInformation.BillingType',
  ContractType: 'Veelead.ProjectInformation.ContractType',
  PurchaseOrderNumber: 'Veelead.ProjectInformation.PurchaseOrderNumber',

  // F. Client Information
  /** Client contacts stored as a JSON array of { name, email } (max 3). */
  ClientContacts: 'Veelead.ProjectInformation.ClientContacts',
  ClientSponsor: 'Veelead.ProjectInformation.ClientSponsor',
  /** Legacy single-contact keys (migrated into ClientContacts, then removed). */
  ClientContactName: 'Veelead.ProjectInformation.ClientContactName',
  ClientContactEmail: 'Veelead.ProjectInformation.ClientContactEmail',
  ClientRegion: 'Veelead.ProjectInformation.ClientRegion',

  InternalSponsorDescriptor: 'Veelead.ProjectInformation.InternalSponsor.Descriptor',
  InternalSponsorDisplayName: 'Veelead.ProjectInformation.InternalSponsor.DisplayName',
  InternalSponsorEmail: 'Veelead.ProjectInformation.InternalSponsor.Email',

  /** Project team stored as a JSON array of { role, descriptor, displayName, email }. */
  ProjectTeam: 'Veelead.ProjectInformation.ProjectTeam',

  /** Per-Epic classification stored as a JSON map of { [epicId]: tag }. */
  EpicTags: 'Veelead.ProjectInformation.EpicTags',

  // G. Technical Information
  TechnologyStack: 'Veelead.ProjectInformation.TechnologyStack',
  RepositorySource: 'Veelead.ProjectInformation.RepositorySource',
  RepositoryUrl: 'Veelead.ProjectInformation.RepositoryUrl',
  HostingModel: 'Veelead.ProjectInformation.HostingModel',
  AdditionalNotes: 'Veelead.ProjectInformation.AdditionalNotes',

  // Audit
  LastUpdatedAt: 'Veelead.ProjectInformation.LastUpdatedAt',
  LastUpdatedByDescriptor: 'Veelead.ProjectInformation.LastUpdatedBy.Descriptor',
  LastUpdatedByDisplayName: 'Veelead.ProjectInformation.LastUpdatedBy.DisplayName',
  LastUpdatedByEmail: 'Veelead.ProjectInformation.LastUpdatedBy.Email',
} as const;

export type PropertyKey = (typeof PropertyKeys)[keyof typeof PropertyKeys];

/** Field length limits enforced in both UI and mapper/service validation. */
export const FieldLimits = {
  ClientName: 200,
  ProjectCode: 50,
  BusinessUnit: 200,
  PurchaseOrderNumber: 100,
  ClientContactName: 200,
  ClientContactEmail: 320,
  TechnologyStack: 1000,
  RepositoryUrl: 2000,
  AdditionalNotes: 4000,
} as const;
