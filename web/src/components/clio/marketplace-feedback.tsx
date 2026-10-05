import { marketplaceErrorSummary } from './marketplace-errors';

export function MarketplaceFeedback({ error }: { error: string }) {
  const summary = marketplaceErrorSummary(error);
  return (
    <div
      role="alert"
      className="min-w-0 space-y-2 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm"
    >
      <p className="text-destructive">{summary}</p>
      {summary !== error ? (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Error details</summary>
          <p className="mt-2 whitespace-pre-wrap break-words">{error}</p>
        </details>
      ) : null}
    </div>
  );
}
