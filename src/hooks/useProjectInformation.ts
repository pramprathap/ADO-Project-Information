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
  /** Whether the viewer is a Project Administrator (for masking sensitive data). */
  isAdmin: boolean;
  /** Org-wide client names for the Client Name type-ahead. */
  clientNameSuggestions: string[];
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
  const [clientNameSuggestions, setClientNameSuggestions] = useState<string[]>([]);
  // Masking of sensitive sections defaults to hidden until the async admin
  // check confirms the viewer is a Project Administrator (fails open on error).
  const [isAdmin, setIsAdmin] = useState(false);

  /** The last property bag read from the server, used to diff on save. */
  const existingBag = useRef<PropertyBag>({});

  useEffect(() => {
    let cancelled = false;

    /**
     * Merge freshly-resolved person details into a record WITHOUT marking the
     * form dirty: a person field is only replaced when it still matches the
     * value loaded from the server (i.e. the user has not changed it).
     */
    function mergeResolvedPeople(
      target: ProjectInformation,
      base: ProjectInformation,
      resolved: Partial<Record<(typeof PERSON_KEYS)[number], AzureDevOpsIdentity | null>>,
    ): ProjectInformation {
      const next = clone(target);
      for (const key of PERSON_KEYS) {
        const baseId = base[key] as AzureDevOpsIdentity | null;
        const targetId = target[key] as AzureDevOpsIdentity | null;
        const sameAsLoaded = (baseId?.descriptor ?? '') === (targetId?.descriptor ?? '');
        if (sameAsLoaded && key in resolved) {
          (next[key] as AzureDevOpsIdentity | null) = resolved[key] ?? null;
        }
      }
      return next;
    }

    async function load(): Promise<void> {
      setLoadStatus('loading');
      setLoadError(null);
      try {
        // Critical path: only the permission flag and the stored properties.
        const [perm, bag] = await Promise.all([
          services.permissions.canEditProjectInformation(),
          services.properties.load(),
        ]);
        if (cancelled) {
          return;
        }
        existingBag.current = bag;
        const parsed = fromProperties(bag);
        setPermission(perm);
        setInfoState(parsed);
        setOriginal(clone(parsed));
        // Render immediately with the stored data (person names/emails are in
        // the properties), so the host stops showing the loading indicator.
        setLoadStatus('loaded');

        // Non-blocking enrichment: refresh identities (avatar/active state),
        // load client-name suggestions, and determine admin status for masking.
        void (async () => {
          const [resolvedPeople, clientNames, admin] = await Promise.all([
            Promise.all(
              PERSON_KEYS.map(async (key) => {
                const current = parsed[key] as AzureDevOpsIdentity | null;
                if (current && current.descriptor) {
                  return [key, await services.identities.resolveByDescriptor(current)] as const;
                }
                return [key, current] as const;
              }),
            ),
            services.clientDirectory.getClientNames().catch(() => [] as string[]),
            services.permissions.isProjectAdministrator().catch(() => true),
          ]);
          if (cancelled) {
            return;
          }
          const resolvedMap = Object.fromEntries(resolvedPeople) as Partial<
            Record<(typeof PERSON_KEYS)[number], AzureDevOpsIdentity | null>
          >;
          setClientNameSuggestions(clientNames);
          setIsAdmin(admin);
          setInfoState((prev) => mergeResolvedPeople(prev, parsed, resolvedMap));
          setOriginal((prev) => mergeResolvedPeople(prev, parsed, resolvedMap));
        })();
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

      // Remember the client name in the shared directory for future type-ahead.
      const savedClient = toSave.clientName.trim();
      if (savedClient) {
        void services.clientDirectory.addClientName(savedClient);
        setClientNameSuggestions((prev) =>
          prev.some((n) => n.toLowerCase() === savedClient.toLowerCase())
            ? prev
            : [...prev, savedClient].sort((a, b) => a.localeCompare(b)),
        );
      }
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
    isAdmin,
    clientNameSuggestions,
    saveStatus,
    saveError,
    clearSaveStatus,
    save,
    reload,
    resetChanges,
  };
}
