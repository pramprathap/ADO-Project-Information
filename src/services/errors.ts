/**
 * Typed error hierarchy for Azure DevOps API interactions. Error messages are
 * safe to show users: they never contain tokens, auth headers, or raw response
 * bodies. Technical detail is logged to the console separately by callers.
 */

export type ApiErrorKind =
  | 'network'
  | 'timeout'
  | 'unauthorized' // 401
  | 'forbidden' // 403
  | 'notFound' // 404
  | 'conflict' // 409
  | 'rateLimited' // 429
  | 'server' // 5xx
  | 'client' // other 4xx
  | 'parse'
  | 'unknown';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  /** Suggested retry delay in ms parsed from Retry-After, when present. */
  readonly retryAfterMs?: number;

  constructor(kind: ApiErrorKind, message: string, status?: number, retryAfterMs?: number) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }

  /** Transient failures that are safe to retry. */
  get isRetryable(): boolean {
    return this.kind === 'rateLimited' || this.kind === 'server' || this.kind === 'timeout';
  }

  /** A concise, user-safe message. */
  get userMessage(): string {
    switch (this.kind) {
      case 'unauthorized':
        return 'Your session is not authorized. Refresh the page and sign in again.';
      case 'forbidden':
        return 'You do not have permission to perform this action.';
      case 'notFound':
        return 'The requested Azure DevOps resource was not found.';
      case 'conflict':
        return 'The information was changed by someone else. Reload and try again.';
      case 'rateLimited':
        return 'Azure DevOps is rate limiting requests. Please wait a moment and retry.';
      case 'server':
        return 'Azure DevOps returned a server error. Please try again shortly.';
      case 'timeout':
        return 'The request timed out. Check your connection and try again.';
      case 'network':
        return 'A network error occurred. Check your connection and try again.';
      case 'parse':
        return 'Received an unexpected response from Azure DevOps.';
      default:
        return this.message || 'An unexpected error occurred.';
    }
  }
}

export function statusToKind(status: number): ApiErrorKind {
  switch (status) {
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'notFound';
    case 409:
      return 'conflict';
    case 429:
      return 'rateLimited';
    default:
      if (status >= 500) {
        return 'server';
      }
      if (status >= 400) {
        return 'client';
      }
      return 'unknown';
  }
}
