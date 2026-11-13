import type { ReactNode } from 'react';
import { CollapsibleContent } from '@/components/ui/collapsible';
import { InfoIcon } from '@/lib/icon-vocabulary';
import { ResultDialogContent } from './result-dialog-content';
import { ActivityBody } from './activity-row';
import { cn } from '@/lib/utils';
import { t } from '@lingui/core/macro';

/** Bound an inline readable result (the row's framed body) or a result dialog. */
export function ToolDetailsContent({
  inline,
  title,
  children,
  bounded = true,
  flush = false,
  description = t`Original tool arguments, result, and diagnostics.`,
}: {
  inline: boolean;
  title: string;
  children: ReactNode;
  /** Terminal command/output sections already bound their own previews. */
  bounded?: boolean;
  /** The body draws its own header bars and edges (a diff or a command). */
  flush?: boolean;
  /** The dialog subtitle: what the recorded content is. */
  description?: string;
}) {
  return inline ? (
    <CollapsibleContent>
      <ActivityBody
        label={title}
        className={cn(
          flush
            ? 'p-0'
            : 'space-y-3 px-3 py-2.5 [&_[data-slot=terminal]]:-mx-3 [&_[data-slot=terminal]]:rounded-none [&_[data-slot=terminal]]:border-x-0',
          // The row's frame is the only box: a result's own panel sits flush inside it.
          !flush &&
            '[&_[data-slot=tool-human-result]]:ml-0 [&_[data-slot=tool-result-panel]]:rounded-none [&_[data-slot=tool-result-panel]]:border-0 [&_[data-slot=tool-result-panel]]:bg-transparent',
          // Prose keeps a reading measure; code, output and tables use the full width.
          bounded && !flush && '[&_p]:max-w-[72ch]',
        )}
      >
        <div className="contents" data-slot="transcript-tool-details">
          {children}
        </div>
      </ActivityBody>
    </CollapsibleContent>
  ) : (
    <ResultDialogContent icon={<InfoIcon />} title={title} description={description}>
      {children}
    </ResultDialogContent>
  );
}
