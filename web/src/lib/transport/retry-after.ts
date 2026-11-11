/**
 * The wait a failed response asks for, in milliseconds: the `Retry-After` header (delay
 * seconds or an HTTP date), else the error envelope's `retry_after_s`. Undefined when the
 * service named none.
 */
export function retryAfterMs(
  header: string | null | undefined,
  envelopeSeconds?: unknown,
  now = Date.now(),
): number | undefined {
  const value = header?.trim();
  if (value) {
    if (/^\d+(\.\d+)?$/.test(value)) return Number(value) * 1000;
    const at = Date.parse(value);
    if (Number.isFinite(at)) return Math.max(0, at - now);
  }
  if (
    typeof envelopeSeconds === 'number' &&
    Number.isFinite(envelopeSeconds) &&
    envelopeSeconds >= 0
  ) {
    return envelopeSeconds * 1000;
  }
  return undefined;
}

/** A header from a plain record, matched case-insensitively. */
export function headerValue(
  headers: Record<string, string> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return undefined;
}
