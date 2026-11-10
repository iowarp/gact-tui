import type { AccountUsageWindow, FleetAccount, UsageSnapshot } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { ChevronRightIcon, GaugeIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { useRepository } from '@/hooks/use-repository';
import {
  accountUsageWords,
  busiestWindow,
  observedAgo,
  resetsIn,
  spendLabel,
} from '@/lib/fleet-usage';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { useConnectionSettings } from '@/providers/connection-provider';
import { contextTokens } from './context-composition-model';
import { replyModelIcon } from './message-reply-facts';
import { KeyValueGrid, type KeyValueItem } from './primitives/key-value-grid';

/** A window this full shows in the rail without opening the card. */
const NEAR_LIMIT_PERCENT = 80;

const usedPercent = (window: AccountUsageWindow) =>
  Math.round(Math.min(100, Math.max(0, window.used_percent)));

function costText(cost?: number) {
  if (cost === undefined) return 'Not reported';
  return `$${cost < 0.01 && cost > 0 ? cost.toFixed(4) : cost.toFixed(2)}`;
}

/**
 * What the conversation has used so far, in the rail. The Account row opens a
 * hover card (also on focus, click or tap) with the account the conversation
 * runs on: its limit windows and resets, its balance, and what this
 * conversation and the work it delegated spent per model. A window at 80% or
 * more is named in the rail itself.
 */
export function SessionUsageReadout({
  sessionId,
  usage,
}: {
  sessionId?: string;
  usage?: UsageSnapshot;
}) {
  const sent = usage?.input_tokens ?? 0;
  const received = usage?.output_tokens ?? 0;
  const rows: Array<[string, string]> = [
    ['Used so far', `${contextTokens(sent + received)} tokens`],
    ['Sent and received', `${contextTokens(sent)} in, ${contextTokens(received)} out`],
    ['Cost', costText(usage?.cost_usd)],
  ];
  return (
    <div
      className="relative -mx-1 mt-1 rounded-md border-t px-1 pt-2 has-[[data-slot=usage-trigger]:focus-visible]:bg-hover has-[[data-slot=usage-trigger]:hover]:bg-hover"
      data-slot="conversation-usage"
    >
      <dl aria-label="Conversation usage" className="grid gap-0.5 text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="flex min-h-6 items-center justify-between gap-3">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="truncate text-right tabular-nums">{value}</dd>
          </div>
        ))}
        {sessionId ? <AccountUsageRow sessionId={sessionId} /> : null}
      </dl>
    </div>
  );
}

function AccountUsageRow({ sessionId }: { sessionId: string }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const fleet = useQuery({
    queryKey: queryKeys.key('fleet', settings.endpoint, sessionId),
    queryFn: ({ signal }) => repository.fleet({ sessionId }, signal),
    refetchInterval: 60_000,
  });
  const session = fleet.data?.session;
  const account = session
    ? fleet.data?.accounts.find((row) => row.id === session.model.provider_id)
    : undefined;
  const busiest = busiestWindow(account?.usage);
  const near = busiest && usedPercent(busiest) >= NEAR_LIMIT_PERCENT ? busiest : undefined;
  const summary = fleet.isPending
    ? 'Checking'
    : !account
      ? 'Not connected'
      : near
        ? `${near.name} ${usedPercent(near)}%, near limit`
        : accountUsageWords(account, 'used').label;

  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Opened from the keyboard, focus moves to the card's first control.
  const focusCard = useRef(false);
  // After Escape returns focus to the trigger, that focus must not reopen the card.
  const escaped = useRef(false);
  useEffect(() => {
    if (!open || !focusCard.current) return;
    focusCard.current = false;
    const frame = requestAnimationFrame(focusFirstControl);
    return () => cancelAnimationFrame(frame);
  }, [open]);
  function focusFirstControl() {
    const content = contentRef.current;
    (content?.querySelector<HTMLElement>('a[href], button') ?? content)?.focus();
  }
  const onOpenChange = (next: boolean) => {
    if (next && escaped.current) return;
    if (!next && contentRef.current?.contains(document.activeElement)) return;
    setOpen(next);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'ArrowDown') return;
    if (event.key === 'ArrowDown') event.preventDefault();
    escaped.current = false;
    focusCard.current = true;
    if (open) focusFirstControl();
    else setOpen(true);
  };

  return (
    <div className="flex min-h-6 items-center justify-between gap-3">
      <dt className="text-muted-foreground">Account</dt>
      <dd className="min-w-0">
        <HoverCard closeDelay={100} onOpenChange={onOpenChange} open={open} openDelay={250}>
          <HoverCardTrigger asChild>
            <button
              ref={triggerRef}
              aria-expanded={open}
              aria-label={`Account usage: ${summary}`}
              className={cn(
                'flex w-full min-w-0 cursor-default items-center justify-end gap-1.5 text-right tabular-nums outline-none after:absolute after:inset-0 after:rounded-md',
                near && 'text-warning-foreground',
              )}
              data-slot="usage-trigger"
              onBlur={() => {
                escaped.current = false;
              }}
              onClick={() => setOpen(true)}
              onKeyDown={onKeyDown}
              onPointerEnter={() => {
                escaped.current = false;
              }}
              type="button"
            >
              {near ? <TriangleAlertIcon aria-hidden="true" className="size-3.5 shrink-0" /> : null}
              <span className="truncate">{summary}</span>
              <ChevronRightIcon aria-hidden="true" className="size-3.5 shrink-0 text-faint" />
            </button>
          </HoverCardTrigger>
          <HoverCardContent
            ref={contentRef}
            align="end"
            aria-label="Usage for this conversation's account"
            className="w-[min(340px,calc(100vw-24px))] px-1 py-1.5 outline-none"
            collisionPadding={12}
            data-slot="session-usage-card"
            onBlur={(event) => {
              const next = event.relatedTarget as Node | null;
              if (next && (contentRef.current?.contains(next) || next === triggerRef.current))
                return;
              setOpen(false);
            }}
            onEscapeKeyDown={() => {
              escaped.current = true;
              triggerRef.current?.focus();
            }}
            role="group"
            side="bottom"
            tabIndex={-1}
          >
            <UsageCardBody
              account={account}
              modelId={session?.model.model_id}
              pending={fleet.isPending}
              providerId={session?.model.provider_id}
              spend={Object.entries(session?.spend_by_model ?? {})}
            />
          </HoverCardContent>
        </HoverCard>
      </dd>
    </div>
  );
}

function UsageCardBody({
  account,
  providerId,
  modelId,
  pending,
  spend,
}: {
  account?: FleetAccount;
  providerId?: string;
  modelId?: string;
  pending: boolean;
  spend: Array<[string, Parameters<typeof spendLabel>[0]]>;
}) {
  const setup: KeyValueItem[] = account
    ? [
        {
          label: 'Account',
          icon: providerId ? replyModelIcon(providerId) : undefined,
          value: account.label,
        },
        ...(modelId ? [{ label: 'Model', value: modelId }] : []),
        ...limitRows(account),
      ]
    : [
        {
          label: 'Account',
          value: pending ? 'Reading usage…' : 'Not connected',
          title: pending ? undefined : 'The account this conversation runs on is not connected.',
        },
      ];
  const delegated: KeyValueItem[] = spend.map(([ref, row]) => {
    const [provider, ...model] = ref.split('/');
    return {
      label: model.join('/') || ref,
      icon: provider ? replyModelIcon(provider) : undefined,
      value: spendLabel(row),
    };
  });
  return (
    <>
      <p className="px-2 pt-1 pb-1.5 text-[11px] text-muted-foreground">
        This conversation&rsquo;s account
      </p>
      <KeyValueGrid items={setup} variant="card" />
      {delegated.length ? (
        <>
          <div className="my-1 border-t border-border" role="separator" />
          <p className="px-2 pt-1 pb-1.5 text-[11px] text-muted-foreground">
            Spent here, including delegated work
          </p>
          <KeyValueGrid items={delegated} variant="card" />
        </>
      ) : null}
      <div className="my-1 border-t border-border" role="separator" />
      <Link
        className="flex h-[25px] items-center gap-2.5 rounded-[5px] px-2 text-[12px] outline-none hover:bg-hover focus-visible:bg-hover"
        to="/settings/usage"
      >
        <GaugeIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
        Usage settings
        <ChevronRightIcon aria-hidden="true" className="ml-auto size-3.5 text-faint" />
      </Link>
    </>
  );
}

/** One row per limit window, then the balance, or why there is no reading. */
function limitRows(account: FleetAccount): KeyValueItem[] {
  const snapshot = account.usage;
  if (!snapshot) {
    return [
      {
        label: 'Limits',
        value:
          account.usage_missing_reason === 'not_supported'
            ? 'Unavailable for this connection'
            : 'No reading',
      },
    ];
  }
  if (snapshot.state === 'unmetered') return [{ label: 'Limits', value: 'No usage limits' }];
  const rows: KeyValueItem[] = snapshot.windows.map((window) => {
    const used = usedPercent(window);
    const near = used >= NEAR_LIMIT_PERCENT;
    const text = [`${used}% used`, near ? 'near limit' : '', resetsIn(window.resets_at)]
      .filter(Boolean)
      .join(', ');
    return {
      label: window.name,
      title: text,
      value: near ? (
        <span className="inline-flex items-center gap-1.5 text-warning-foreground">
          <TriangleAlertIcon aria-hidden="true" className="size-3.5 shrink-0" />
          {text}
        </span>
      ) : (
        text
      ),
    };
  });
  const balance = snapshot.balance;
  if (balance && balance.remaining !== null) {
    const money = (value: number) =>
      balance.currency === 'USD'
        ? `$${value.toFixed(2)}`
        : `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${balance.currency}`;
    rows.push({
      label: 'Balance',
      value: `${money(balance.remaining)} left${balance.limit !== null ? ` of ${money(balance.limit)}` : ''}`,
    });
  }
  if (snapshot.read_failure)
    rows.push({ label: 'Last read', value: `Failed, ${observedAgo(snapshot.observed_at)}` });
  if (!rows.length) rows.push({ label: 'Limits', value: 'No windows reported' });
  return rows;
}
