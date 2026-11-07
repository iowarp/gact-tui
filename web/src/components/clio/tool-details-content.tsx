import type { ReactNode } from 'react';
import { CollapsibleContent } from '@/components/ui/collapsible';
import { ResultDialogContent } from './result-dialog-content';
import { cn } from '@/lib/utils';

/** Bound an inline readable result or the separate technical-details dialog. */
export function ToolDetailsContent({
  inline,
  title,
  children,
  bounded = true,
}: {
  inline: boolean;
  title: string;
  children: ReactNode;
  /** Terminal command/output sections already bound their own previews. */
  bounded?: boolean;
}) {
  return inline ? (
    <CollapsibleContent>
      <div
        role="region"
        aria-label={title}
        className={cn(
          'my-1 min-w-0 space-y-3 py-1 text-sm [overflow-wrap:anywhere]',
          bounded && 'max-w-prose',
        )}
        data-slot="transcript-tool-details"
      >
        {children}
      </div>
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
