import { ShieldCheckIcon } from 'lucide-react';
import { vocab } from '@/lib/brand-vocabulary';
import { AccessRows } from './source-form-parts';
import type { SourceAccess } from './source-access';

/**
 * A connected source's Access: the connect form's three rows, the write
 * confirmation when originals would change, and the server's reason for any
 * row it cannot offer. Link and Download are the frame's footer.
 */
export function SourceDetailAccess({
  access,
  onAccess,
  unavailable,
  disabled,
  confirm,
  confirmed,
  onConfirmed,
  reason,
}: {
  access: SourceAccess;
  onAccess: (access: SourceAccess) => void;
  unavailable: Partial<Record<SourceAccess, string>>;
  disabled: boolean;
  /** Ask before a link that changes the originals. */
  confirm: boolean;
  confirmed: boolean;
  onConfirmed: (confirmed: boolean) => void;
  reason?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5" aria-label="How to use this folder">
      <AccessRows
        value={access}
        onChange={onAccess}
        unavailable={unavailable}
        disabled={disabled}
      />
      {confirm ? (
        <label className="flex items-start gap-[9px] text-meta leading-[1.45] text-warning">
          <input
            type="checkbox"
            aria-label="Allow changes to original files"
            className="mt-[3px] size-3.5 shrink-0 accent-primary"
            checked={confirmed}
            onChange={(event) => onConfirmed(event.target.checked)}
          />
          <span>Edits and deletions change the originals, including files shared with others.</span>
        </label>
      ) : null}
      {reason ? (
        <p className="flex items-start gap-2 text-caption leading-[1.45] text-faint">
          <ShieldCheckIcon aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          {reason}
        </p>
      ) : (
        <p className="text-caption leading-[1.45] text-faint">
          A link reads the originals when {vocab.agent} needs them. A download saves a copy in this
          workspace.
        </p>
      )}
    </div>
  );
}
