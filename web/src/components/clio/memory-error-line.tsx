import { memoryErrorText } from './memory-document-helpers';

/** A failed read in one plain red line, with Retry as an inline text action. */
export function MemoryErrorLine({
  what,
  error,
  onRetry,
}: {
  /** What failed, as a sentence ("Memories could not be loaded."). */
  what: string;
  error: unknown;
  onRetry?: () => void;
}) {
  const reason = memoryErrorText(error);
  const text = `${what} ${reason}`;
  return (
    <p
      className="flex h-7 min-w-0 items-center gap-2 text-[0.71875rem] whitespace-nowrap text-destructive"
      data-slot="memory-error"
      role="alert"
    >
      <span className="min-w-0 truncate" title={text}>
        {text}
      </span>
      {onRetry ? (
        <button
          className="shrink-0 rounded-sm text-foreground underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onClick={onRetry}
          type="button"
        >
          Retry
        </button>
      ) : null}
    </p>
  );
}
