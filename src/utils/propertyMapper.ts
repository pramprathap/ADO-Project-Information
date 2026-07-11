import type { AzureDevOpsIdentity } from '@/models/AzureDevOpsIdentity';
import type {
  BillingType,
  ContractType,
  HostingModel,
  ProjectHealth,
  ProjectInformation,
  ProjectPhase,
  ProjectStatus,
  ProjectType,
  ClientRegion,
  RepositorySource,
} from '@/models/ProjectInformation';
import { createEmptyProjectInformation } from '@/models/ProjectInformation';
import { CURRENT_SCHEMA_VERSION, PropertyKeys } from '@/constants/propertyKeys';
import {
  VALID_BILLING_TYPE,
  VALID_CLIENT_REGION,
  VALID_CONTRACT_TYPE,
  VALID_HOSTING_MODEL,
  VALID_PROJECT_HEALTH,
  VALID_PROJECT_PHASE,
  VALID_PROJECT_STATUS,
  VALID_PROJECT_TYPE,
  VALID_REPOSITORY_SOURCE,
} from '@/constants/dropdownOptions';
import { normalizeIsoDate } from './dateUtils';

/** JSON-Patch operation accepted by the project-properties PATCH endpoint. */
export interface PatchOperation {
  op: 'add' | 'replace' | 'remove';
  path: string;
  value?: string;
}

/** Raw project properties as returned/consumed by the REST client. */
export type PropertyBag = Record<string, string | undefined>;

// ---- Deserialisation helpers -------------------------------------------------

function str(bag: PropertyBag, key: string): string {
  const v = bag[key];
  return typeof v === 'string' ? v : '';
}

function optionalStr(bag: PropertyBag, key: string): string | undefined {
  const v = bag[key];
  if (typeof v !== 'string') {
    return undefined;
  }
  const trimmed = v.trim();
  return trimmed === '' ? undefined : trimmed;
}

function enumOrUndefined<T extends string>(
  bag: PropertyBag,
  key: string,
  valid: Set<string>,
): T | undefined {
  const v = optionalStr(bag, key);
  return v && valid.has(v) ? (v as T) : undefined;
}

interface StoredTeamMember {
  role?: unknown;
  descriptor?: unknown;
  displayName?: unknown;
  email?: unknown;
}

/** Safely parse the JSON team property into validated team members. */
function readTeam(raw: string): import('@/models/ProjectInformation').TeamMember[] {
  if (!raw.trim()) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  const members: import('@/models/ProjectInformation').TeamMember[] = [];
  for (const entry of parsed as StoredTeamMember[]) {
    const role = typeof entry?.role === 'string' ? entry.role.trim() : '';
    const descriptor = typeof entry?.descriptor === 'string' ? entry.descriptor.trim() : '';
    if (!role || !descriptor) {
      continue; // skip malformed rows
    }
    const displayName =
      typeof entry?.displayName === 'string' && entry.displayName.trim()
        ? entry.displayName.trim()
        : descriptor;
    const email =
      typeof entry?.email === 'string' && entry.email.trim() ? entry.email.trim() : undefined;
    members.push({
      role,
      identity: email ? { descriptor, displayName, email } : { descriptor, displayName },
    });
  }
  return members;
}

interface StoredClientContact {
  name?: unknown;
  email?: unknown;
}

/**
 * Parse the JSON client-contacts property. Falls back to the legacy single
 * name/email properties when the JSON list is absent (backward compatibility).
 * Capped at MAX_CLIENT_CONTACTS.
 */
function readClientContacts(
  raw: string,
  legacyName: string | undefined,
  legacyEmail: string | undefined,
): import('@/models/ProjectInformation').ClientContact[] {
  const max = 3;
  const out: import('@/models/ProjectInformation').ClientContact[] = [];
  if (raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const entry of parsed as StoredClientContact[]) {
          const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
          const email = typeof entry?.email === 'string' ? entry.email.trim() : '';
          if (name || email) {
            out.push({ name, email });
          }
          if (out.length >= max) {
            break;
          }
        }
      }
    } catch {
      /* ignore malformed JSON */
    }
  }
  if (out.length === 0 && (legacyName || legacyEmail)) {
    out.push({ name: legacyName ?? '', email: legacyEmail ?? '' });
  }
  return out;
}

/** Read a person field's three properties into an identity, or null if unset. */
function readIdentity(
  bag: PropertyBag,
  descriptorKey: string,
  displayNameKey: string,
  emailKey: string,
): AzureDevOpsIdentity | null {
  const descriptor = optionalStr(bag, descriptorKey);
  if (!descriptor) {
    return null;
  }
  const identity: AzureDevOpsIdentity = {
    descriptor,
    displayName: optionalStr(bag, displayNameKey) ?? descriptor,
  };
  const email = optionalStr(bag, emailKey);
  if (email) {
    identity.email = email;
  }
  return identity;
}

/**
 * Convert a raw project-property bag into a strongly-typed ProjectInformation.
 * Unknown/invalid enum values and malformed dates are dropped safely so a
 * corrupt or older-schema property never breaks the UI.
 */
export function fromProperties(bag: PropertyBag): ProjectInformation {
  const info = createEmptyProjectInformation();

  const rawSchema = Number(str(bag, PropertyKeys.SchemaVersion));
  info.schemaVersion =
    Number.isFinite(rawSchema) && rawSchema > 0 ? rawSchema : CURRENT_SCHEMA_VERSION;

  info.clientName = str(bag, PropertyKeys.ClientName).trim();
  info.projectType = enumOrUndefined<ProjectType>(
    bag,
    PropertyKeys.ProjectType,
    VALID_PROJECT_TYPE,
  );
  info.projectCode = str(bag, PropertyKeys.ProjectCode).trim();
  info.businessUnit = optionalStr(bag, PropertyKeys.BusinessUnit) ?? '';

  info.projectManager = readIdentity(
    bag,
    PropertyKeys.ProjectManagerDescriptor,
    PropertyKeys.ProjectManagerDisplayName,
    PropertyKeys.ProjectManagerEmail,
  );
  info.deliveryManager = readIdentity(
    bag,
    PropertyKeys.DeliveryManagerDescriptor,
    PropertyKeys.DeliveryManagerDisplayName,
    PropertyKeys.DeliveryManagerEmail,
  );
  info.technicalLead = readIdentity(
    bag,
    PropertyKeys.TechnicalLeadDescriptor,
    PropertyKeys.TechnicalLeadDisplayName,
    PropertyKeys.TechnicalLeadEmail,
  );

  info.projectStartDate = normalizeIsoDate(str(bag, PropertyKeys.ProjectStartDate)) ?? '';
  info.plannedEndDate = normalizeIsoDate(str(bag, PropertyKeys.PlannedEndDate)) ?? '';
  info.actualEndDate = normalizeIsoDate(str(bag, PropertyKeys.ActualEndDate)) ?? '';
  const revisions = Number(str(bag, PropertyKeys.EndDateRevisionCount));
  info.endDateRevisionCount =
    Number.isFinite(revisions) && revisions > 0 ? Math.floor(revisions) : 0;

  info.projectStatus =
    enumOrUndefined<ProjectStatus>(bag, PropertyKeys.ProjectStatus, VALID_PROJECT_STATUS) ?? '';
  info.projectHealth =
    enumOrUndefined<ProjectHealth>(bag, PropertyKeys.ProjectHealth, VALID_PROJECT_HEALTH) ?? '';
  info.currentPhase = enumOrUndefined<ProjectPhase>(
    bag,
    PropertyKeys.CurrentPhase,
    VALID_PROJECT_PHASE,
  );

  info.billingType = enumOrUndefined<BillingType>(
    bag,
    PropertyKeys.BillingType,
    VALID_BILLING_TYPE,
  );
  info.contractType = enumOrUndefined<ContractType>(
    bag,
    PropertyKeys.ContractType,
    VALID_CONTRACT_TYPE,
  );
  info.purchaseOrderNumber = optionalStr(bag, PropertyKeys.PurchaseOrderNumber) ?? '';

  info.clientContacts = readClientContacts(
    str(bag, PropertyKeys.ClientContacts),
    optionalStr(bag, PropertyKeys.ClientContactName),
    optionalStr(bag, PropertyKeys.ClientContactEmail),
  );
  info.clientSponsor = optionalStr(bag, PropertyKeys.ClientSponsor) ?? '';
  info.clientRegion =
    enumOrUndefined<ClientRegion>(bag, PropertyKeys.ClientRegion, VALID_CLIENT_REGION) ?? '';
  info.internalSponsor = readIdentity(
    bag,
    PropertyKeys.InternalSponsorDescriptor,
    PropertyKeys.InternalSponsorDisplayName,
    PropertyKeys.InternalSponsorEmail,
  );

  info.team = readTeam(str(bag, PropertyKeys.ProjectTeam));

  info.technologyStack = optionalStr(bag, PropertyKeys.TechnologyStack) ?? '';
  info.repositorySource = enumOrUndefined<RepositorySource>(
    bag,
    PropertyKeys.RepositorySource,
    VALID_REPOSITORY_SOURCE,
  );
  info.repositoryUrl = optionalStr(bag, PropertyKeys.RepositoryUrl) ?? '';
  info.hostingModel = enumOrUndefined<HostingModel>(
    bag,
    PropertyKeys.HostingModel,
    VALID_HOSTING_MODEL,
  );
  info.additionalNotes = optionalStr(bag, PropertyKeys.AdditionalNotes) ?? '';

  info.lastUpdatedAt = optionalStr(bag, PropertyKeys.LastUpdatedAt);
  const lastBy = readIdentity(
    bag,
    PropertyKeys.LastUpdatedByDescriptor,
    PropertyKeys.LastUpdatedByDisplayName,
    PropertyKeys.LastUpdatedByEmail,
  );
  if (lastBy) {
    info.lastUpdatedBy = lastBy;
  }

  return info;
}

// ---- Serialisation helpers ---------------------------------------------------

/**
 * Build the desired full property bag for a record. Only non-empty values are
 * emitted; anything omitted is treated as "should not exist" and will be
 * removed from the stored set by the diff below.
 */
export function toPropertyBag(info: ProjectInformation): PropertyBag {
  const bag: PropertyBag = {};

  const put = (key: string, value: string | undefined): void => {
    const v = (value ?? '').trim();
    if (v !== '') {
      bag[key] = v;
    }
  };

  const putIdentity = (
    identity: AzureDevOpsIdentity | null | undefined,
    descriptorKey: string,
    displayNameKey: string,
    emailKey: string,
  ): void => {
    if (identity && identity.descriptor) {
      bag[descriptorKey] = identity.descriptor;
      bag[displayNameKey] = identity.displayName;
      if (identity.email) {
        bag[emailKey] = identity.email;
      }
    }
  };

  bag[PropertyKeys.SchemaVersion] = String(CURRENT_SCHEMA_VERSION);

  put(PropertyKeys.ClientName, info.clientName);
  put(PropertyKeys.ProjectType, info.projectType);
  put(PropertyKeys.ProjectCode, info.projectCode);
  put(PropertyKeys.BusinessUnit, info.businessUnit);

  putIdentity(
    info.projectManager,
    PropertyKeys.ProjectManagerDescriptor,
    PropertyKeys.ProjectManagerDisplayName,
    PropertyKeys.ProjectManagerEmail,
  );
  putIdentity(
    info.deliveryManager,
    PropertyKeys.DeliveryManagerDescriptor,
    PropertyKeys.DeliveryManagerDisplayName,
    PropertyKeys.DeliveryManagerEmail,
  );
  putIdentity(
    info.technicalLead,
    PropertyKeys.TechnicalLeadDescriptor,
    PropertyKeys.TechnicalLeadDisplayName,
    PropertyKeys.TechnicalLeadEmail,
  );

  put(PropertyKeys.ProjectStartDate, normalizeIsoDate(info.projectStartDate));
  put(PropertyKeys.PlannedEndDate, normalizeIsoDate(info.plannedEndDate));
  put(PropertyKeys.ActualEndDate, normalizeIsoDate(info.actualEndDate));
  if (info.endDateRevisionCount > 0) {
    bag[PropertyKeys.EndDateRevisionCount] = String(info.endDateRevisionCount);
  }

  put(PropertyKeys.ProjectStatus, info.projectStatus || undefined);
  put(PropertyKeys.ProjectHealth, info.projectHealth || undefined);
  put(PropertyKeys.CurrentPhase, info.currentPhase);

  put(PropertyKeys.BillingType, info.billingType);
  put(PropertyKeys.ContractType, info.contractType);
  put(PropertyKeys.PurchaseOrderNumber, info.purchaseOrderNumber);

  const contacts = (info.clientContacts ?? [])
    .map((c) => ({ name: c.name.trim(), email: c.email.trim() }))
    .filter((c) => c.name || c.email)
    .slice(0, 3);
  if (contacts.length > 0) {
    bag[PropertyKeys.ClientContacts] = JSON.stringify(contacts);
  }
  // Legacy single-contact keys are intentionally not emitted; the diff removes
  // them once data has migrated into ClientContacts.
  put(PropertyKeys.ClientSponsor, info.clientSponsor);
  put(PropertyKeys.ClientRegion, info.clientRegion || undefined);
  putIdentity(
    info.internalSponsor,
    PropertyKeys.InternalSponsorDescriptor,
    PropertyKeys.InternalSponsorDisplayName,
    PropertyKeys.InternalSponsorEmail,
  );

  const teamRows = (info.team ?? [])
    .filter((m) => m.role.trim() && m.identity && m.identity.descriptor)
    .map((m) => ({
      role: m.role.trim(),
      descriptor: (m.identity as AzureDevOpsIdentity).descriptor,
      displayName: (m.identity as AzureDevOpsIdentity).displayName,
      email: (m.identity as AzureDevOpsIdentity).email,
    }));
  if (teamRows.length > 0) {
    bag[PropertyKeys.ProjectTeam] = JSON.stringify(teamRows);
  }

  put(PropertyKeys.TechnologyStack, info.technologyStack);
  put(PropertyKeys.RepositorySource, info.repositorySource);
  put(PropertyKeys.RepositoryUrl, info.repositoryUrl);
  put(PropertyKeys.HostingModel, info.hostingModel);
  put(PropertyKeys.AdditionalNotes, info.additionalNotes);

  put(PropertyKeys.LastUpdatedAt, info.lastUpdatedAt);
  putIdentity(
    info.lastUpdatedBy,
    PropertyKeys.LastUpdatedByDescriptor,
    PropertyKeys.LastUpdatedByDisplayName,
    PropertyKeys.LastUpdatedByEmail,
  );

  return bag;
}

/** The full set of property keys owned by this extension. */
const OWNED_KEYS: string[] = Object.values(PropertyKeys);

/**
 * Diff the desired property bag against what is currently stored and produce the
 * minimal JSON-Patch operations. Only keys within our namespace are ever
 * touched — unrelated project properties are left untouched.
 *
 * - New/changed values -> `add` (add doubles as replace for existing keys).
 * - Values present before but no longer desired -> `remove`.
 */
export function diffToPatchOperations(
  desired: PropertyBag,
  existing: PropertyBag,
): PatchOperation[] {
  const ops: PatchOperation[] = [];
  const ownedSet = new Set(OWNED_KEYS);

  // Adds / replaces for owned keys that changed.
  for (const key of OWNED_KEYS) {
    const next = desired[key];
    const prev = existing[key];
    if (next !== undefined && next !== prev) {
      ops.push({ op: 'add', path: `/${key}`, value: next });
    }
  }

  // Removes for owned keys that existed but are no longer desired.
  for (const key of Object.keys(existing)) {
    if (!ownedSet.has(key)) {
      continue; // never touch properties we do not own
    }
    if (existing[key] !== undefined && desired[key] === undefined) {
      ops.push({ op: 'remove', path: `/${key}` });
    }
  }

  return ops;
}

/** Convenience: full record + previously loaded bag -> patch operations. */
export function toPatchOperations(
  info: ProjectInformation,
  existing: PropertyBag,
): PatchOperation[] {
  return diffToPatchOperations(toPropertyBag(info), existing);
}
