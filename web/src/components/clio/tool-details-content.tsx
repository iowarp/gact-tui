import type { ReactNode } from 'react';
import { CollapsibleContent } from '@/components/ui/collapsible';
import { ResultDialogContent } from './result-dialog-content';
import { ActivityBody } from './activity-row';
import { cn } from '@/lib/utils';

/** Bound an inline readable result (the row's framed body) or a result dialog. */
export function ToolDetailsContent({
  inline,
  title,
  children,
  bounded = true,
  flush = false,
}: {
  inline: boolean;
  title: string;
  children: ReactNode;
  /** Terminal command/output sections already bound their own previews. */
  bounded?: boolean;
  /** The body draws its own header bars and edges (a diff or a command). */
  flush?: boolean;
}) {
  return inline ? (
    <CollapsibleContent>
      <ActivityBody
        label={title}
        className={cn(
          flush
            ? 'p-0'
            : 'space-y-3 px-3 py-2.5 [&_[data-slot=terminal]]:-mx-3 [&_[data-slot=terminal]]:rounded-none [&_[data-slot=terminal]]:border-x-0',
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
    <ResultDialogContent
      title={title}
      description="Original tool arguments, result, and diagnostics."
    >
      {children}
    </ResultDialogContent>
  );
}
