import { useCallback, useEffect, useState } from 'react';
import type { AppServices } from '@/services/appServices';
import type { ProjectReportMetrics } from '@/models/ProjectReport';
import { fromProperties } from '@/utils/propertyMapper';
import { ApiError } from '@/services/errors';

export type ReportStatus = 'loading' | 'loaded' | 'error';

export interface UseProjectReportResult {
  status: ReportStatus;
  metrics: ProjectReportMetrics | null;
  error: string | null;
  refresh: () => void;
}

/**
 * Loads the read-only Project Health report metrics for the current project.
 * Runs independently of the (editable) project-information form so a slow or
 * failing Boards query never blocks the main page.
 */
export function useProjectReport(services: AppServices): UseProjectReportResult {
  const [status, setStatus] = useState<ReportStatus>('loading');
  const [metrics, setMetrics] = useState<ProjectReportMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setStatus('loading');
      setError(null);
      try {
        // Read the project's Current Phase / Project Type so the report can gate
        // milestone visibility (phased delivery vs continuous/activity-based).
        let currentPhase: string | undefined;
        let projectType: string | undefined;
        let epicTags: Record<string, string> | undefined;
        try {
          const info = fromProperties(await services.properties.load());
          currentPhase = info.currentPhase || undefined;
          projectType = info.projectType || undefined;
          epicTags = info.epicTags;
        } catch {
          // Non-fatal: fall back to Boards-only gating (dev Epics still work).
        }
        const result = await services.workItems.getReport({ currentPhase, projectType, epicTags });
        if (!cancelled) {
          setMetrics(result);
          setStatus('loaded');
        }
      } catch (err) {
        console.error('Failed to load the project report.', err);
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.userMessage : 'Failed to load the project report.',
          );
          setStatus('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [services, attempt]);

  const refresh = useCallback(() => setAttempt((n) => n + 1), []);

  return { status, metrics, error, refresh };
}
