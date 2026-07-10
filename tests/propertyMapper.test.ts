import { describe, expect, it } from 'vitest';
import {
  diffToPatchOperations,
  fromProperties,
  toPatchOperations,
  toPropertyBag,
  type PropertyBag,
} from '@/utils/propertyMapper';
import {
  createEmptyProjectInformation,
  type ProjectInformation,
} from '@/models/ProjectInformation';
import { CURRENT_SCHEMA_VERSION, PropertyKeys } from '@/constants/propertyKeys';
import type { AzureDevOpsIdentity } from '@/models/AzureDevOpsIdentity';

const pm: AzureDevOpsIdentity = {
  descriptor: 'aad.pm-descriptor',
  displayName: 'Pat Manager',
  email: 'pat@example.com',
};

function sampleRecord(): ProjectInformation {
  return {
    ...createEmptyProjectInformation(),
    clientName: 'AAF',
    projectCode: 'AAF-001',
    projectManager: pm,
    deliveryManager: { descriptor: 'aad.dm', displayName: 'Dee Manager' },
    projectStartDate: '2026-01-01',
    projectStatus: 'InProgress',
    projectHealth: 'Green',
    clientRegion: 'EMEA',
  };
}

describe('deserialisation (fromProperties)', () => {
  it('returns an empty-but-valid shape for a new project with no properties', () => {
    const info = fromProperties({});
    expect(info.clientName).toBe('');
    expect(info.projectManager).toBeNull();
    expect(info.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('reads a person field from its three stored properties', () => {
    const bag: PropertyBag = {
      [PropertyKeys.ProjectManagerDescriptor]: 'aad.pm-descriptor',
      [PropertyKeys.ProjectManagerDisplayName]: 'Pat Manager',
      [PropertyKeys.ProjectManagerEmail]: 'pat@example.com',
    };
    const info = fromProperties(bag);
    expect(info.projectManager).toEqual({
      descriptor: 'aad.pm-descriptor',
      displayName: 'Pat Manager',
      email: 'pat@example.com',
    });
  });

  it('ignores a person display name when the descriptor is missing', () => {
    const info = fromProperties({
      [PropertyKeys.ProjectManagerDisplayName]: 'Orphan Name',
    });
    expect(info.projectManager).toBeNull();
  });

  it('drops invalid enum values safely', () => {
    const info = fromProperties({
      [PropertyKeys.ProjectStatus]: 'NotAStatus',
      [PropertyKeys.ProjectHealth]: 'Green',
    });
    expect(info.projectStatus).toBe('');
    expect(info.projectHealth).toBe('Green');
  });

  it('drops malformed dates safely', () => {
    const info = fromProperties({
      [PropertyKeys.ProjectStartDate]: '31/12/2026',
      [PropertyKeys.PlannedEndDate]: '2026-12-31',
    });
    expect(info.projectStartDate).toBe('');
    expect(info.plannedEndDate).toBe('2026-12-31');
  });

  it('falls back to the current schema version for a missing/invalid value', () => {
    expect(fromProperties({ [PropertyKeys.SchemaVersion]: 'abc' }).schemaVersion).toBe(
      CURRENT_SCHEMA_VERSION,
    );
    expect(fromProperties({ [PropertyKeys.SchemaVersion]: '1' }).schemaVersion).toBe(1);
  });
});

describe('serialisation (toPropertyBag)', () => {
  it('omits empty optional values', () => {
    const bag = toPropertyBag(sampleRecord());
    expect(bag[PropertyKeys.BusinessUnit]).toBeUndefined();
    expect(bag[PropertyKeys.ClientName]).toBe('AAF');
    expect(bag[PropertyKeys.SchemaVersion]).toBe(String(CURRENT_SCHEMA_VERSION));
  });

  it('emits the three person properties for a set identity', () => {
    const bag = toPropertyBag(sampleRecord());
    expect(bag[PropertyKeys.ProjectManagerDescriptor]).toBe('aad.pm-descriptor');
    expect(bag[PropertyKeys.ProjectManagerDisplayName]).toBe('Pat Manager');
    expect(bag[PropertyKeys.ProjectManagerEmail]).toBe('pat@example.com');
  });

  it('does not emit email when the identity has none', () => {
    const bag = toPropertyBag(sampleRecord());
    expect(bag[PropertyKeys.DeliveryManagerDescriptor]).toBe('aad.dm');
    expect(bag[PropertyKeys.DeliveryManagerEmail]).toBeUndefined();
  });

  it('round-trips a record through serialise -> deserialise', () => {
    const original = sampleRecord();
    const restored = fromProperties(toPropertyBag(original));
    expect(restored.clientName).toBe(original.clientName);
    expect(restored.projectManager).toEqual(original.projectManager);
    expect(restored.projectStatus).toBe(original.projectStatus);
    expect(restored.clientRegion).toBe(original.clientRegion);
  });
});

describe('patch diffing (diffToPatchOperations)', () => {
  it('adds changed values only', () => {
    const existing: PropertyBag = { [PropertyKeys.ClientName]: 'Old' };
    const desired: PropertyBag = {
      [PropertyKeys.ClientName]: 'New',
      [PropertyKeys.ProjectCode]: 'P1',
    };
    const ops = diffToPatchOperations(desired, existing);
    expect(ops).toContainEqual({ op: 'add', path: `/${PropertyKeys.ClientName}`, value: 'New' });
    expect(ops).toContainEqual({ op: 'add', path: `/${PropertyKeys.ProjectCode}`, value: 'P1' });
  });

  it('removes owned keys that are no longer desired', () => {
    const existing: PropertyBag = {
      [PropertyKeys.ClientName]: 'AAF',
      [PropertyKeys.BusinessUnit]: 'Cloud',
    };
    const desired: PropertyBag = { [PropertyKeys.ClientName]: 'AAF' };
    const ops = diffToPatchOperations(desired, existing);
    expect(ops).toContainEqual({ op: 'remove', path: `/${PropertyKeys.BusinessUnit}` });
    // Unchanged ClientName produces no op.
    expect(ops.find((o) => o.path === `/${PropertyKeys.ClientName}`)).toBeUndefined();
  });

  it('never touches properties outside the extension namespace', () => {
    const existing: PropertyBag = {
      'Some.Other.Property': 'keep-me',
      [PropertyKeys.ClientName]: 'AAF',
    };
    const desired: PropertyBag = { [PropertyKeys.ClientName]: 'AAF' };
    const ops = diffToPatchOperations(desired, existing);
    expect(ops.some((o) => o.path.includes('Some.Other.Property'))).toBe(false);
    expect(ops).toHaveLength(0);
  });

  it('clears a person field by removing all three of its properties', () => {
    const withPerson = toPropertyBag(sampleRecord());
    const cleared = toPropertyBag({ ...sampleRecord(), projectManager: null });
    const ops = diffToPatchOperations(cleared, withPerson);
    expect(ops).toContainEqual({ op: 'remove', path: `/${PropertyKeys.ProjectManagerDescriptor}` });
    expect(ops).toContainEqual({
      op: 'remove',
      path: `/${PropertyKeys.ProjectManagerDisplayName}`,
    });
    expect(ops).toContainEqual({ op: 'remove', path: `/${PropertyKeys.ProjectManagerEmail}` });
  });

  it('produces no operations when nothing changed', () => {
    const bag = toPropertyBag(sampleRecord());
    expect(toPatchOperations(sampleRecord(), bag)).toHaveLength(0);
  });
});
