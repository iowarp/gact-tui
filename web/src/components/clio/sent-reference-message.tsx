import { GroundedMessageResponse } from './grounded-message-response';
import { sentDataReferences } from '@/lib/sent-data-references';

/** Keep sent data selections inspectable without burying the person's question. */
export function SentReferenceMessage({ text }: { text: string }) {
  const projected = sentDataReferences(text);
  if (!projected.references.length) return <GroundedMessageResponse>{text}</GroundedMessageResponse>;
  return (
    <div className="min-w-0 space-y-3">
      {projected.references.map((reference, index) => (
        <details className="min-w-0 rounded-md border bg-background/60 text-xs" key={index}>
          <summary className="cursor-pointer px-3 py-2">
            <span className="font-medium">{reference.title}</span>
            <span className="mt-1 block break-words text-muted-foreground">{reference.summary}</span>
          </summary>
          <div className="max-h-64 overflow-auto border-t px-3 py-2 [&_pre]:whitespace-pre-wrap [&_pre]:break-words">
            <GroundedMessageResponse>{reference.markdown}</GroundedMessageResponse>
          </div>
        </details>
      ))}
      {projected.text ? <GroundedMessageResponse>{projected.text}</GroundedMessageResponse> : null}
    </div>
  );
}
