import { t } from '@lingui/core/macro';
function statusOf(error: unknown) {
  if (typeof error !== 'object' || error === null || !('status' in error)) return undefined;
  const status = Number((error as { status?: unknown }).status);
  return Number.isFinite(status) ? status : undefined;
}

/** The service answered that it has no such feature: not a failure, and retrying cannot help. */
export function notOffered(error: unknown) {
  const status = statusOf(error);
  // A known status decides alone, so a real "… not found" failure keeps its Retry.
  if (status !== undefined) return status === 404;
  const message = error instanceof Error ? error.message : '';
  return /\b404\b|not found/iu.test(message);
}

/** The service's own message when it is plain language; otherwise a reason without HTTP text. */
export function plainReason(error: unknown) {
  const status = statusOf(error);
  const message = error instanceof Error ? error.message.trim() : '';
  if (notOffered(error)) return t`This agent does not offer it yet.`;
  if (status === 401 || status === 403) return t`This agent did not allow it.`;
  if (/failed to fetch|networkerror|unreachable|econn|timed? ?out/iu.test(message))
    return t`The agent could not be reached.`;
  if (!message || /request failed|https?\b|\b[45]\d\d\b/iu.test(message))
    return t`The agent could not provide it. Try again in a moment.`;
  return message;
}
