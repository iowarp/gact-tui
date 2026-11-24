import { createComponentImplementation } from '@a2ui/react/v0_9';
import { CommonSchemas } from '@a2ui/web_core/v0_9';
import { SearchIcon } from 'lucide-react';
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { fireRawAction, type RawActionContext } from '@/lib/a2ui/raw-action';
import { cn } from '@/lib/utils';
import { t } from '@lingui/core/macro';

/*
 * `clio.picker.v1`: one choice from a server's list, as a bordered list of
 * rows (radio, title, subtitle, chips, meta) or a select. A pick writes the
 * bound value, then sends `onPick` with `{value}` in its context.
 */

const pickerItem = z
  .object({
    value: z.string().min(1),
    title: z.string().min(1),
    subtitle: z.string().optional(),
    chips: z.array(z.string().min(1)).max(8).optional(),
    meta: z.string().optional(),
    group: z.string().optional(),
  })
  .strict();

const pickerSchema = z
  .object({
    label: z.string().min(1),
    items: z.array(pickerItem).max(200),
    value: CommonSchemas.DataBinding,
    search: z.string().optional(),
    hint: z.string().optional(),
    error: z.string().optional(),
    limit: z.number().int().min(1).optional(),
    variant: z.enum(['list', 'select']).optional(),
    empty: z.string().optional(),
    onPick: CommonSchemas.Action.optional(),
    accessibility: CommonSchemas.AccessibilityAttributes.optional(),
    weight: z.number().optional(),
  })
  .strict();

/** The value binding arrives resolved: the picked item's value, if any. */
type Props = Omit<z.infer<typeof pickerSchema>, 'value'> & { value?: unknown };
type Item = z.infer<typeof pickerItem>;

function matches(item: Item, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [item.title, item.subtitle, item.value, item.meta, item.group, ...(item.chips ?? [])].some(
    (text) => text?.toLocaleLowerCase().includes(needle),
  );
}

/** Items in their groups' first-seen order; ungrouped items keep their place. */
function grouped(items: readonly Item[]): { group?: string; items: Item[] }[] {
  const out: { group?: string; items: Item[] }[] = [];
  for (const item of items) {
    const last = out.at(-1);
    const existing = item.group ? out.find((entry) => entry.group === item.group) : undefined;
    if (existing) existing.items.push(item);
    else if (last && !last.group && !item.group) last.items.push(item);
    else out.push({ group: item.group, items: [item] });
  }
  return out;
}

function PickerRow({
  item,
  selected,
  focusable,
  onPick,
  onKeyDown,
}: {
  item: Item;
  selected: boolean;
  focusable: boolean;
  onPick: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      aria-checked={selected}
      className={cn(
        'flex min-h-[38px] min-w-0 cursor-pointer items-center gap-2.5 border-t border-border px-2.5 py-1.5 text-menu outline-none first:border-t-0 hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset',
        selected && 'bg-accent shadow-[inset_2px_0_0_var(--primary)] hover:bg-accent',
      )}
      data-slot="picker-row"
      data-value={item.value}
      onClick={onPick}
      onKeyDown={onKeyDown}
      role="radio"
      tabIndex={focusable ? 0 : -1}
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-3.5 shrink-0 rounded-full border-[1.5px] border-input',
          selected &&
            'border-primary shadow-[inset_0_0_0_3px_var(--accent),inset_0_0_0_7px_var(--primary)]',
        )}
      />
      <span className="grid min-w-0 flex-1">
        <span className="truncate font-medium text-foreground">{item.title}</span>
        {item.subtitle ? (
          <span
            className={cn(
              'truncate text-label text-muted-foreground',
              selected && 'text-accent-foreground',
            )}
          >
            {item.subtitle}
          </span>
        ) : null}
      </span>
      {item.chips?.length ? (
        <span className="flex shrink-0 flex-wrap justify-end gap-1">
          {item.chips.map((chip) => (
            <span
              className={cn(
                'inline-flex h-[18px] items-center rounded-[10px] border border-border px-[7px] text-[0.6875rem] whitespace-nowrap text-muted-foreground',
                selected && 'border-primary/50 text-accent-foreground',
              )}
              key={chip}
            >
              {chip}
            </span>
          ))}
        </span>
      ) : null}
      {item.meta ? (
        <span className="shrink-0 text-label whitespace-nowrap text-muted-foreground">
          {item.meta}
        </span>
      ) : null}
    </div>
  );
}

function PickerList({
  props,
  labelId,
  pick,
}: {
  props: Props;
  labelId: string;
  pick: (value: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const found = useMemo(
    () => props.items.filter((item) => matches(item, query)),
    [props.items, query],
  );
  // The limit trims only the unsearched list; a search always shows every match.
  const limited = !query.trim() && !expanded && props.limit && found.length > props.limit;
  const shown = limited ? found.slice(0, props.limit) : found;
  const hidden = limited ? found.slice(props.limit) : [];
  const focusValue = shown.some((item) => item.value === props.value)
    ? props.value
    : shown[0]?.value;

  const focusRow = (index: number) => {
    const rows = listRef.current?.querySelectorAll<HTMLElement>('[data-slot=picker-row]');
    if (!rows?.length) return;
    rows[Math.max(0, Math.min(rows.length - 1, index))]?.focus();
  };
  const rowKeys = (index: number, item: Item) => (event: KeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };
    if (event.key in step) {
      event.preventDefault();
      focusRow(index + step[event.key]!);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      focusRow(event.key === 'Home' ? 0 : shown.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      pick(item.value);
    }
  };
  const searchKeys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && shown[0]) {
      event.preventDefault();
      pick(shown[0].value);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusRow(0);
    }
  };

  const sections = grouped(shown);
  const order = new Map(sections.flatMap((section) => section.items).map((item, i) => [item, i]));
  return (
    <div className="grid min-w-0 gap-1.5">
      {props.search ? (
        <div className="relative">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label={props.search}
            className="pl-8"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={searchKeys}
            placeholder={props.search}
            type="search"
            value={query}
          />
        </div>
      ) : null}
      {shown.length ? (
        <div
          aria-invalid={props.error ? true : undefined}
          aria-labelledby={labelId}
          className={cn(
            'max-h-[19rem] min-w-0 overflow-y-auto rounded-lg border border-border bg-background',
            props.error && 'border-destructive',
          )}
          data-slot="picker-list"
          ref={listRef}
          role="radiogroup"
        >
          {sections.map((section, sectionIndex) => (
            <div
              aria-label={section.group}
              className="border-t border-border first:border-t-0 [&>[data-slot=picker-row]:first-of-type]:border-t-0"
              key={section.group ?? `-${sectionIndex}`}
              role={section.group ? 'group' : 'presentation'}
            >
              {section.group ? (
                <div
                  aria-hidden="true"
                  className="flex h-[26px] items-center bg-muted px-2.5 text-label font-semibold text-muted-foreground"
                >
                  {section.group}
                </div>
              ) : null}
              {section.items.map((item) => (
                <PickerRow
                  focusable={item.value === focusValue}
                  item={item}
                  key={item.value}
                  onKeyDown={rowKeys(order.get(item) ?? 0, item)}
                  onPick={() => pick(item.value)}
                  selected={item.value === props.value}
                />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <p
          className="rounded-lg border border-dashed border-border px-2.5 py-3 text-center text-menu text-muted-foreground"
          data-slot="picker-empty"
        >
          {query.trim()
            ? t`Nothing matches “${query.trim()}”.`
            : (props.empty ?? t`Nothing to choose from yet.`)}
        </p>
      )}
      {hidden.length ? (
        <button
          className="w-fit max-w-full truncate text-left text-label text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:underline focus-visible:outline-none"
          data-slot="picker-more"
          onClick={() => setExpanded(true)}
          type="button"
        >
          {t`${hidden.length} more: ${hidden.map((item) => item.title).join(', ')}`}
        </button>
      ) : null}
    </div>
  );
}

function PickerSelect({
  props,
  labelId,
  pick,
}: {
  props: Props;
  labelId: string;
  pick: (value: string) => void;
}) {
  const known = props.items.some((item) => item.value === props.value);
  return (
    <Select
      disabled={!props.items.length}
      onValueChange={pick}
      value={known ? String(props.value) : undefined}
    >
      <SelectTrigger
        aria-invalid={props.error ? true : undefined}
        aria-labelledby={labelId}
        className="w-full min-w-0"
      >
        <SelectValue
          placeholder={
            props.items.length ? props.label : (props.empty ?? t`Nothing to choose from yet.`)
          }
        />
      </SelectTrigger>
      <SelectContent>
        {grouped(props.items).map((section, sectionIndex) => (
          <SelectGroup key={section.group ?? `-${sectionIndex}`}>
            {section.group ? <SelectLabel>{section.group}</SelectLabel> : null}
            {section.items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.title}
                {item.meta ? <span className="ml-2 text-muted-foreground">{item.meta}</span> : null}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ClioPicker({
  props,
  context,
}: {
  props: Props & { setValue?: (value: string) => void };
  context: RawActionContext & { componentModel: { properties: Record<string, unknown> } };
}) {
  const labelId = useId();
  const onPick = (context.componentModel.properties as { onPick?: unknown }).onPick;
  const pick = (value: string) => {
    props.setValue?.(value);
    if (onPick) void fireRawAction(context, onPick, { value });
  };
  return (
    <div className="grid min-w-0 gap-1.5" data-slot="picker">
      <span className="text-menu font-medium text-foreground" id={labelId}>
        {props.label}
      </span>
      {props.variant === 'select' ? (
        <PickerSelect labelId={labelId} pick={pick} props={props} />
      ) : (
        <PickerList labelId={labelId} pick={pick} props={props} />
      )}
      {props.error ? (
        <p className="text-label text-pretty text-destructive" role="alert">
          {props.error}
        </p>
      ) : props.hint ? (
        <p className="text-label text-pretty text-muted-foreground">{props.hint}</p>
      ) : null}
    </div>
  );
}

// oxlint-disable-next-line react/only-export-components
export const ClioPickerCatalogComponent = createComponentImplementation(
  { name: 'clio.picker.v1', schema: pickerSchema },
  ({ props, context }) => (
    <ClioPicker
      context={context as unknown as Parameters<typeof ClioPicker>[0]['context']}
      props={props as unknown as Parameters<typeof ClioPicker>[0]['props']}
    />
  ),
);
