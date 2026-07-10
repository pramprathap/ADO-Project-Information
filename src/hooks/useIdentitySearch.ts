import { useCallback, useEffect, useRef, useState } from 'react';
import type { IdentityService } from '@/services/IdentityService';
import type { AzureDevOpsIdentity } from '@/models/AzureDevOpsIdentity';

export interface IdentitySearchState {
  query: string;
  setQuery: (value: string) => void;
  results: AzureDevOpsIdentity[];
  isSearching: boolean;
  error: string | null;
  clear: () => void;
}

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

/**
 * Debounced, server-side identity search for the people picker. Cancels stale
 * requests so only the latest query's results are shown, and never loads the
 * full organisation user list into the browser.
 */
export function useIdentitySearch(identityService: IdentityService): IdentitySearchState {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AzureDevOpsIdentity[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const clear = useCallback(() => {
    setQuery('');
    setResults([]);
    setError(null);
    setIsSearching(false);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setIsSearching(false);
      setError(null);
      return;
    }

    setIsSearching(true);
    const seq = ++requestSeq.current;
    const handle = setTimeout(async () => {
      try {
        const found = await identityService.searchUsers(trimmed);
        // Ignore results from a superseded request.
        if (seq === requestSeq.current) {
          setResults(found);
          setError(null);
        }
      } catch (err) {
        console.error('Identity search failed.', err);
        if (seq === requestSeq.current) {
          setResults([]);
          setError('Unable to search people right now. Try again.');
        }
      } finally {
        if (seq === requestSeq.current) {
          setIsSearching(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [query, identityService]);

  return { query, setQuery, results, isSearching, error, clear };
}
