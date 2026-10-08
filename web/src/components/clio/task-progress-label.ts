import { formatBytes } from '@/lib/format';

/** Format only progress actually supplied by the task owner. */
export function taskProgressLabel(
  progress: Record<string, unknown> | undefined,
  kind = '',
): string {
  if (kind === 'Indexing' && typeof progress?.entries_done === 'number')
    return `${progress.entries_done} entries indexed`;
  if (typeof progress?.bytes_done === 'number')
    return `${formatBytes(progress.bytes_done)}${typeof progress.bytes_total === 'number' ? ` / ${formatBytes(progress.bytes_total)}` : ''}`;
  if (typeof progress?.entries_done === 'number') return `${progress.entries_done} entries indexed`;
  if (typeof progress?.bytes === 'number') return `${formatBytes(progress.bytes)} output`;
  if (typeof progress?.progress === 'number')
    return `${progress.progress}${typeof progress.total === 'number' ? ` / ${progress.total}` : ''}`;
  return typeof progress?.message === 'string' ? progress.message : '';
}
