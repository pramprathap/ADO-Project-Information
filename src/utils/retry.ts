/**
 * Limited retry with exponential backoff for transient failures only
 * (HTTP 429 and 5xx, or network errors). Validation and permission errors must
 * never be retried — callers signal that via `isRetryable`.
 */

export interface RetryOptions {
  /** Max number of attempts (including the first). Default 4. */
  maxAttempts?: number;
  /** Base delay in ms; grows exponentially. Default 400ms. */
  baseDelayMs?: number;
  /** Upper bound for a single backoff delay. Default 8000ms. */
  maxDelayMs?: number;
  /** Decides whether a thrown error should trigger another attempt. */
  isRetryable: (error: unknown) => boolean;
  /**
   * Optional server-provided delay (e.g. Retry-After header, in ms) for a given
   * error; when returned it overrides the computed backoff.
   */
  retryAfterMs?: (error: unknown) => number | undefined;
  /** Injectable sleep for tests. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 400;
  const maxDelayMs = options.maxDelayMs ?? 8000;
  const sleep = options.sleep ?? defaultSleep;

  let attempt = 0;
  // Deterministic jitter (no Math.random) keyed on attempt to avoid thundering herd.
  const jitterFor = (n: number): number => (n * 137) % 250;

  for (;;) {
    try {
      return await fn();
    } catch (error) {
      attempt += 1;
      if (attempt >= maxAttempts || !options.isRetryable(error)) {
        throw error;
      }
      const serverDelay = options.retryAfterMs?.(error);
      const backoff = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      const delay = serverDelay ?? backoff + jitterFor(attempt);
      await sleep(delay);
    }
  }
}
