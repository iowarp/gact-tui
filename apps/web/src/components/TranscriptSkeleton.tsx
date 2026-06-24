/**
 * Loading skeleton placeholder for the transcript while messages load.
 * Exports {@link TranscriptSkeleton}.
 */
export function TranscriptSkeleton() {
  return (
    <div class="trx__skeleton" data-testid="transcript-skeleton" aria-hidden="true">
      <div class="skeleton trx__skeleton-bubble trx__skeleton-bubble--user" />
      <div class="skeleton trx__skeleton-bubble trx__skeleton-bubble--assistant" />
      <div class="skeleton trx__skeleton-bubble trx__skeleton-bubble--assistant trx__skeleton-bubble--short" />
      <div class="skeleton trx__skeleton-bubble trx__skeleton-bubble--user trx__skeleton-bubble--short" />
      <div class="skeleton trx__skeleton-bubble trx__skeleton-bubble--assistant" />
    </div>
  );
}
