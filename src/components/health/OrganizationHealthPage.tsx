import { useEffect, useRef, useState } from 'react';
import * as SDK from 'azure-devops-extension-sdk';
import { Spinner, makeStyles, tokens } from '@fluentui/react-components';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { ProjectHealthPage } from '@/components/health/ProjectHealthPage';
import type { AppServices } from '@/services/appServices';
import {
  buildProjectServices,
  listProjects,
  resolveOrgContext,
  type OrgContext,
  type ProjectRef,
} from '@/services/orgServices';
import { createMockAppServices } from '@/services/mockServices';

type Status = 'initializing' | 'ready' | 'error';

const useStyles = makeStyles({
  bar: {
    width: '100%',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
    padding: `${tokens.spacingVerticalM} clamp(12px, 1.5vw, 24px)`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  label: { fontSize: '13px', fontWeight: 700 },
  select: {
    fontSize: '13px',
    padding: '6px 10px',
    borderRadius: '8px',
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    minWidth: '260px',
    maxWidth: '420px',
  },
  count: { fontSize: '12px', color: tokens.colorNeutralForeground3 },
  center: { display: 'grid', placeItems: 'center', minHeight: '240px' },
});

// Preview-only project list (npm run dev), where the SDK is unavailable.
const MOCK_PROJECTS: ProjectRef[] = [
  { id: 'p1', name: 'AAF - HelpDesk (Preview)' },
  { id: 'p2', name: 'Digital Marketing (Preview)' },
];

export function OrganizationHealthPage() {
  const styles = useStyles();
  const [status, setStatus] = useState<Status>('initializing');
  const [error, setError] = useState<string | null>(null);
  const [org, setOrg] = useState<OrgContext | null>(null);
  const [projects, setProjects] = useState<ProjectRef[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [services, setServices] = useState<AppServices | null>(null);
  const notified = useRef(false);

  // Initialise once: resolve the org context and enumerate accessible projects.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (import.meta.env.DEV) {
          if (!cancelled) {
            setProjects(MOCK_PROJECTS);
            setSelectedId(MOCK_PROJECTS[0].id);
            setStatus('ready');
          }
          return;
        }
        await SDK.init({ loaded: false, applyTheme: true });
        await SDK.ready();
        const resolved = await resolveOrgContext();
        const list = await listProjects(resolved);
        if (!cancelled) {
          setOrg(resolved);
          setProjects(list);
          setSelectedId(list[0]?.id ?? '');
          setStatus('ready');
        }
      } catch (err) {
        console.error('Organization report initialization failed.', err);
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'The organization report failed to initialize.',
          );
          setStatus('error');
          void SDK.notifyLoadFailed(err instanceof Error ? err : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Build project-scoped services whenever the selection changes.
  useEffect(() => {
    if (!selectedId) {
      setServices(null);
      return;
    }
    if (import.meta.env.DEV) {
      setServices(createMockAppServices());
      return;
    }
    if (!org) return;
    const proj = projects.find((p) => p.id === selectedId);
    setServices(proj ? buildProjectServices(org, proj) : null);
  }, [selectedId, org, projects]);

  useEffect(() => {
    if (!notified.current && status !== 'initializing') {
      notified.current = true;
      if (!import.meta.env.DEV) void SDK.notifyLoadSucceeded();
    }
  }, [status]);

  if (status === 'initializing') return <LoadingState label="Loading organization projects…" />;
  if (status === 'error') {
    return (
      <ErrorState
        title="Failed to initialize"
        message={error ?? 'The organization report could not start.'}
      />
    );
  }

  return (
    <div>
      <div className={styles.bar}>
        <span className={styles.label}>Project Health</span>
        <select
          className={styles.select}
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          aria-label="Select a project"
        >
          {projects.length === 0 && <option value="">No accessible projects</option>}
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <span className={styles.count}>
          {projects.length} project{projects.length === 1 ? '' : 's'}
        </span>
      </div>

      {services ? (
        <ProjectHealthPage key={selectedId} services={services} />
      ) : (
        <div className={styles.center}>
          <Spinner label="Select a project to view its health report." />
        </div>
      )}
    </div>
  );
}
