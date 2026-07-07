export class HttpError extends Error {
  override name = 'HttpError';
  /** SPEC §14 typed error envelope when the body parsed as one. */
  errorInfo?: {
    error: string;
    message: string;
    recoverable?: boolean;
    details?: Record<string, unknown>;
  };

  constructor(
    public status: number,
    public statusText: string,
    public body: string,
  ) {
    super(`HTTP ${status} ${statusText}: ${shorten(body)}`);
    // GACT v0.2 error responses wrap the typed envelope in {"error": …}.
    // Lift it onto the HttpError so callers can present a user-friendly
    // message instead of raw JSON.
    try {
      const parsed = JSON.parse(body) as {
        error?: {
          error?: string;
          message?: string;
          recoverable?: boolean;
          details?: Record<string, unknown>;
        };
      };
      const env = parsed?.error;
      if (env && typeof env.error === 'string' && typeof env.message === 'string') {
        this.errorInfo = {
          error: env.error,
          message: env.message,
          recoverable: env.recoverable,
          details: env.details,
        };
        // Surface the human-readable message at .message so default UI
        // paths show the actionable copy first.
        this.message = `${env.error}: ${env.message}`;
      }
    } catch {
      // body wasn't JSON; leave the original message intact.
    }
  }
}

function shorten(s: string): string {
  return s.length <= 200 ? s : `${s.slice(0, 200)}…`;
}

/**
 * Raised when a shared-transport HTTP request exceeds its configured timeout
 * (see `ClientOptions.timeoutMs`, default 30s). Distinct from a caller-driven
 * `AbortError`: the caller's own signal aborting is re-thrown untouched, while
 * a timeout surfaces this typed error so UI paths can present a "server not
 * responding" message instead of a generic abort.
 */
export class TransportTimeoutError extends Error {
  override name = 'TransportTimeoutError';

  constructor(
    public url: string,
    public timeoutMs: number,
  ) {
    super(`HTTP request to ${url} timed out after ${timeoutMs}ms`);
  }
}
