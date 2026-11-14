import { plural, t } from '@lingui/core/macro';
import { formatBytes } from '@/lib/format';

/** "12 entries", "3 / 10 entries indexed": counted against the total when one is known. */
function entriesLabel(done: number, total: number | undefined, indexed: boolean): string {
  const doneText = String(done);
  if (total === undefined) {
    return indexed
      ? plural(done, { one: `${doneText} entry indexed`, other: `${doneText} entries indexed` })
      : plural(done, { one: `${doneText} entry`, other: `${doneText} entries` });
  }
  const totalText = String(total);
  return indexed
    ? plural(total, {
        one: `${doneText} / ${totalText} entry indexed`,
        other: `${doneText} / ${totalText} entries indexed`,
      })
    : plural(total, {
        one: `${doneText} / ${totalText} entry`,
        other: `${doneText} / ${totalText} entries`,
      });
}

/** Format only progress actually supplied by the task owner. */
export function taskProgressLabel(
  progress: Record<string, unknown> | undefined,
  kind = '',
  reportedIssue?: string,
): string {
  if (typeof progress?.completed === 'number') {
    const total = typeof progress.total === 'number' ? progress.total : undefined;
    if (progress.unit === 'bytes') {
      const doneText = formatBytes(progress.completed);
      if (total !== undefined) return `${doneText} / ${formatBytes(total)}`;
      return kind === 'Shell' ? t`${doneText} output` : doneText;
    }
    if (progress.unit === 'entries')
      return entriesLabel(progress.completed, total, kind === 'Indexing');
    const unit =
      typeof progress.unit === 'string' && progress.unit
        ? progress.completed === 1 && total === undefined
          ? progress.unit.replace(/s$/, '')
          : progress.unit
        : '';
    return `${progress.completed}${total === undefined ? '' : ` / ${total}`}${unit ? ` ${unit}` : ''}`;
  }
  if (kind === 'Indexing' && typeof progress?.entries_done === 'number')
    return entriesLabel(progress.entries_done, undefined, true);
  if (typeof progress?.bytes_done === 'number')
    return `${formatBytes(progress.bytes_done)}${typeof progress.bytes_total === 'number' ? ` / ${formatBytes(progress.bytes_total)}` : ''}`;
  if (typeof progress?.entries_done === 'number')
    return entriesLabel(progress.entries_done, undefined, true);
  if (typeof progress?.bytes === 'number') {
    const bytesText = formatBytes(progress.bytes);
    return t`${bytesText} output`;
  }
  if (typeof progress?.progress === 'number')
    return `${progress.progress}${typeof progress.total === 'number' ? ` / ${progress.total}` : ''}`;
  return typeof progress?.message === 'string' && progress.message.trim() !== reportedIssue?.trim()
    ? progress.message
    : '';
}
