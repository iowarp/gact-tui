import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { StateView } from './primitives/state-view';
import { notOffered, plainReason } from './settings-health-reason';

type Report = (noun: string, missing: boolean) => void;
const UnofferedReport = createContext<Report | undefined>(undefined);

function joined(nouns: readonly string[]) {
  if (nouns.length < 2) return nouns.join('');
  return `${nouns.slice(0, -1).join(', ')} or ${nouns.at(-1)}`;
}

/**
 * Collects the parts of a page the agent does not offer and names them on one
 * empty line, instead of one "doesn't offer" line per part.
 */
export function UnofferedParts({ children, order }: { children: ReactNode; order: string[] }) {
  const [missing, setMissing] = useState<ReadonlySet<string>>(new Set());
  const report = useCallback<Report>((noun, off) => {
    setMissing((current) => {
      if (current.has(noun) === off) return current;
      const next = new Set(current);
      if (off) next.add(noun);
      else next.delete(noun);
      return next;
    });
  }, []);
  const nouns = useMemo(
    () => [
      ...order.filter((noun) => missing.has(noun)),
      ...[...missing].filter((noun) => !order.includes(noun)),
    ],
    [missing, order],
  );
  return (
    <UnofferedReport.Provider value={report}>
      {children}
      {nouns.length ? (
        <StateView
          kind="unavailable"
          size="row"
          // The whole page body at phone width, so it wraps rather than hiding behind an ellipsis.
          className="h-auto min-h-7 py-1"
          title={
            <span className="whitespace-normal text-pretty">
              This agent doesn’t offer {joined(nouns)}.
            </span>
          }
        />
      ) : null}
    </UnofferedReport.Provider>
  );
}

/** Tells the page whether the agent lacks this part; the page names it on its one line. */
function ReportUnoffered({ noun }: { noun: string }) {
  const report = useContext(UnofferedReport);
  useEffect(() => {
    report?.(noun, true);
    return () => report?.(noun, false);
  }, [noun, report]);
  return null;
}

/**
 * A load failure on the affected row or under its group label: what failed, a
 * plain-language reason and an inline Retry. The technical message stays in the hover title.
 * A service without the feature (`noun` given, 404) gets the neutral unavailable row instead,
 * the same line Data sources and Prompts show, with no Retry.
 */
export function SettingsLoadError({
  title,
  noun,
  error,
  onRetry,
  retrying = false,
  className,
}: {
  title: string;
  /** What the service may not offer, in running text ("session retention"). */
  noun?: string;
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}) {
  const technical = error instanceof Error ? error.message : undefined;
  const collected = useContext(UnofferedReport);
  if (noun && notOffered(error) && collected) return <ReportUnoffered noun={noun} />;
  if (noun && notOffered(error))
    return (
      <StateView
        className={className}
        kind="unavailable"
        size="row"
        title={`This service doesn’t offer ${noun}.`}
      />
    );
  return (
    <div
      className={cn('flex min-h-7 min-w-0 items-center gap-2 py-1 text-[0.71875rem]', className)}
      role="alert"
    >
      <span className="flex min-w-0 items-baseline gap-1.5" title={technical}>
        <span className="shrink-0 font-medium text-destructive">{title}</span>
        <span className="min-w-0 truncate text-destructive/90 max-[599px]:whitespace-normal">
          {plainReason(error)}
        </span>
      </span>
      {onRetry ? (
        <Button
          className="h-auto shrink-0 px-0 text-[0.71875rem]"
          disabled={retrying}
          onClick={onRetry}
          size="xs"
          type="button"
          variant="link"
        >
          Retry
        </Button>
      ) : null}
    </div>
  );
}
