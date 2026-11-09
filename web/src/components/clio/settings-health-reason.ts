function statusOf(error: unknown) {
  if (typeof error !== 'object' || error === null || !('status' in error)) return undefined;
  const status = Number((error as { status?: unknown }).status);
  return Number.isFinite(status) ? status : undefined;
}

/** The service's own message when it is plain language; otherwise a reason without HTTP text. */
export function plainReason(error: unknown) {
  const status = statusOf(error);
  const message = error instanceof Error ? error.message.trim() : '';
  if (status === 404 || /\b404\b|not found/iu.test(message))
    return 'This agent does not offer it yet.';
  if (status === 401 || status === 403) return 'This agent did not allow it.';
  if (/failed to fetch|networkerror|unreachable|econn|timed? ?out/iu.test(message))
    return 'The agent could not be reached.';
  if (!message || /request failed|https?\b|\b[45]\d\d\b/iu.test(message))
    return 'The agent could not provide it. Try again in a moment.';
  return message;
}
