import type { WorkspaceReference } from '@clio/core/v3';
import { ContextReferenceLink } from './context-reference-link';
import { GroundedMessageResponse } from './grounded-message-response';
import { sentDataReferences } from '@/lib/sent-data-references';
import { inlineReferenceSegments, type ContextReferenceBlock } from '@/lib/sent-inline-references';

/**
 * The person's own words, with each `@reference` a link where they typed it, the
 * way a Claude Code prompt keeps `@path` in the sentence. Read as typed: markdown
 * around a mention would be split by it, so this text is not parsed as markdown.
 */
function SentTextWithReferences({
  text,
  references,
  onOpenReference,
}: {
  text: string;
  references: readonly ContextReferenceBlock[];
  onOpenReference?: (reference: WorkspaceReference) => void;
}) {
  const segments = inlineReferenceSegments(text, references);
  if (!segments.some((segment) => segment.kind === 'reference')) {
    return <GroundedMessageResponse>{text}</GroundedMessageResponse>;
  }
  return (
    <p className="min-w-0 whitespace-pre-wrap break-words leading-7">
      {segments.map((segment, index) =>
        segment.kind === 'text' ? (
          segment.text
        ) : (
          <ContextReferenceLink
            block={segment.block}
            className="inline-flex align-baseline"
            key={`${segment.block.id}-${index}`}
            onOpenReference={onOpenReference}
          />
        ),
      )}
    </p>
  );
}

/** Keep sent data selections inspectable without burying the person's question. */
export function SentReferenceMessage({
  text,
  inlineReferences = [],
  onOpenReference,
}: {
  text: string;
  inlineReferences?: readonly ContextReferenceBlock[];
  onOpenReference?: (reference: WorkspaceReference) => void;
}) {
  const projected = sentDataReferences(text);
  if (!projected.references.length) {
    return (
      <SentTextWithReferences
        onOpenReference={onOpenReference}
        references={inlineReferences}
        text={text}
      />
    );
  }
  return (
    <div className="min-w-0 space-y-3">
      {projected.references.map((reference, index) => (
        <details className="min-w-0 rounded-md border bg-background/60 text-xs" key={index}>
          <summary className="cursor-pointer px-3 py-2">
            <span className="font-medium">{reference.title}</span>
            <span className="mt-1 block break-words text-muted-foreground">
              {reference.summary}
            </span>
          </summary>
          <div className="max-h-64 overflow-auto border-t px-3 py-2 [&_pre]:whitespace-pre-wrap [&_pre]:break-words">
            <GroundedMessageResponse>{reference.markdown}</GroundedMessageResponse>
          </div>
        </details>
      ))}
      {projected.text ? (
        <SentTextWithReferences
          onOpenReference={onOpenReference}
          references={inlineReferences}
          text={projected.text}
        />
      ) : null}
    </div>
  );
}
