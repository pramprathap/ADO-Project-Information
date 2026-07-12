import type { ProjectInformation } from '@/models/ProjectInformation';
import type {
  ValidationField,
  ValidationMessage,
  ValidationResult,
} from '@/models/ValidationResult';
import { FieldLimits } from '@/constants/propertyKeys';
import { compareIsoDates, isValidIsoDate } from './dateUtils';
import { validateRepositoryUrl } from './safeUrl';

/**
 * Order in which fields appear in the form. Used to focus the first invalid
 * field on save and to order validation messages consistently.
 */
export const FIELD_ORDER: ValidationField[] = [
  'clientName',
  'projectType',
  'projectManager',
  'deliveryManager',
  'technicalLead',
  'projectStartDate',
  'plannedEndDate',
  'actualEndDate',
  'projectStatus',
  'projectHealth',
  'currentPhase',
  'billingType',
  'clientContacts',
  'clientSponsor',
  'clientRegion',
  'internalSponsor',
  'team',
  'technologyStack',
  'repositorySource',
  'repositoryUrl',
  'hostingModel',
  'additionalNotes',
];

// A pragmatic, reasonably strict email pattern. Full RFC 5322 is intentionally
// not attempted; this rejects the common mistakes without false negatives.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/**
 * Validate a full ProjectInformation record. Produces blocking errors and
 * non-blocking warnings. This is the single source of truth used by both the
 * UI (live) and the save path (guard before sending a request).
 */
export function validateProjectInformation(info: ProjectInformation): ValidationResult {
  const errors: Partial<Record<ValidationField, string>> = {};
  const warnings: Partial<Record<ValidationField, string>> = {};

  const setError = (field: ValidationField, message: string): void => {
    if (!errors[field]) {
      errors[field] = message;
    }
  };
  const setWarning = (field: ValidationField, message: string): void => {
    if (!warnings[field]) {
      warnings[field] = message;
    }
  };

  // ---- A. Project Identification ----
  const clientName = (info.clientName ?? '').trim();
  if (clientName === '') {
    setError('clientName', 'Client Name is required.');
  } else if (clientName.length > FieldLimits.ClientName) {
    setError('clientName', `Client Name must be ${FieldLimits.ClientName} characters or fewer.`);
  }

  // ---- B. Project Ownership ----
  // All person fields are optional but, if present, must be a resolved identity
  // (guards against arbitrary typed text being accepted).
  if (info.deliveryManager && !info.deliveryManager.descriptor) {
    setError('deliveryManager', 'Select a valid person for Delivery Manager.');
  }
  if (info.projectManager && !info.projectManager.descriptor) {
    setError('projectManager', 'Select a valid person for Project Manager / Project Lead.');
  }
  if (info.technicalLead && !info.technicalLead.descriptor) {
    setError('technicalLead', 'Select a valid person for Technical Lead.');
  }
  if (info.internalSponsor && !info.internalSponsor.descriptor) {
    setError('internalSponsor', 'Select a valid person for Internal Sponsor.');
  }

  // Project team: each row must have both a role and a resolved person.
  for (const member of info.team ?? []) {
    const hasRole = member.role.trim() !== '';
    const hasPerson = !!member.identity && !!member.identity.descriptor;
    if (hasRole !== hasPerson) {
      setError('team', 'Each team member needs both a role and a selected person.');
      break;
    }
  }

  // ---- C. Timeline ----
  // Project Start Date is optional; validate its format only when provided.
  const start = (info.projectStartDate ?? '').trim();
  if (start !== '' && !isValidIsoDate(start)) {
    setError('projectStartDate', 'Enter a valid date.');
  }

  const planned = (info.plannedEndDate ?? '').trim();
  if (planned !== '') {
    if (!isValidIsoDate(planned)) {
      setError('plannedEndDate', 'Enter a valid date.');
    } else if (isValidIsoDate(start) && compareIsoDates(planned, start) < 0) {
      setError('plannedEndDate', 'Planned End Date cannot be earlier than Project Start Date.');
    }
  }

  const actual = (info.actualEndDate ?? '').trim();
  if (actual !== '') {
    if (!isValidIsoDate(actual)) {
      setError('actualEndDate', 'Enter a valid date.');
    } else if (isValidIsoDate(start) && compareIsoDates(actual, start) < 0) {
      setError('actualEndDate', 'Actual End Date cannot be earlier than Project Start Date.');
    }
  }

  // ---- D. Delivery Status ----
  // Project Status stays required; Project Health is optional.
  if (!info.projectStatus) {
    setError('projectStatus', 'Project Status is required.');
  }
  // Completed projects should warn (not block) when Actual End Date is empty.
  if (info.projectStatus === 'Completed' && actual === '') {
    setWarning('actualEndDate', 'This project is Completed but has no Actual End Date.');
  }

  // ---- F. Client Information ----
  for (const contact of info.clientContacts ?? []) {
    const contactEmail = (contact.email ?? '').trim();
    if (
      contactEmail !== '' &&
      (contactEmail.length > FieldLimits.ClientContactEmail || !isValidEmail(contactEmail))
    ) {
      setError('clientContacts', 'Enter a valid email address for each client contact.');
      break;
    }
  }
  if (!info.clientRegion) {
    setError('clientRegion', 'Client Region is required.');
  }

  // ---- G. Technical Information ----
  if ((info.technologyStack ?? '').trim().length > FieldLimits.TechnologyStack) {
    setError(
      'technologyStack',
      `Technology Stack must be ${FieldLimits.TechnologyStack} characters or fewer.`,
    );
  }
  const repoResult = validateRepositoryUrl(info.repositoryUrl);
  if (!repoResult.isValid) {
    setError('repositoryUrl', repoResult.message ?? 'Enter a valid URL.');
  } else if ((info.repositoryUrl ?? '').trim().length > FieldLimits.RepositoryUrl) {
    setError(
      'repositoryUrl',
      `Repository URL must be ${FieldLimits.RepositoryUrl} characters or fewer.`,
    );
  }
  if ((info.additionalNotes ?? '').trim().length > FieldLimits.AdditionalNotes) {
    setError(
      'additionalNotes',
      `Additional Notes must be ${FieldLimits.AdditionalNotes} characters or fewer.`,
    );
  }

  const messages: ValidationMessage[] = [];
  for (const field of FIELD_ORDER) {
    if (errors[field]) {
      messages.push({ field, message: errors[field] as string, severity: 'error' });
    }
  }
  for (const field of FIELD_ORDER) {
    if (warnings[field]) {
      messages.push({ field, message: warnings[field] as string, severity: 'warning' });
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    warnings,
    messages,
  };
}

/** The first invalid field in form order, for focus management. */
export function firstInvalidField(result: ValidationResult): ValidationField | undefined {
  return FIELD_ORDER.find((f) => result.errors[f]);
}
