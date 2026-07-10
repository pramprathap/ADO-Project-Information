import { describe, expect, it } from 'vitest';
import {
  createEmptyProjectInformation,
  type ProjectInformation,
} from '@/models/ProjectInformation';
import { firstInvalidField, isValidEmail, validateProjectInformation } from '@/utils/validation';
import type { AzureDevOpsIdentity } from '@/models/AzureDevOpsIdentity';

const person = (name: string): AzureDevOpsIdentity => ({
  descriptor: `aad.${name}`,
  displayName: name,
  email: `${name}@example.com`,
});

/** A record that satisfies all required rules. */
function validRecord(): ProjectInformation {
  return {
    ...createEmptyProjectInformation(),
    clientName: 'AAF',
    deliveryManager: person('dm'),
    projectStartDate: '2026-01-01',
    projectStatus: 'InProgress',
    projectHealth: 'Green',
    clientRegion: 'EMEA',
  };
}

describe('required-field validation', () => {
  it('flags every required field on an empty record', () => {
    const result = validateProjectInformation(createEmptyProjectInformation());
    expect(result.isValid).toBe(false);
    expect(result.errors.clientName).toBeDefined();
    expect(result.errors.deliveryManager).toBeDefined();
    expect(result.errors.projectStartDate).toBeDefined();
    expect(result.errors.projectStatus).toBeDefined();
    expect(result.errors.projectHealth).toBeDefined();
    expect(result.errors.clientRegion).toBeDefined();
  });

  it('passes a fully valid record', () => {
    expect(validateProjectInformation(validRecord()).isValid).toBe(true);
  });

  it('reports the first invalid field in form order', () => {
    const result = validateProjectInformation(createEmptyProjectInformation());
    expect(firstInvalidField(result)).toBe('clientName');
  });
});

describe('text validation', () => {
  it('enforces the client name max length', () => {
    const r = validateProjectInformation({ ...validRecord(), clientName: 'x'.repeat(201) });
    expect(r.errors.clientName).toBeDefined();
  });
});

describe('date-range validation', () => {
  it('rejects a planned end date earlier than the start date', () => {
    const r = validateProjectInformation({
      ...validRecord(),
      projectStartDate: '2026-06-01',
      plannedEndDate: '2026-05-01',
    });
    expect(r.errors.plannedEndDate).toBeDefined();
  });

  it('rejects an actual end date earlier than the start date', () => {
    const r = validateProjectInformation({
      ...validRecord(),
      projectStartDate: '2026-06-01',
      actualEndDate: '2026-05-31',
    });
    expect(r.errors.actualEndDate).toBeDefined();
  });

  it('allows end dates on or after the start date', () => {
    const r = validateProjectInformation({
      ...validRecord(),
      projectStartDate: '2026-06-01',
      plannedEndDate: '2026-06-01',
      actualEndDate: '2026-07-01',
    });
    expect(r.errors.plannedEndDate).toBeUndefined();
    expect(r.errors.actualEndDate).toBeUndefined();
  });

  it('warns (does not block) when a completed project has no actual end date', () => {
    const r = validateProjectInformation({ ...validRecord(), projectStatus: 'Completed' });
    expect(r.isValid).toBe(true);
    expect(r.warnings.actualEndDate).toBeDefined();
  });

  it('rejects an invalid calendar date', () => {
    const r = validateProjectInformation({ ...validRecord(), projectStartDate: '2026-02-31' });
    expect(r.errors.projectStartDate).toBeDefined();
  });
});

describe('email validation', () => {
  it.each(['a@b.com', 'first.last@sub.domain.co'])('accepts %s', (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each(['plainaddress', 'a@b', 'a b@c.com', '@no-local.com'])('rejects %s', (email) => {
    expect(isValidEmail(email)).toBe(false);
  });

  it('flags an invalid client contact email but allows an empty one', () => {
    expect(
      validateProjectInformation({ ...validRecord(), clientContactEmail: 'bad' }).errors
        .clientContactEmail,
    ).toBeDefined();
    expect(
      validateProjectInformation({ ...validRecord(), clientContactEmail: '' }).errors
        .clientContactEmail,
    ).toBeUndefined();
  });
});

describe('person validation', () => {
  it('rejects a person object without a descriptor (arbitrary text guard)', () => {
    const r = validateProjectInformation({
      ...validRecord(),
      projectManager: { descriptor: '', displayName: 'Typed Name' },
    });
    expect(r.errors.projectManager).toBeDefined();
  });

  it('allows optional person fields to be empty', () => {
    const r = validateProjectInformation({ ...validRecord(), technicalLead: null });
    expect(r.errors.technicalLead).toBeUndefined();
  });
});

describe('url validation', () => {
  it('rejects a non-https repository url', () => {
    const r = validateProjectInformation({ ...validRecord(), repositoryUrl: 'http://x.com' });
    expect(r.errors.repositoryUrl).toBeDefined();
  });

  it('accepts an https repository url', () => {
    const r = validateProjectInformation({
      ...validRecord(),
      repositoryUrl: 'https://dev.azure.com/o/p/_git/r',
    });
    expect(r.errors.repositoryUrl).toBeUndefined();
  });
});
