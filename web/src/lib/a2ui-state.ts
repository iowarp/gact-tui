export interface SurfaceActionReceipt {
  name: string;
  status: string;
}

export function findLastSurfaceAction(
  messages: readonly unknown[],
): SurfaceActionReceipt | undefined {
  for (const message of messages.toReversed()) {
    if (!message || typeof message !== 'object') continue;
    const update = (message as { updateDataModel?: unknown }).updateDataModel;
    if (!update || typeof update !== 'object') continue;
    const candidate = update as { path?: unknown; value?: unknown };
    if (
      candidate.path !== '/lastAction' ||
      !candidate.value ||
      typeof candidate.value !== 'object'
    ) {
      continue;
    }
    const value = candidate.value as { name?: unknown; status?: unknown };
    if (typeof value.name === 'string' && typeof value.status === 'string') {
      return { name: value.name, status: value.status };
    }
  }
  return undefined;
}
