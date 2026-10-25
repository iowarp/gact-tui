import type { MemoryFactChange } from '@clio/core/v3';
import { correctionParts } from '@/lib/memory-changes';

/** One readable fact/change renderer for conversation results, review and history. */
export function MemoryFactChanges({ changes }: { changes: readonly MemoryFactChange[] }) {
  if (!changes.length) return <p className="text-sm text-muted-foreground">No fact changes.</p>;
  return (
    <ul aria-label="Memory facts" className="grid gap-2 text-sm leading-6">
      {changes.map((change, index) => (
        <li key={`${change.id}:${index}`} className="flex min-w-0 items-start gap-2">
          <span aria-label={change.kind} className="shrink-0 text-muted-foreground">
            {change.kind === 'added'
              ? '+'
              : change.kind === 'removed'
                ? '−'
                : change.kind === 'read'
                  ? '•'
                  : '↳'}
          </span>
          <span className="min-w-0 break-words">
            {change.kind === 'updated' ? (
              <Correction before={change.before} after={change.after} />
            ) : change.kind === 'removed' ? (
              <del className="text-muted-foreground">{change.before}</del>
            ) : (
              change.after
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Correction({ before, after }: { before: string; after: string }) {
  const parts = correctionParts(before, after);
  return (
    <>
      {parts.prefix}
      {parts.removed ? <del className="text-muted-foreground">{parts.removed}</del> : null}
      {parts.removed && parts.added ? ' ' : null}
      {parts.added ? <ins className="font-medium no-underline">{parts.added}</ins> : null}
      {parts.suffix}
    </>
  );
}
