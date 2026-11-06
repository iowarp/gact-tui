import type { WorkspaceReference } from '@clio/core/v3';
import { createElement } from 'react';
import { referenceKindLabel } from '@/lib/composer-reference-domain';
import type { ContextReferenceBlock } from '@/lib/sent-inline-references';
import { cn } from '@/lib/utils';
import { referenceKindIcon } from './composer-reference-presentation';

/** One referenced workspace object, opened in place from the transcript. */
export function ContextReferenceLink({
  block,
  className,
  onOpenReference,
}: {
  block: ContextReferenceBlock;
  className?: string;
  onOpenReference?: (reference: WorkspaceReference) => void;
}) {
  const reference: WorkspaceReference = {
    kind: block.ref_kind,
    id: block.ref_id,
    label: block.label,
    // The transcript block carries no description of its own. Repeating the
    // label here would invent one, and every surface downstream would read
    // it as something the service said.
    detail: '',
    media_type: block.media_type,
    revision: block.revision,
    navigation: block.navigation,
  };
  const kind = referenceKindLabel(block.ref_kind);
  return (
    <button
      aria-label={`Open referenced ${kind} ${block.label}`}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      // The revision is an addressing token, not something to read. It stays
      // available for support and correlation without being shown.
      data-reference-revision={block.revision}
      disabled={!onOpenReference}
      onClick={() => onOpenReference?.(reference)}
      title={kind}
      type="button"
    >
      {createElement(referenceKindIcon(block.ref_kind), {
        'aria-hidden': 'true',
        className: 'size-3.5 shrink-0',
      })}
      <span className="truncate">{block.label}</span>
    </button>
  );
}
