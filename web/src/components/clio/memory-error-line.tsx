import { memoryErrorText } from './memory-document-helpers';
import { t } from '@lingui/core/macro';

/**
 * A failed read in one plain red line, with Retry as an inline text action. Below
 * 600 px the sentence wraps (Retry stays on its first line) so the reason survives.
 */
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
      className="flex h-7 min-w-0 items-center gap-2 text-label whitespace-nowrap text-destructive max-[599px]:h-auto max-[599px]:min-h-7 max-[599px]:items-start max-[599px]:py-1 max-[599px]:whitespace-normal"
      data-slot="memory-error"
      role="alert"
    >
      <span className="min-w-0 truncate max-[599px]:whitespace-normal" title={text}>
        {text}
      </span>
      {onRetry ? (
        <button
          className="shrink-0 rounded-sm text-foreground underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onClick={onRetry}
          type="button"
        >
          {t`Retry`}
        </button>
      ) : null}
    </p>
  );
}
