import type { ReactNode } from 'react';
import { CollapsibleContent } from '@/components/ui/collapsible';
import { ResultDialogContent } from './result-dialog-content';

/** Bound an inline readable result or the separate technical-details dialog. */
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
        className="my-1 max-h-80 min-w-0 space-y-3 overflow-auto overscroll-contain py-1 text-sm [overflow-wrap:anywhere]"
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
