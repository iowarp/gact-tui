import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { busiestWindow } from '@/lib/fleet-usage';
import { SpendSummary, UsageSummary } from './fleet-usage';

type Marker = { name: string; used_percent: number };

function Readout({ tokens, cost, marker }: { tokens?: number; cost?: number; marker?: Marker }) {
  return (
    <span className="ml-auto hidden items-center gap-3 font-mono sm:inline-flex">
      {marker ? (
        <span className="rounded border border-warning/50 px-1 text-warning-foreground">
          {marker.name} {Math.round(marker.used_percent)}%
        </span>
      ) : null}
      <span title="Tokens recorded for this conversation">Tokens: {tokens ?? 0}</span>
      <span>
        Cost:{' '}
        {cost === undefined ? (
          <span className="text-muted-foreground/70">&mdash;</span>
        ) : (
          `$${cost.toFixed(4)}`
        )}
      </span>
    </span>
  );
}

/**
 * The tokens and cost under the chat box. Hovering (or focusing) shows the
 * account the conversation runs on: its usage windows and resets, its balance,
 * and what this conversation and the work it started spent per model. Past 80%
 * of a window, the readout names that window and its use.
 */
export function SessionUsageReadout({
  sessionId,
  tokens,
  cost,
}: {
  sessionId?: string;
  tokens?: number;
  cost?: number;
}) {
  if (!sessionId) return <Readout cost={cost} tokens={tokens} />;
  return <SessionUsageHover cost={cost} sessionId={sessionId} tokens={tokens} />;
}

function SessionUsageHover({
  sessionId,
  tokens,
  cost,
}: {
  sessionId: string;
  tokens?: number;
  cost?: number;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const fleet = useQuery({
    queryKey: queryKeys.key('fleet', settings.endpoint, sessionId),
    queryFn: ({ signal }) => repository.fleet({ sessionId }, signal),
    refetchInterval: 60_000,
  });
  const account = fleet.data?.session
    ? fleet.data.accounts.find((row) => row.id === fleet.data?.session?.model.provider_id)
    : undefined;
  const busiest = busiestWindow(account?.usage);
  const marker = busiest && busiest.used_percent >= 80 ? busiest : undefined;
  const spend = Object.entries(fleet.data?.session?.spend_by_model ?? {});
  return (
    <HoverCard closeDelay={100} openDelay={250}>
      <HoverCardTrigger asChild>
        <button
          aria-label="Usage for this conversation's account"
          className="ml-auto hidden cursor-default items-center sm:inline-flex"
          type="button"
        >
          <Readout cost={cost} marker={marker} tokens={tokens} />
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="w-80 font-sans" side="top">
        {account ? (
          <div className="grid gap-3">
            <div>
              <p className="text-sm font-medium">{account.label}</p>
              <p className="text-xs text-muted-foreground">{fleet.data?.session?.model.model_id}</p>
            </div>
            <UsageSummary
              missingReason={account.usage_missing_reason}
              mode="used"
              snapshot={account.usage}
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {fleet.isPending
              ? 'Reading usage…'
              : 'The account this conversation runs on is not connected.'}
          </p>
        )}
        {spend.length ? (
          <div className="mt-3 grid gap-1 border-t pt-3">
            <p className="text-xs font-medium">Including delegated work</p>
            {spend.map(([ref, row]) => (
              <div className="flex justify-between gap-3 text-xs" key={ref}>
                <span className="truncate">{ref.split('/').slice(1).join('/')}</span>
                <SpendSummary className="shrink-0 text-right" spend={row} />
              </div>
            ))}
          </div>
        ) : null}
        <Link
          className="mt-3 inline-block text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          to="/settings/usage"
        >
          Usage settings
        </Link>
      </HoverCardContent>
    </HoverCard>
  );
}
