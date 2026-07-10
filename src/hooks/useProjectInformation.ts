import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppServices } from '@/services/appServices';
import type { EditPermission } from '@/services/PermissionService';
import {
  createEmptyProjectInformation,
  type ProjectInformation,
} from '@/models/ProjectInformation';
import type { AzureDevOpsIdentity } from '@/models/AzureDevOpsIdentity';
import {
  fromProperties,
  toPatchOperations,
  toPropertyBag,
  type PropertyBag,
} from '@/utils/propertyMapper';
import { nowIso } from '@/utils/dateUtils';
import { PropertyKeys } from '@/constants/propertyKeys';
import { validateProjectInformation } from '@/utils/validation';
import { ApiError } from '@/services/errors';

export type LoadStatus = 'loading' | 'loaded' | 'error';
export type SaveStatus = 'idle' | 'saving' | 'success' | 'error';

export interface UseProjectInformationResult {
  loadStatus: LoadStatus;
  loadError: string | null;
  info: ProjectInformation;
  setInfo: (updater: (prev: ProjectInformation) => ProjectInformation) => void;
  isDirty: boolean;
  permission: EditPermission;
  saveStatus: SaveStatus;
  saveError: string | null;
  clearSaveStatus: () => void;
  save: () => Promise<boolean>;
  reload: () => void;
  resetChanges: () => void;
}

function clone(info: ProjectInformation): ProjectInformation {
  return JSON.parse(JSON.stringify(info)) as ProjectInformation;
}

const PERSON_KEYS = [
  'projectManager',
  'deliveryManager',
  'technicalLead',
  'internalSponsor',
] as const;

export function useProjectInformation(services: AppServices): UseProjectInformationResult {
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [info, setInfoState] = useState<ProjectInformation>(createEmptyProjectInformation);
  const [original, setOriginal] = useState<ProjectInformation>(createEmptyProjectInformation);
  const [permission, setPermission] = useState<EditPermission>({
    canEdit: false,
    checkFailed: false,
  });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  /** The last property bag read from the server, used to diff on save. */
  const existingBag = useRef<PropertyBag>({});

  useEffect(() => {
    let cancelled = false;

    async function resolvePeople(loaded: ProjectInformation): Promise<ProjectInformation> {
      const next = clone(loaded);
      await Promise.all(
        PERSON_KEYS.map(async (key) => {
          const current = loaded[key] as AzureDevOpsIdentity | null;
          if (current && current.descriptor) {
            const resolved = await services.identities.resolveByDescriptor(current);
            (next[key] as AzureDevOpsIdentity | null) = resolved;
          }
        }),
      );
      return next;
    }

    async function load(): Promise<void> {
      setLoadStatus('loading');
      setLoadError(null);
      try {
        // Permission check and property load run concurrently.
        const [perm, bag] = await Promise.all([
          services.permissions.canEditProjectInformation(),
          services.properties.load(),
        ]);
        if (cancelled) {
          return;
        }
        existingBag.current = bag;
        const parsed = fromProperties(bag);
        const withPeople = await resolvePeople(parsed);
        if (cancelled) {
          return;
        }
        setPermission(perm);
        setInfoState(withPeople);
        setOriginal(clone(withPeople));
        setLoadStatus('loaded');
      } catch (err) {
        console.error('Failed to load project information.', err);
        if (!cancelled) {
          setLoadError(
            err instanceof ApiError ? err.userMessage : 'Failed to load project information.',
          );
          setLoadStatus('error');
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [services, attempt]);

  const setInfo = useCallback((updater: (prev: ProjectInformation) => ProjectInformation) => {
    setInfoState((prev) => updater(prev));
    // Editing clears a stale success/error banner.
    setSaveStatus((s) => (s === 'idle' || s === 'saving' ? s : 'idle'));
  }, []);

  const isDirty = useMemo(
    () => JSON.stringify(info) !== JSON.stringify(original),
    [info, original],
  );

  const reload = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);

  const resetChanges = useCallback(() => {
    setInfoState(clone(original));
    setSaveStatus('idle');
    setSaveError(null);
  }, [original]);

  const clearSaveStatus = useCallback(() => {
    setSaveStatus('idle');
    setSaveError(null);
  }, []);

  const save = useCallback(async (): Promise<boolean> => {
    // Service-level validation guard: never send an invalid record.
    const result = validateProjectInformation(info);
    if (!result.isValid) {
      setSaveStatus('error');
      setSaveError('Please fix the highlighted fields before saving.');
      return false;
    }

    setSaveStatus('saving');
    setSaveError(null);

    // Increment the end-date revision counter when the Actual / Revised End Date
    // differs from the value currently persisted for this project.
    const previousActual = existingBag.current[PropertyKeys.ActualEndDate] ?? '';
    const nextActual = (info.actualEndDate ?? '').trim();
    const endDateChanged = nextActual !== previousActual;
    const nextRevisionCount = (info.endDateRevisionCount ?? 0) + (endDateChanged ? 1 : 0);

    // Stamp audit fields.
    const toSave: ProjectInformation = {
      ...clone(info),
      schemaVersion: 1,
      endDateRevisionCount: nextRevisionCount,
      lastUpdatedAt: nowIso(),
      lastUpdatedBy: services.context.currentUser,
    };

    try {
      const ops = toPatchOperations(toSave, existingBag.current);
      await services.properties.save(ops);
      // Refresh the baseline from the values we just persisted.
      existingBag.current = toPropertyBag(toSave);
      setInfoState(toSave);
      setOriginal(clone(toSave));
      setSaveStatus('success');
      return true;
    } catch (err) {
      console.error('Failed to save project information.', err);
      setSaveStatus('error');
      if (err instanceof ApiError) {
        if (err.kind === 'forbidden' || err.kind === 'unauthorized') {
          setPermission({ canEdit: false, checkFailed: false });
        }
        setSaveError(err.userMessage);
      } else {
        setSaveError('Failed to save project information.');
      }
      return false;
    }
  }, [info, services]);

  return {
    loadStatus,
    loadError,
    info,
    setInfo,
    isDirty,
    permission,
    saveStatus,
    saveError,
    clearSaveStatus,
    save,
    reload,
    resetChanges,
  };
}
