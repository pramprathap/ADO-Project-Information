import * as SDK from 'azure-devops-extension-sdk';
import { API_VERSION } from '@/constants/adoServiceIds';
import { ApiError, statusToKind } from './errors';
import { withRetry } from '@/utils/retry';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface RequestOptions {
  method?: HttpMethod;
  /** Query parameters appended safely via URLSearchParams. */
  query?: Record<string, string | number | undefined>;
  /** JSON body; serialised by the client. */
  body?: unknown;
  /** Content-Type override (project properties PATCH needs json-patch). */
  contentType?: string;
  /** Per-request timeout. Default 30s. */
  timeoutMs?: number;
  /** Whether transient failures should be retried. Default true. */
  retry?: boolean;
  apiVersion?: string;
  /** Skip appending the api-version query param (e.g. Analytics OData paths). */
  skipApiVersion?: boolean;
}

export interface PagedResult<T> {
  items: T[];
  continuationToken?: string;
}

/**
 * Thin, reusable Azure DevOps REST client.
 *
 * - Obtains the access token via the Azure DevOps SDK (never a PAT).
 * - Builds URLs safely from a supplied base + relative path + query.
 * - Applies a bounded timeout and, for transient failures, limited retries with
 *   exponential backoff.
 * - Converts HTTP failures into typed, user-safe {@link ApiError}s.
 * - Never places the token in thrown errors or logs.
 */
export class AzureDevOpsClient {
  async requestRaw(baseUrl: string, path: string, options: RequestOptions = {}): Promise<Response> {
    const method = options.method ?? 'GET';
    const timeoutMs = options.timeoutMs ?? 30_000;
    const doRetry = options.retry ?? true;

    const url = this.buildUrl(
      baseUrl,
      path,
      options.query,
      options.apiVersion ?? API_VERSION,
      options.skipApiVersion ?? false,
    );

    const perform = async (): Promise<Response> => {
      // Fetch a fresh token per attempt; the SDK caches and refreshes it.
      const token = await SDK.getAccessToken();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        };
        let bodyText: string | undefined;
        if (options.body !== undefined) {
          headers['Content-Type'] = options.contentType ?? 'application/json';
          bodyText = JSON.stringify(options.body);
        }

        const response = await fetch(url, {
          method,
          headers,
          body: bodyText,
          signal: controller.signal,
        });

        if (!response.ok) {
          throw await this.toApiError(response);
        }
        return response;
      } catch (err) {
        if (err instanceof ApiError) {
          throw err;
        }
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw new ApiError('timeout', 'The request timed out.');
        }
        // Network / CORS / unknown fetch failure. Never include the token.
        throw new ApiError('network', 'A network error occurred while contacting Azure DevOps.');
      } finally {
        clearTimeout(timer);
      }
    };

    if (!doRetry) {
      return perform();
    }

    return withRetry(perform, {
      isRetryable: (e) => e instanceof ApiError && e.isRetryable,
      retryAfterMs: (e) => (e instanceof ApiError ? e.retryAfterMs : undefined),
    });
  }

  /** Perform a request and parse the JSON body, or return undefined for 204. */
  async request<T>(baseUrl: string, path: string, options: RequestOptions = {}): Promise<T> {
    const response = await this.requestRaw(baseUrl, path, options);
    if (response.status === 204) {
      return undefined as T;
    }
    const text = await response.text();
    if (!text) {
      return undefined as T;
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError('parse', 'Failed to parse the Azure DevOps response.');
    }
  }

  /**
   * GET a collection that may span multiple pages via the
   * `x-ms-continuationtoken` response header, following all pages.
   */
  async getAllPages<T>(
    baseUrl: string,
    path: string,
    options: RequestOptions = {},
    maxPages = 50,
  ): Promise<T[]> {
    const all: T[] = [];
    let continuationToken: string | undefined;
    let pages = 0;

    do {
      const query = { ...(options.query ?? {}) };
      if (continuationToken) {
        query.continuationToken = continuationToken;
      }
      const response = await this.requestRaw(baseUrl, path, { ...options, query });
      continuationToken = response.headers.get('x-ms-continuationtoken') ?? undefined;

      const text = await response.text();
      if (text) {
        try {
          const parsed = JSON.parse(text) as { value?: T[] };
          if (Array.isArray(parsed.value)) {
            all.push(...parsed.value);
          }
        } catch {
          throw new ApiError('parse', 'Failed to parse a paged Azure DevOps response.');
        }
      }
      pages += 1;
      if (pages >= maxPages && continuationToken) {
        console.warn(
          `getAllPages stopped after ${maxPages} pages; more results may exist for ${path}.`,
        );
        break;
      }
    } while (continuationToken);

    return all;
  }

  private buildUrl(
    baseUrl: string,
    path: string,
    query: Record<string, string | number | undefined> | undefined,
    apiVersion: string,
    skipApiVersion: boolean,
  ): string {
    const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const rel = path.startsWith('/') ? path.slice(1) : path;
    const url = new URL(`${base}/${rel}`);
    if (!skipApiVersion) {
      url.searchParams.set('api-version', apiVersion);
    }
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private async toApiError(response: Response): Promise<ApiError> {
    const kind = statusToKind(response.status);
    let retryAfterMs: number | undefined;
    const retryAfter = response.headers.get('Retry-After');
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds)) {
        retryAfterMs = seconds * 1000;
      }
    }
    // Read (and discard) the body to aid console logging without surfacing it.
    let detail = '';
    try {
      const text = await response.text();
      detail = text.slice(0, 500);
    } catch {
      /* ignore */
    }
    if (detail) {
      console.warn(`Azure DevOps API ${response.status} on ${response.url}: ${detail}`);
    }
    return new ApiError(
      kind,
      `Azure DevOps request failed (HTTP ${response.status}).`,
      response.status,
      retryAfterMs,
    );
  }
}
