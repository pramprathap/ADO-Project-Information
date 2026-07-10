import { useEffect } from 'react';

/**
 * Warns the user before leaving the page (browser navigation / tab close) while
 * there are unsaved changes. Uses the standard `beforeunload` event, which is
 * the only broadly-supported mechanism inside the extension iframe.
 */
export function useUnsavedChanges(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) {
      return;
    }
    const handler = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      // Chrome requires returnValue to be set.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);
}
