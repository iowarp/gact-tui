import { useState, type ReactNode } from 'react';
import type { SearchSource } from '@clio/core/v3';
import { ArrowDownIcon, ArrowUpIcon, GripVerticalIcon } from 'lucide-react';
import { SortableItem, SortableItemHandle } from '@/components/reui/sortable';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  searchSourceAllowance,
  searchSourceMode,
  searchSourceQueue,
  searchSourceUsage,
  type SearchSourceState,
} from '@/lib/search-source-status';
import { searchSourceText } from '@/lib/search-source-text';
import { vocab } from '@/lib/brand-vocabulary';
import { cn } from '@/lib/utils';
import { IconButton } from './primitives/icon-button';
import { StatusIndicator } from './primitives/status-indicator';
import { ph, t } from '@lingui/core/macro';

/** How a web row can move: dragged by its handle, or one place with Move up / Move down. */
export interface SearchSourceOrdering {
  first: boolean;
  last: boolean;
  onMove: (step: -1 | 1) => void;
}

// Narrow, a long localized label ("Προσθήκη κλειδιού") wraps inside its button rather than past the card.
const action =
  'h-7 px-2 text-xs max-sm:h-auto max-sm:min-h-7 max-sm:max-w-full max-sm:whitespace-normal';

/**
 * One search source: its name, what it is, its state in words, whether it runs on its
 * free use or the person's key, today's use, and its controls. Web rows carry a drag
 * handle and Move up / Move down; scholarly rows are searched together and never move.
 */
export function SearchSourceRow({
  source,
  state,
  ordering,
  busy,
  onToggle,
  onAddKey,
  onRemoveKey,
  onPaidChange,
  children,
}: {
  source: SearchSource;
  state: SearchSourceState;
  /** Present for a web source the person can reorder. */
  ordering?: SearchSourceOrdering;
  busy: boolean;
  onToggle: (enabled: boolean) => void;
  onAddKey?: () => void;
  onRemoveKey: () => void;
  /** Mark the saved key as a paid plan (shown while the source has a key). */
  onPaidChange?: (paid: boolean) => void;
  /** More under the row (the OpenAlex key request). */
  children?: ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);
  const usage = searchSourceUsage(source);
  const allowance = searchSourceAllowance(source);
  const queue = searchSourceQueue(source);
  const paidId = `search-paid-${source.id}`;
  // "Needs your key" is already the status; the free-use line would only repeat it.
  const freeUseText = searchSourceText(source.free_use);
  const freeUse = freeUseText && freeUseText !== state.label ? freeUseText : '';
  const body = (
    <>
      {ordering ? (
        <div className="flex flex-col items-center gap-0.5 pt-0.5">
          <SortableItemHandle asChild>
            <Button
              aria-label={t`Drag to reorder ${ph({ source: source.name })}`}
              size="icon-sm"
              variant="ghost"
            >
              <GripVerticalIcon />
            </Button>
          </SortableItemHandle>
        </div>
      ) : null}
      <div className={cn('min-w-0 break-words', !source.enabled && 'text-muted-foreground')}>
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="max-w-full min-w-0 text-[0.8125rem] font-medium">{source.name}</span>
          <span className="text-xs text-muted-foreground">{searchSourceMode(source)}</span>
        </div>
        {source.description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {searchSourceText(source.description)}
          </p>
        ) : null}
        {freeUse ? <p className="mt-0.5 text-xs text-faint">{t`Free use: ${freeUse}`}</p> : null}
        {allowance ? <p className="mt-0.5 text-xs text-faint">{allowance}</p> : null}
        {usage ? <p className="mt-0.5 text-xs text-faint">{usage}</p> : null}
        {queue ? <p className="mt-0.5 text-xs text-faint">{queue}</p> : null}
        {source.has_key && onPaidChange ? (
          <div className="mt-1.5 flex items-center gap-2">
            <Checkbox
              checked={source.paid}
              disabled={busy}
              id={paidId}
              onCheckedChange={(checked) => onPaidChange(checked === true)}
            />
            <Label className="text-xs font-normal text-muted-foreground" htmlFor={paidId}>
              {t`Paid plan: ${ph({ agent: vocab.agent })} sets no free allowance and runs more requests at once`}
            </Label>
          </div>
        ) : null}
        {children}
      </div>
      <div className="flex flex-col items-end gap-1.5 max-sm:col-span-full max-sm:min-w-0 max-sm:flex-row max-sm:flex-wrap max-sm:items-center max-sm:justify-between">
        <StatusIndicator
          className="max-sm:max-w-full max-sm:[&>span:last-child]:break-words max-sm:[&>span:last-child]:whitespace-normal"
          label={state.label}
          tone={state.tone}
        />
        {/* Narrow, the moves, key button and switch wrap onto more lines inside the card. */}
        <div className="flex items-center gap-1 max-sm:max-w-full max-sm:min-w-0 max-sm:flex-wrap max-sm:justify-end">
          {ordering ? (
            <>
              <IconButton
                disabled={busy || ordering.first}
                icon={<ArrowUpIcon />}
                label={t`Move ${ph({ source: source.name })} up`}
                onClick={() => ordering.onMove(-1)}
                size="sm"
              />
              <IconButton
                disabled={busy || ordering.last}
                icon={<ArrowDownIcon />}
                label={t`Move ${ph({ source: source.name })} down`}
                onClick={() => ordering.onMove(1)}
                size="sm"
              />
            </>
          ) : null}
          {confirming ? (
            <span className="flex items-center gap-1 text-xs max-sm:max-w-full max-sm:min-w-0 max-sm:flex-wrap">
              <span className="min-w-0 text-muted-foreground">{t`Remove the key?`}</span>
              {/* Keep and Remove wrap together, so neither answer sits alone on a line; a
                  line too narrow for both stacks the pair instead of overflowing the card. */}
              <span className="flex max-w-full min-w-0 flex-wrap items-center gap-1">
                <Button
                  className={action}
                  onClick={() => setConfirming(false)}
                  size="sm"
                  variant="ghost"
                >
                  {t({ message: 'Keep', context: 'verb: keep the saved key' })}
                </Button>
                <Button
                  className={action}
                  disabled={busy}
                  onClick={() => {
                    setConfirming(false);
                    onRemoveKey();
                  }}
                  size="sm"
                  variant="outline"
                >
                  {t({ message: 'Remove', context: 'verb: remove the saved key' })}
                </Button>
              </span>
            </span>
          ) : source.has_key ? (
            <Button
              aria-label={t`Remove your ${ph({ source: source.name })} key`}
              className={action}
              disabled={busy}
              onClick={() => setConfirming(true)}
              size="sm"
              variant="ghost"
            >
              {t`Remove key`}
            </Button>
          ) : onAddKey ? (
            <Button
              aria-label={t`Add your ${ph({ source: source.name })} key`}
              className={action}
              disabled={busy}
              onClick={onAddKey}
              size="sm"
              variant="outline"
            >
              {t`Add key`}
            </Button>
          ) : null}
          <Switch
            aria-label={t`Use ${ph({ source: source.name })}`}
            checked={source.enabled}
            className="ml-1"
            disabled={busy}
            onCheckedChange={onToggle}
          />
        </div>
      </div>
    </>
  );
  const layout = cn(
    'grid items-start gap-x-3 gap-y-2 border-b border-border/70 py-2.5',
    ordering
      ? 'grid-cols-[auto_minmax(0,1fr)_auto] max-sm:grid-cols-[auto_minmax(0,1fr)]'
      : 'grid-cols-[minmax(0,1fr)_auto] max-sm:grid-cols-1',
  );
  return ordering ? (
    <SortableItem
      aria-label={source.name}
      className={layout}
      data-source={source.id}
      role="listitem"
      tabIndex={-1}
      value={source.id}
    >
      {body}
    </SortableItem>
  ) : (
    <div aria-label={source.name} className={layout} data-source={source.id} role="listitem">
      {body}
    </div>
  );
}
