/** Project only the service CLI's declared observation record, never infer health from prose. */
export function serviceObservationSummary(logs: string | undefined): string | undefined {
  let latest: Record<string, unknown> | undefined;
  for (const line of logs?.split('\n') ?? []) {
    if (!line.startsWith('CLIO_SERVICE_OBSERVATION ')) continue;
    try {
      const value: unknown = JSON.parse(line.slice('CLIO_SERVICE_OBSERVATION '.length));
      if (value && typeof value === 'object' && !Array.isArray(value))
        latest = value as Record<string, unknown>;
    } catch {
      /* A partial log line cannot establish an observation. */
    }
  }
  if (!latest) return undefined;
  if (latest.serving === true) return 'The service responded.';
  if (latest.running === true) return 'The process started; service readiness was not confirmed.';
  if (latest.running === false && latest.installed === true)
    return 'The service was confirmed stopped.';
  if (latest.installed === false) return 'The service was not installed.';
  return undefined;
}

/** Suppress repeated status words; an operation outcome is separate from its badge. */
export function operationDetail(detail: string | undefined, status: string): string | undefined {
  const text = detail?.trim();
  if (
    !text ||
    text.toLocaleLowerCase() === status.toLocaleLowerCase() ||
    text.startsWith('CLIO_SERVICE_OBSERVATION ')
  )
    return undefined;
  if (text.length > 320) {
    const first = text.split(/\n|(?<=\.)\s/u)[0];
    return first.length <= 320 ? first : `${first.slice(0, 317)}…`;
  }
  return text;
}
