/** Field keys that can carry a validation message. Mirrors form field names. */
export type ValidationField =
  | 'clientName'
  | 'projectType'
  | 'projectCode'
  | 'businessUnit'
  | 'projectManager'
  | 'deliveryManager'
  | 'technicalLead'
  | 'projectStartDate'
  | 'plannedEndDate'
  | 'actualEndDate'
  | 'projectStatus'
  | 'projectHealth'
  | 'currentPhase'
  | 'billingType'
  | 'contractType'
  | 'purchaseOrderNumber'
  | 'clientContacts'
  | 'clientSponsor'
  | 'clientRegion'
  | 'internalSponsor'
  | 'team'
  | 'technologyStack'
  | 'repositorySource'
  | 'repositoryUrl'
  | 'hostingModel'
  | 'additionalNotes';

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationMessage {
  field: ValidationField;
  message: string;
  severity: ValidationSeverity;
}

export interface ValidationResult {
  isValid: boolean;
  /** Map keyed by field for quick UI lookup. */
  errors: Partial<Record<ValidationField, string>>;
  /** Non-blocking warnings (e.g. Completed project with no Actual End Date). */
  warnings: Partial<Record<ValidationField, string>>;
  /** Ordered list, useful for focusing the first invalid field. */
  messages: ValidationMessage[];
}
