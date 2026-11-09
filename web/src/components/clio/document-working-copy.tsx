import type { DocumentWorkingCopy } from '@clio/core/v3';
import { StateView } from './primitives/state-view';

/**
 * A working copy that needs a decision replaces the document body: Changed
 * elsewhere (Keep current, Use mine) when the artifact moved on while it was
 * open, or the failed copy with a way back to the document.
 */
export function WorkingCopyState({
  copy,
  pending,
  onResolve,
  onDismiss,
}: {
  copy: DocumentWorkingCopy;
  pending: boolean;
  onResolve: (resolution: 'keep-current' | 'use-working-copy') => void;
  onDismiss: () => void;
}) {
  if (copy.status === 'conflict')
    return (
      <StateView
        action={{
          label: 'Use mine',
          disabled: pending,
          onClick: () => onResolve('use-working-copy'),
        }}
        kind="changed-elsewhere"
        secondaryAction={{
          label: 'Keep current',
          disabled: pending,
          onClick: () => onResolve('keep-current'),
        }}
        size="viewer"
        title="Changed since you opened it"
      />
    );
  return (
    <StateView
      action={{ label: 'Back to the document', onClick: onDismiss }}
      detail={copy.error ?? `Your edits after version ${copy.head_version} were not saved`}
      kind="unavailable"
      size="viewer"
      title="The working copy stopped saving"
    />
  );
}
