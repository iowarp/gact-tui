import type { OfferList, OfferListEntry } from '@clio/core/v3';
import { offerListChoice } from '@clio/core/v3';
import { BoxesIcon, LayersIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useSaveOfferList } from '@/hooks/use-offer-list';
import { vocab } from '@/lib/brand-vocabulary';
import { cn } from '@/lib/utils';
import { ConnectorLogo } from './connector-need-rows';
import { DialogFrame } from './primitives/dialog-frame';
import { StateView } from './primitives/state-view';
import { Tag } from './primitives/tag';
import { ph, t } from '@lingui/core/macro';

/** Above this many entries the list gets a search field. */
const SEARCH_FROM = 12;

function defaultTicks(list: OfferList): Set<string> {
  return new Set(list.entries.filter((entry) => entry.default_listed).map((entry) => entry.key));
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>) {
  return a.size === b.size && [...a].every((key) => b.has(key));
}

function EntryIcon({ entry }: { entry: OfferListEntry }) {
  if (entry.kind === 'connector')
    return <ConnectorLogo className="size-5 text-[9px]" connector={entry} />;
  return (
    <span
      aria-hidden="true"
      className="grid size-5 shrink-0 place-items-center text-muted-foreground [&_svg]:size-4"
    >
      <LayersIcon />
    </span>
  );
}

function EntryRow({
  entry,
  checked,
  cap,
  onToggle,
}: {
  entry: OfferListEntry;
  checked: boolean;
  cap: number;
  onToggle: (checked: boolean) => void;
}) {
  const id = `offer-list-${entry.key}`;
  const name = entry.name;
  return (
    <li
      className="flex min-w-0 items-start gap-2.5 border-b border-border/60 py-2 last:border-b-0"
      data-slot="offer-list-entry"
      data-key={entry.key}
    >
      <Checkbox
        aria-label={t`Bring in ${name}`}
        checked={checked}
        className="mt-0.5"
        id={id}
        onCheckedChange={(value) => onToggle(value === true)}
      />
      <EntryIcon entry={entry} />
      <label className="grid min-w-0 flex-1 cursor-pointer gap-0.5" htmlFor={id}>
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="min-w-0 font-medium break-words">{name}</span>
          <Tag tone={entry.kind === 'connector' ? 'info' : 'neutral'} width="auto">
            {entry.kind === 'connector' ? t`Connector` : t`Plugin`}
          </Tag>
          {entry.default_listed ? (
            <Tag
              title={t`One of the first ${ph({ cap })}, brought in unless you untick it`}
              tone="chip"
              width="auto"
            >
              {t`Default`}
            </Tag>
          ) : null}
        </span>
        {entry.summary ? (
          <span className="line-clamp-2 text-meta text-muted-foreground">{entry.summary}</span>
        ) : null}
      </label>
    </li>
  );
}

/**
 * Which plugins and connectors the agent is told it can offer (clio-agent OL-D1): every
 * candidate with a tick box, the default ones marked, a count, search and Reset to
 * default. Saving applies from the agent's next turn.
 */
export function OfferListDialog({
  list,
  open,
  onOpenChange,
}: {
  list: OfferList;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [ticked, setTicked] = useState(
    () => new Set(list.entries.filter((entry) => entry.listed).map((entry) => entry.key)),
  );
  const [search, setSearch] = useState('');
  const save = useSaveOfferList();
  const defaults = useMemo(() => defaultTicks(list), [list]);
  const term = search.trim().toLowerCase();
  const shown = term
    ? list.entries.filter((entry) =>
        `${entry.name} ${entry.summary} ${entry.marketplace ?? ''}`.toLowerCase().includes(term),
      )
    : list.entries;
  const toggle = (key: string, on: boolean) =>
    setTicked((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  const count = ticked.size;
  const total = list.entries.length;
  const { agent } = vocab;
  const atDefault = sameSet(ticked, defaults);
  return (
    <DialogFrame
      bodyInset="edge"
      confirm={{
        label: save.isPending ? t`Saving…` : t`Save`,
        disabled: save.isPending,
        onConfirm: () =>
          save.mutate(offerListChoice(list.entries, ticked), {
            onSuccess: () => {
              toast.success(t`Saved. ${agent} uses this list from its next turn.`);
              onOpenChange(false);
            },
            onError: (error: Error) =>
              toast.error(t`The list wasn’t saved.`, { description: error.message }),
          }),
      }}
      description={t`${agent} is told about the ticked plugins and connectors a conversation does not have, so it can offer one when a request needs it. Changes apply from its next turn.`}
      footerStart={
        <Button
          data-footer-action=""
          disabled={atDefault || save.isPending}
          onClick={() => setTicked(new Set(defaults))}
          size="sm"
          variant="ghost"
        >
          {t`Reset to default`}
        </Button>
      }
      icon={<BoxesIcon />}
      onOpenChange={onOpenChange}
      open={open}
      title={t`Plugins ${agent} can offer`}
    >
      <div className="grid min-w-0 gap-2 pb-1">
        <p aria-live="polite" className="text-menu font-medium" data-slot="offer-list-count">
          {t`${ph({ count })} of ${ph({ total })} brought in`}
          <span className="font-normal text-muted-foreground">
            {' '}
            {t`(default: the first ${ph({ cap: list.cap })})`}
          </span>
        </p>
        {total > SEARCH_FROM ? (
          <Input
            aria-label={t`Search plugins and connectors`}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t`Search plugins and connectors`}
            type="search"
            value={search}
          />
        ) : null}
        <ul
          aria-label={t`Plugins and connectors`}
          className={cn('max-h-[min(55dvh,30rem)] min-w-0 overflow-y-auto pr-1')}
        >
          {shown.map((entry) => (
            <EntryRow
              cap={list.cap}
              checked={ticked.has(entry.key)}
              entry={entry}
              key={entry.key}
              onToggle={(on) => toggle(entry.key, on)}
            />
          ))}
        </ul>
        {!shown.length ? (
          <StateView
            kind="empty"
            size="row"
            title={term ? t`Nothing matches “${search}”.` : t`Nothing to offer yet.`}
          />
        ) : null}
      </div>
    </DialogFrame>
  );
}
