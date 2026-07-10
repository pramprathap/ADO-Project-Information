import { useCallback, useEffect, useState } from 'react';
import * as SDK from 'azure-devops-extension-sdk';
import { createAppServices, type AppServices } from '@/services/appServices';
import { createMockAppServices } from '@/services/mockServices';

export type ContextStatus = 'initializing' | 'ready' | 'error';

export interface ProjectContextState {
  status: ContextStatus;
  services: AppServices | null;
  error: string | null;
  /** Retry initialization after a failure. */
  retry: () => void;
}

/**
 * Initializes the Azure DevOps Extension SDK and resolves the app services.
 *
 * Follows the required lifecycle:
 *   SDK.init({ loaded: false, applyTheme: true })  -> theme + deferred load
 *   await SDK.ready()                              -> handshake complete
 *   ... build services / load happens after ready ...
 *
 * `SDK.notifyLoadSucceeded()` / `notifyLoadFailed()` are called by the App once
 * the first meaningful render (or a fatal error) is reached.
 */
export function useProjectContext(): ProjectContextState {
  const [status, setStatus] = useState<ContextStatus>('initializing');
  const [services, setServices] = useState<AppServices | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setStatus('initializing');
    setError(null);
    setServices(null);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initialize(): Promise<void> {
      try {
        // Local preview mode: when running under the Vite dev server the page is
        // not hosted inside the Azure DevOps iframe, so the SDK cannot complete
        // its handshake. Use in-memory mock services so the real UI can be
        // previewed at http://localhost. This branch is compiled out of the
        // production build.
        if (import.meta.env.DEV) {
          if (!cancelled) {
            setServices(createMockAppServices());
            setStatus('ready');
          }
          return;
        }

        // init is idempotent for our purposes; on retry the SDK is already
        // initialized and ready() resolves immediately.
        await SDK.init({ loaded: false, applyTheme: true });
        await SDK.ready();

        const built = await createAppServices();
        if (!cancelled) {
          setServices(built);
          setStatus('ready');
        }
      } catch (err) {
        console.error('Extension initialization failed.', err);
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'The extension failed to initialize. Please reload the page.',
          );
          setStatus('error');
          // Tell the host to stop the loading indicator on fatal failure.
          void SDK.notifyLoadFailed(err instanceof Error ? err : String(err));
        }
      }
    }

    void initialize();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return { status, services, error, retry };
}
