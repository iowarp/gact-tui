import { brand } from '@brand';
import type { DocumentWorkingCopy } from '@clio/core/v3';
import { StateView } from './primitives/state-view';
import { t, ph } from '@lingui/core/macro';

/** "CLIO saved version 5 while you were editing. Keep its version, or save yours as version 6." */
function conflictDetail(headVersion: number | undefined) {
  return headVersion === undefined
    ? t`${ph({ agentName: brand.agentName })} saved a newer version while you were editing. Keep its version, or save yours as the next one.`
    : t`${ph({ agentName: brand.agentName })} saved version ${headVersion} while you were editing. Keep its version, or save yours as version ${headVersion + 1}.`;
}

/**
 * A working copy that needs a decision replaces the document body: Changed
 * elsewhere (Keep current, Use mine) when the artifact moved on while it was
 * open, or the failed copy with a way back to the document.
 */
export function WorkingCopyState({
  copy,
  headVersion,
  pending,
  onResolve,
  onDismiss,
}: {
  copy: DocumentWorkingCopy;
  /** The version that moved on, once its manifest is known. */
  headVersion?: number;
  pending: boolean;
  onResolve: (resolution: 'keep-current' | 'use-working-copy') => void;
  onDismiss: () => void;
}) {
  if (copy.status === 'conflict')
    return (
      <StateView
        action={{
          label: t`Use mine`,
          disabled: pending,
          onClick: () => onResolve('use-working-copy'),
        }}
        detail={conflictDetail(headVersion)}
        kind="changed-elsewhere"
        secondaryAction={{
          label: t`Keep current`,
          disabled: pending,
          onClick: () => onResolve('keep-current'),
        }}
        size="viewer"
        title={t`Changed since you opened it`}
      />
    );
  return (
    <StateView
      action={{ label: t`Back to the document`, onClick: onDismiss }}
      detail={
        copy.error ??
        t`Your edits after version ${ph({ head_version: copy.head_version })} were not saved`
      }
      kind="unavailable"
      size="viewer"
      title={t`The working copy stopped saving`}
    />
  );
}
