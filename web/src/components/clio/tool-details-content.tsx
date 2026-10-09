import type { ReactNode } from 'react';
import { CollapsibleContent } from '@/components/ui/collapsible';
import { ResultDialogContent } from './result-dialog-content';

/** Present the same original call details inline in a transcript or in its dialog. */
export function ToolDetailsContent({
  inline,
  title,
  children,
}: {
  inline: boolean;
  title: string;
  children: ReactNode;
}) {
  return inline ? (
    <CollapsibleContent>
      <div
        role="region"
        aria-label={title}
        className="my-1 max-h-80 min-w-0 space-y-3 overflow-auto overscroll-contain rounded-lg border bg-muted/20 p-3 text-sm [overflow-wrap:anywhere]"
        data-slot="transcript-tool-details"
        tabIndex={0}
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
