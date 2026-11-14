import type { Connector } from '@clio/core/v3';
import { ArrowRightIcon, CheckIcon } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { useConnectorActions, useConnectorChanges } from '@/hooks/use-connectors';
import { groupCatalogEntries } from '@/lib/connector-groups';
import {
  cardRequiresWords,
  cardSourceWords,
  DISCOVER_FIRST,
  discoverCardAction,
} from '@/lib/discover-card';
import type { ExtensionEntry } from '@/lib/extension-library-entries';
import { AddIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import { ConnectorLogo } from './connector-need-rows';
import { MetaLine } from './extension-parts';
import { IconButton } from './primitives/icon-button';
import { RingSpinner } from './primitives/ring-spinner';
import { StatusIndicator } from './primitives/status-indicator';
import { ph, t } from '@lingui/core/macro';

export type CatalogEntry = Extract<ExtensionEntry, { kind: 'connector' }>;

/**
 * Discover's catalog as cards (clio-agent DC-D1): the domain groups as sections with
 * their counts, two columns where the list is wide and one on a phone, a long group's
 * first four cards and "Show all (n)". Each card carries its one action in sight: a "+"
 * named Enable while it is off, its progress in words, and a check with "Enabled" once
 * it is on. The card body opens the detail pane (settings, Turn off).
 */
export function DiscoverCatalog({
  entries,
  label,
  showAll = false,
  supported,
  shippedMarketplace,
  isOpen,
  onOpen,
}: {
  entries: readonly CatalogEntry[];
  /** Names the whole catalog for assistive technology. */
  label: string;
  /** Every card of every group (a search is on): no "Show all". */
  showAll?: boolean;
  supported: boolean | undefined;
  /** The shipped marketplace's name: its plugins read as the product's catalog. */
  shippedMarketplace?: string;
  isOpen: (connector: Connector) => boolean;
  onOpen: (connector: Connector) => void;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  return (
    <div aria-label={label} data-slot="discover-catalog" role="group">
      {groupCatalogEntries(entries).map((group) => {
        const long = !showAll && group.entries.length > DISCOVER_FIRST;
        const open = !long || expanded.has(group.key);
        return (
          <DiscoverGroup
            count={group.entries.length}
            groupKey={group.key}
            key={group.key}
            label={group.label}
            long={long}
            onToggle={() => toggle(group.key)}
            open={open}
          >
            {(open ? group.entries : group.entries.slice(0, DISCOVER_FIRST)).map((entry) => (
              <li className="min-w-0" key={entry.key}>
                <DiscoverCard
                  entry={entry}
                  onOpen={() => onOpen(entry.connector)}
                  selected={isOpen(entry.connector)}
                  shippedMarketplace={shippedMarketplace}
                  supported={supported}
                />
              </li>
            ))}
          </DiscoverGroup>
        );
      })}
    </div>
  );
}

function DiscoverGroup({
  groupKey,
  label,
  count,
  long,
  open,
  onToggle,
  children,
}: {
  groupKey: string;
  label: string;
  count: number;
  long: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const heading = useId();
  return (
    <section aria-labelledby={heading} data-group={groupKey} data-slot="discover-group">
      <div className="mt-5 mb-2 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="min-w-0 text-ui font-medium break-words" id={heading}>
          {t`${ph({ group: label })} (${ph({ count })})`}
        </h3>
        {long ? (
          <button
            aria-expanded={open}
            className="ml-auto inline-flex items-center gap-1 rounded-sm text-xs text-link hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            data-slot="discover-show-all"
            onClick={onToggle}
            type="button"
          >
            {open ? t`Show fewer` : t`Show all (${ph({ count })})`}
            {open ? null : <ArrowRightIcon aria-hidden="true" className="size-3.5" />}
          </button>
        ) : null}
      </div>
      <ul
        aria-label={label}
        className="grid grid-cols-1 gap-2.5 @xl/ext:grid-cols-2"
        data-slot="discover-grid"
      >
        {children}
      </ul>
    </section>
  );
}

/** One catalog connector or plugin as a card, with its action in sight. */
export function DiscoverCard({
  entry,
  onOpen,
  selected = false,
  supported,
  shippedMarketplace,
}: {
  entry: CatalogEntry;
  onOpen: () => void;
  selected?: boolean;
  supported: boolean | undefined;
  shippedMarketplace?: string;
}) {
  const { connector, plugin } = entry;
  const actions = useConnectorActions();
  const change = useConnectorChanges().get(connector.id);
  const action = discoverCardAction(connector, change);
  const requires = cardRequiresWords(connector);
  const titleId = useId();
  return (
    <article
      aria-current={selected || undefined}
      aria-labelledby={titleId}
      className={cn(
        'relative flex h-full min-w-0 flex-col gap-1.5 rounded-lg border border-border bg-card p-3 text-card-foreground transition-colors hover:bg-hover',
        selected && 'border-primary ring-1 ring-primary',
      )}
      data-connector={connector.id}
      data-slot="discover-card"
      data-state={action.kind}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
          <ConnectorLogo className="size-6 text-[10px]" connector={connector} />
        </span>
        <div className="min-w-0 flex-1">
          {/* The name opens the pane; its hit area covers the whole card. */}
          <button
            className="block max-w-full text-left text-ui font-semibold break-words after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
            data-slot="discover-card-open"
            id={titleId}
            onClick={onOpen}
            type="button"
          >
            {entry.title}
          </button>
          <MetaLine className="text-xs text-muted-foreground" parts={entry.meta} wrap />
        </div>
        <div className="relative z-10 flex shrink-0 items-center">
          <CardAction
            action={action}
            name={entry.title}
            onEnable={() => actions.enable.mutate(connector.id)}
            onSetup={onOpen}
            supported={supported}
          />
        </div>
      </div>
      {entry.description ? (
        <p
          className="line-clamp-2 text-xs leading-4 text-muted-foreground"
          data-slot="discover-card-description"
          title={entry.description}
        >
          {entry.description}
        </p>
      ) : null}
      {action.kind === 'setup' ? (
        <p className="text-xs leading-4" data-slot="discover-card-needs">
          {action.needs}
        </p>
      ) : null}
      {requires ? (
        <p className="text-xs leading-4" data-slot="discover-card-requires">
          <span className="text-muted-foreground">{t`On this machine`}</span> {requires}
        </p>
      ) : null}
      <p className="mt-auto pt-0.5 text-label text-faint" data-slot="discover-card-source">
        {cardSourceWords(connector, plugin, shippedMarketplace)}
      </p>
    </article>
  );
}

function CardAction({
  action,
  name,
  onEnable,
  onSetup,
  supported,
}: {
  action: ReturnType<typeof discoverCardAction>;
  name: string;
  onEnable: () => void;
  onSetup: () => void;
  supported: boolean | undefined;
}) {
  if (action.kind === 'enable' || action.kind === 'setup')
    return (
      <IconButton
        {...(action.kind === 'setup'
          ? { 'aria-description': t`Opens the setup of ${ph({ name })}` }
          : {})}
        className="rounded-full border border-border bg-background text-foreground"
        data-slot="discover-card-enable"
        disabledReason={
          supported === true
            ? undefined
            : supported === false
              ? t`Enabling needs a newer agent service`
              : t`Checking the agent service…`
        }
        icon={<AddIcon />}
        label={t`Enable`}
        onClick={action.kind === 'setup' ? onSetup : onEnable}
      />
    );
  if (action.kind === 'busy')
    return (
      <span
        className="flex items-center gap-1.5 text-xs text-muted-foreground"
        data-slot="discover-card-progress"
        role="status"
      >
        <RingSpinner />
        {action.words}
      </span>
    );
  if (action.kind === 'enabled')
    return (
      <span className="flex items-center gap-1 text-xs font-medium" data-slot="discover-card-enabled">
        <CheckIcon aria-hidden="true" className="size-3.5 text-primary" />
        {t`Enabled`}
      </span>
    );
  return <StatusIndicator label={action.status.label} tone={action.status.tone} />;
}
