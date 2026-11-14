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
import { ph, t } from '@lingui/core/macro';

type Report = (noun: string, missing: boolean) => void;
const UnofferedReport = createContext<Report | undefined>(undefined);

/**
 * Display names of the parts a page reports by `noun`. The noun stays the
 * stable English key the pages order by; it is translated only when shown.
 */
const NOUN_LABELS: Record<string, string> = {
  configuration: t`configuration`,
  'session retention': t`session retention`,
  'compaction history': t`compaction history`,
  'health details': t`health details`,
  'storage statistics': t`storage statistics`,
  'activity metrics': t`activity metrics`,
  'hook inspection': t`hook inspection`,
};

function nounLabel(noun: string): string {
  return NOUN_LABELS[noun] ?? noun;
}

/** "This agent doesn’t offer a, b or c." as one sentence per list length. */
function unofferedSentence(nouns: readonly string[]): string {
  const labels = nouns.map(nounLabel);
  if (labels.length < 2) return t`This agent doesn’t offer ${ph({ part: labels.join('') })}.`;
  const last = labels.at(-1) ?? '';
  return t`This agent doesn’t offer ${ph({ parts: labels.slice(0, -1).join(', ') })} or ${last}.`;
}

const UnofferedNouns = createContext<readonly string[] | undefined>(undefined);

/**
 * Collects the parts of a page the agent does not offer and names them on one
 * empty line, instead of one "doesn't offer" line per part. The line leads the
 * page body; a page whose heading sits inside it places `UnofferedLine` under
 * that heading and passes `placed`.
 */
export function UnofferedParts({
  children,
  order,
  placed = false,
}: {
  children: ReactNode;
  order: string[];
  placed?: boolean;
}) {
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
      <UnofferedNouns.Provider value={nouns}>
        {placed ? null : <UnofferedLine />}
        {children}
      </UnofferedNouns.Provider>
    </UnofferedReport.Provider>
  );
}

/** The page's one "doesn't offer" line; nothing outside `UnofferedParts` or when all parts are offered. */
export function UnofferedLine() {
  const nouns = useContext(UnofferedNouns);
  if (!nouns?.length) return null;
  return (
    <StateView
      kind="unavailable"
      size="row"
      title={<span className="text-pretty">{unofferedSentence(nouns)}</span>}
    />
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
        title={t`This service doesn’t offer ${ph({ part: nounLabel(noun) })}.`}
      />
    );
  return (
    <div
      className={cn(
        'flex min-h-7 min-w-0 items-center gap-2 py-1 text-label',
        // In a narrow column the title wraps (a long word hyphenated at a syllable), and the
        // reason and Retry drop under it rather than push the page sideways.
        '@max-sm:flex-wrap @max-sm:gap-y-0.5',
        className,
      )}
      role="alert"
    >
      <span className="flex min-w-0 items-baseline gap-1.5 @max-sm:flex-wrap" title={technical}>
        <span className="min-w-0 shrink-0 font-medium text-destructive @max-sm:shrink @max-sm:[overflow-wrap:break-word] @max-sm:hyphens-auto @max-sm:[hyphenate-limit-chars:10_4_4]">
          {title}
        </span>
        <span className="min-w-0 truncate text-destructive/90 max-[599px]:whitespace-normal @max-sm:whitespace-normal @max-sm:[overflow-wrap:break-word] @max-sm:hyphens-auto @max-sm:[hyphenate-limit-chars:10_4_4]">
          {plainReason(error)}
        </span>
      </span>
      {onRetry ? (
        <Button
          className="h-auto shrink-0 px-0 text-label"
          disabled={retrying}
          onClick={onRetry}
          size="xs"
          type="button"
          variant="link"
        >
          {t`Retry`}
        </Button>
      ) : null}
    </div>
  );
}
