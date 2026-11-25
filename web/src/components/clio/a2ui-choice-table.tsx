import { createComponentImplementation } from '@a2ui/react/v0_9';
import { CommonSchemas } from '@a2ui/web_core/v0_9';
import { CircleSmallIcon, LockIcon, type LucideIcon } from 'lucide-react';
import {
  createElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { kernelIconGlyph } from '@/lib/a2ui/kernel-icon-map';
import { fireRawAction, resolveRawValue } from '@/lib/a2ui/raw-action';
import { AddIcon, AdjustIcon, HelpIcon, MoreIcon } from '@/lib/icon-vocabulary';
import { moveAcrossCells } from '@/lib/settings-row-keys';
import { cn } from '@/lib/utils';
import { a2uiAccessibilityProps } from './a2ui-accessibility';
import { StatusIndicator, type StatusTone } from './primitives/status-indicator';
import {
  ChoicePicker,
  SummaryPicker,
  type PickerAction,
  type PickerOption,
} from './settings-tools-picker';
import { ValueSummary } from './settings-tools-value-summary';
import { ph, t } from '@lingui/core/macro';

/*
 * `clio.choice-table.v1`: rows of things a person configures, each with a few
 * choices, drawn the way Settings › Tools draws its tools. An optional
 * defaults row sets what new rows start with; each row's picker cells open a
 * list of explained choices (only those the row offers, when it names them);
 * a row's ⋯ menu holds its actions. Column titles show even with no rows.
 * Narrower than its
 * columns need, every row folds to one summary row whose › opens all its
 * choices and actions. Generic: any server's surface can send one.
 */

const tone = z.enum(['neutral', 'positive', 'warning', 'negative']);
const option = z
  .object({
    value: z.string().min(1),
    label: z.string().min(1),
    description: z.string().optional(),
    icon: z.string().optional(),
    tone: tone.optional(),
  })
  .strict();
const column = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    help: z.string().optional(),
    editable: z.boolean().optional(),
    options: z.array(option).min(1).max(24),
  })
  .strict();
const extraContext = z.record(z.string(), z.unknown());
const menuItem = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    destructive: z.boolean().optional(),
    action: CommonSchemas.Action,
  })
  .strict();
const row = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    subtitle: z.string().optional(),
    caption: z.string().optional(),
    icon: z.string().optional(),
    values: z.record(z.string(), z.string()),
    inherited: z.array(z.string()).optional(),
    error: z.string().optional(),
    context: extraContext.optional(),
    menu: z.array(menuItem).max(8).optional(),
    options: z.record(z.string(), z.array(z.string().min(1))).optional(),
  })
  .strict();

const choiceTableSchema = z
  .object({
    label: z.string().min(1),
    columns: z.array(column).min(1).max(6),
    rows: z.union([z.array(row).max(500), CommonSchemas.DataBinding]),
    defaults: z
      .object({
        title: z.string().min(1),
        values: z.record(z.string(), z.string()),
        context: extraContext.optional(),
      })
      .strict()
      .optional(),
    onChoose: CommonSchemas.Action.optional(),
    rowMenu: z.array(menuItem).max(8).optional(),
    add: z
      .object({ label: z.string().min(1), action: CommonSchemas.Action })
      .strict()
      .optional(),
    empty: z.string().optional(),
    accessibility: CommonSchemas.AccessibilityAttributes.optional(),
    weight: z.number().optional(),
  })
  .strict();

/** Rows arrive inline (bound by the binder) or as whatever the data model holds at their path. */
type Props = Omit<z.infer<typeof choiceTableSchema>, 'rows'> & { rows: unknown };
type Column = z.infer<typeof column>;
type Option = z.infer<typeof option>;
type Row = z.infer<typeof row>;
type Tone = z.infer<typeof tone>;

/** What a component's render gets to dispatch with: the raw action, resolved here. */
interface TableContext {
  componentModel: { properties: Record<string, unknown> };
  dataContext: { resolveDynamicValue(value: unknown): unknown };
  dispatchAction(action: unknown): Promise<unknown> | void;
}

/** A pick shows at once and stays until the server sends the table again, or this long. */
const PICK_HOLD_MS = 10_000;
/** Each choice cell's width, and the room the name needs beside them, in rem. */
const CELL_REM = 9.5;
const NAME_REM = 12;

const TONE: Record<Tone, StatusTone> = {
  neutral: 'idle',
  positive: 'success',
  warning: 'warning',
  negative: 'error',
};
const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-muted-foreground',
  positive: 'text-primary',
  warning: 'text-warning',
  negative: 'text-destructive',
};

function glyph(name: string | undefined, fallback: LucideIcon = CircleSmallIcon): LucideIcon {
  return (name && kernelIconGlyph(name)) || fallback;
}

/** A server-named glyph, or nothing when the name isn't one CLIO draws. */
function namedGlyph(name: string | undefined, className: string): ReactNode {
  const icon = name ? kernelIconGlyph(name) : undefined;
  return icon ? createElement(icon, { 'aria-hidden': true, className }) : null;
}

/** Sends a raw action with what was chosen merged into its event context. */
function fire(context: TableContext, raw: unknown, extra: Record<string, unknown>) {
  void fireRawAction(context, raw, extra);
}

/** A column's options, narrowed to what one row offers when it names them. */
function pickerOptions(column: Column, offered?: readonly string[]): PickerOption<string>[] {
  const options = offered
    ? column.options.filter((entry) => offered.includes(entry.value))
    : column.options;
  return options.map((entry) => ({
    value: entry.value,
    label: entry.label,
    description: entry.description ?? '',
    icon: glyph(entry.icon),
  }));
}

/** A cell's hover text, naming a default in words as well as by its D (#20). */
function cellTitle(label: string, isDefault: boolean, description?: string): string {
  const named = isDefault ? t`${ph({ label })} (default; choose a value to override it)` : label;
  return description ? `${named}: ${description}` : named;
}

/** A column title; its tooltip holds the column's help and, where rows inherit it, what D means. */
function ColumnTitle({ column, marksDefaults }: { column: Column; marksDefaults: boolean }) {
  const legend = marksDefaults ? t`D marks a default value. Choose a value to override it.` : '';
  if (!column.help && !legend) return <span className="min-w-0 truncate">{column.title}</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="min-w-0 cursor-help truncate underline decoration-faint decoration-dotted underline-offset-4 outline-none focus-visible:ring-1 focus-visible:ring-ring"
          tabIndex={0}
        >
          {column.title}
        </span>
      </TooltipTrigger>
      <TooltipContent className="grid max-w-80 gap-1">
        {column.help ? <span>{column.help}</span> : null}
        {legend ? <span>{legend}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}

/** A read-only column's value: its mark and word, never colour alone. */
function StatusCell({ value }: { value?: Option }) {
  if (!value) return <span className="text-meta text-muted-foreground">{t`Not set`}</span>;
  const icon = namedGlyph(value.icon, cn('size-3.5', TONE_TEXT[value.tone ?? 'neutral']));
  return (
    <span className="flex min-w-0" title={value.description || value.label}>
      <StatusIndicator
        icon={icon ?? undefined}
        label={value.label}
        mark="glyph"
        tone={TONE[value.tone ?? 'neutral']}
      />
    </span>
  );
}

interface Cells {
  columns: readonly Column[];
  values: Record<string, string>;
  inherited?: readonly string[];
  /** Columns some row inherits: there a value of the row's own shows in teal. */
  inheritable?: ReadonlySet<string>;
  /** Columns whose D sits beside the glyph, with its room kept in every row. */
  markRoom?: ReadonlySet<string>;
  /** Column id to the option values this row offers. */
  options?: Readonly<Record<string, readonly string[]>>;
  /** The thing the cells set, for their accessible names ("Delta"). */
  name: string;
  bulk?: boolean;
  onChoose: (column: string, value: string) => void;
}

function optionFor(column: Column, value: string | undefined): Option | undefined {
  return value === undefined ? undefined : column.options.find((entry) => entry.value === value);
}

/** One cell per column: a picker for a choice, the status word for a read-only value. */
function WideCells({
  columns,
  values,
  inherited,
  inheritable,
  markRoom,
  options,
  name,
  bulk,
  onChoose,
}: Cells) {
  return columns.map((column) => {
    const current = optionFor(column, values[column.id]);
    if (column.editable === false)
      return bulk ? (
        <span key={column.id} />
      ) : (
        <span className="flex min-w-0" data-column={column.id} key={column.id}>
          <StatusCell value={current} />
        </span>
      );
    const isDefault = inherited?.includes(column.id) ?? false;
    const label = current?.label ?? t`Not set`;
    return (
      <ChoicePicker
        bulk={bulk}
        chosen={ownValue(column, current, isDefault, inheritable)}
        className="w-full min-w-0"
        icon={current ? glyph(current.icon) : HelpIcon}
        isDefault={isDefault}
        key={column.id}
        label={label}
        markBeside={markRoom?.has(column.id) ?? false}
        name={t`${ph({ column: column.title })}: ${ph({ name })}`}
        onChoose={(value) => onChoose(column.id, value)}
        options={pickerOptions(column, options?.[column.id])}
        search={t`${ph({ column: column.title })} for ${ph({ name })}`}
        selected={current?.value}
        title={cellTitle(label, isDefault, current?.description)}
      />
    );
  });
}

/** The values a summary row's sub line shows in place of its cells. */
function FoldedValues({
  columns,
  values,
  inherited,
  inheritable,
}: Omit<Cells, 'name' | 'onChoose'>) {
  return columns.map((column) => {
    const current = optionFor(column, values[column.id]);
    if (column.editable === false)
      return current ? (
        <span className="shrink-0" key={column.id}>
          <StatusCell value={current} />
        </span>
      ) : null;
    const isDefault = inherited?.includes(column.id) ?? false;
    return (
      <ValueSummary
        chosen={ownValue(column, current, isDefault, inheritable)}
        icon={current ? glyph(current.icon) : HelpIcon}
        isDefault={isDefault}
        key={column.id}
        label={current?.label ?? t`Not set`}
        markBeside
        title={`${column.title}: ${cellTitle(current?.label ?? t`Not set`, isDefault)}`}
      />
    );
  });
}

/** A value the row set itself, in a column others inherit: teal, as in Settings › Tools. */
function ownValue(
  column: Column,
  current: Option | undefined,
  isDefault: boolean,
  inheritable: ReadonlySet<string> | undefined,
): boolean {
  return Boolean(current && !isDefault && inheritable?.has(column.id));
}

function summaryGroups({ columns, values, options, onChoose }: Cells) {
  return columns
    .filter((column) => column.editable !== false)
    .map((column) => ({
      heading: column.title,
      options: pickerOptions(column, options?.[column.id]),
      selected: values[column.id],
      onChoose: (value: string) => onChoose(column.id, value),
    }));
}

function RowMenu({ name, actions }: { name: string; actions: readonly MenuEntry[] }) {
  if (!actions.length) return <span />;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={t`More for ${ph({ name })}`}
          className="grid size-6 place-items-center rounded-md text-muted-foreground outline-none hover:bg-hover hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:bg-hover"
          title={t`More for ${ph({ name })}`}
          type="button"
        >
          <MoreIcon className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.id}
            onSelect={action.onSelect}
            variant={action.destructive ? 'destructive' : 'default'}
          >
            <span className="truncate" title={action.label}>
              {action.label}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface MenuEntry extends PickerAction {
  id: string;
  destructive?: boolean;
}

function TableRow({
  row,
  columns,
  wide,
  template,
  menu,
  inheritable,
  onChoose,
}: {
  row: Row;
  columns: readonly Column[];
  wide: boolean;
  template: string;
  menu: readonly MenuEntry[];
  inheritable: ReadonlySet<string>;
  onChoose: (column: string, value: string) => void;
}) {
  const cells: Cells = {
    columns,
    values: row.values,
    inherited: row.inherited,
    inheritable,
    markRoom: inheritable,
    options: row.options,
    name: row.title,
    onChoose,
  };
  return (
    <li
      className={cn(
        'group/row relative grid min-h-11 items-center gap-x-2.5 border-b border-border/70 py-1.5 hover:bg-hover/60 has-[[aria-expanded=true]]:bg-hover/60',
        row.error && 'bg-destructive/5',
      )}
      data-row={row.id}
      onKeyDown={moveAcrossCells}
      style={{ gridTemplateColumns: template }}
    >
      <span className="grid place-items-center text-muted-foreground">
        {namedGlyph(row.icon, 'size-4')}
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span className="truncate text-menu font-medium text-foreground" title={row.title}>
          {row.title}
        </span>
        {row.subtitle || row.caption || !wide ? (
          // Each part stays whole and takes a line of its own when the ones before it fill this one.
          <span className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {row.subtitle ? (
              <span className="max-w-full min-w-0 truncate font-mono" title={row.subtitle}>
                {row.subtitle}
              </span>
            ) : null}
            {wide ? null : <FoldedValues {...cells} />}
            {row.caption ? (
              <span className="max-w-full min-w-0 truncate" title={row.caption}>
                {row.caption}
              </span>
            ) : null}
          </span>
        ) : null}
        {row.error ? (
          <span className="text-xs text-destructive" role="alert">
            {row.error}
          </span>
        ) : null}
      </span>
      {wide ? (
        <>
          <WideCells {...cells} />
          <span className="grid size-6 place-items-center">
            <RowMenu actions={menu} name={row.title} />
          </span>
        </>
      ) : (
        <SummaryPicker
          actions={menu}
          detail={
            <>
              <span className="text-foreground">{row.title}</span>
              {row.subtitle ? <span className="font-mono">{row.subtitle}</span> : null}
              {row.caption ? <span>{row.caption}</span> : null}
            </>
          }
          groups={summaryGroups(cells)}
          name={t`Choices for ${ph({ name: row.title })}`}
          search={t`Choices for ${ph({ name: row.title })}`}
        />
      )}
    </li>
  );
}

function DefaultsRow({
  title,
  columns,
  values,
  wide,
  template,
  markRoom,
  onChoose,
}: {
  title: string;
  columns: readonly Column[];
  values: Record<string, string>;
  wide: boolean;
  template: string;
  /** The rows' D columns, so the defaults' labels line up with theirs. */
  markRoom: ReadonlySet<string>;
  onChoose: (column: string, value: string) => void;
}) {
  const cells: Cells = { columns, values, name: title, bulk: true, markRoom, onChoose };
  const editable = columns.filter((column) => column.editable !== false && column.id in values);
  return (
    <div
      className="relative grid min-h-[2.875rem] items-center gap-x-2.5 border-b border-border py-1.5"
      data-slot="choice-table-defaults"
      onKeyDown={moveAcrossCells}
      style={{ gridTemplateColumns: template }}
    >
      <span aria-hidden="true" className="grid place-items-center text-muted-foreground">
        <AdjustIcon className="size-4" />
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span className="truncate text-ui font-semibold text-foreground" title={title}>
          {title}
        </span>
        {wide ? null : (
          <span className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <FoldedValues columns={editable} values={values} />
          </span>
        )}
      </span>
      {wide ? (
        <>
          <WideCells {...cells} columns={columns.map((column) => editableIn(column, values))} />
          <span />
        </>
      ) : (
        <SummaryPicker
          groups={summaryGroups({ ...cells, columns: editable })}
          name={t`Choices for ${ph({ name: title })}`}
          search={t`Choices for ${ph({ name: title })}`}
        />
      )}
    </div>
  );
}

/** A column the defaults don't set shows as an empty cell there. */
function editableIn(column: Column, values: Record<string, string>): Column {
  return column.id in values ? column : { ...column, editable: false };
}

/**
 * Inline rows were checked with the surface. Rows bound to the data model
 * were not, so each is checked here and one that doesn't fit is left out.
 */
function tableRows(value: unknown, inline: boolean): readonly Row[] {
  if (!Array.isArray(value)) return [];
  if (inline) return value as Row[];
  return value.slice(0, 500).flatMap((entry) => {
    const parsed = row.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

export function ClioChoiceTable({ props, context }: { props: Props; context: TableContext }) {
  const raw = context.componentModel.properties as {
    onChoose?: unknown;
    rowMenu?: { action?: unknown }[];
    add?: { action?: unknown };
    rows?: unknown;
    defaults?: { context?: unknown };
  };
  const inline = Array.isArray(raw.rows);
  const rows = useMemo(() => tableRows(props.rows, inline), [props.rows, inline]);
  // Inline rows' actions are bound by the binder, so their raw form is read from the
  // surface; bound rows are plain data already.
  const rawRows = (inline ? raw.rows : rows) as
    | readonly { menu?: readonly { action?: unknown }[]; context?: unknown }[]
    | undefined;
  // Optimistic picks, by row and column ("" is the defaults row), held for the table
  // they were made on: once the server sends it again, its own values show.
  const sent = JSON.stringify([rows, props.defaults]);
  const [held, setHeld] = useState<{ sent: string; picks: Readonly<Record<string, string>> }>({
    sent,
    picks: {},
  });
  const picked = held.sent === sent ? held.picks : {};
  useEffect(() => {
    if (!Object.keys(held.picks).length) return;
    const timer = window.setTimeout(() => setHeld({ sent: '', picks: {} }), PICK_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [held]);
  const choose = useCallback(
    (rowId: string, rowIndex: number | undefined, columnId: string, value: string) => {
      setHeld((current) => ({
        sent,
        picks: {
          ...(current.sent === sent ? current.picks : {}),
          [`${rowId}\u0000${columnId}`]: value,
        },
      }));
      if (!raw.onChoose) return;
      const extra = rowIndex === undefined ? raw.defaults?.context : rawRows?.[rowIndex]?.context;
      const resolved = resolveRawValue(extra ?? {}, context.dataContext);
      fire(context, raw.onChoose, {
        ...(resolved && typeof resolved === 'object' ? resolved : {}),
        row: rowId,
        column: columnId,
        value,
      });
    },
    [context, raw, rawRows, sent],
  );
  const shown = (rowId: string, values: Record<string, string>) => {
    let next = values;
    for (const [entry, value] of Object.entries(picked)) {
      const [pickedRow, columnId] = entry.split('\u0000') as [string, string];
      if (pickedRow === rowId) next = { ...next, [columnId]: value };
    }
    return next;
  };

  const table = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>();
  useLayoutEffect(() => {
    const element = table.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => entry && setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const rem =
    typeof document === 'undefined'
      ? 16
      : parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const columns = props.columns;
  // The columns need their cells, the name and the two narrow slots; narrower, rows fold.
  const wide = width === undefined || width >= (NAME_REM + columns.length * CELL_REM + 4) * rem;
  const template = wide
    ? `20px minmax(0,1fr) repeat(${columns.length}, ${CELL_REM}rem) 24px`
    : '20px minmax(0,1fr) 24px';

  const menuFor = (entry: Row, index: number): MenuEntry[] => {
    const own = entry.menu !== undefined;
    const items = own ? entry.menu! : (props.rowMenu ?? []);
    const rawItems = own ? rawRows?.[index]?.menu : raw.rowMenu;
    return items.map((item, at) => ({
      id: item.id,
      label: item.label,
      destructive: item.destructive,
      onSelect: () => fire(context, rawItems?.[at]?.action, { row: entry.id }),
    }));
  };

  const inheritable = useMemo(
    () => new Set(rows.flatMap((entry) => entry.inherited ?? [])),
    [rows],
  );
  const addButton = props.add ? (
    <Button
      className="rounded-[7px] border-input text-foreground"
      data-slot="choice-table-add"
      onClick={() => fire(context, raw.add?.action, {})}
      size="sm"
      variant="outline"
    >
      <AddIcon aria-hidden="true" className="size-3.5" />
      {props.add.label}
    </Button>
  ) : null;

  let body: ReactNode;
  if (!rows.length)
    body = (
      <div
        className="flex min-h-12 flex-wrap items-center gap-2.5 px-1 py-3 text-sm text-muted-foreground"
        data-slot="choice-table-empty"
      >
        <span className="min-w-0 flex-1">{props.empty ?? t`Nothing here yet.`}</span>
        {addButton}
      </div>
    );
  else
    body = (
      <ul aria-label={props.label} className="grid">
        {rows.map((entry, index) => (
          <TableRow
            columns={columns}
            inheritable={inheritable}
            key={entry.id}
            menu={menuFor(entry, index)}
            onChoose={(columnId, value) => choose(entry.id, index, columnId, value)}
            row={{ ...entry, values: shown(entry.id, entry.values) }}
            template={template}
            wide={wide}
          />
        ))}
      </ul>
    );

  return (
    <TooltipProvider disableHoverableContent>
      <div
        {...a2uiAccessibilityProps(props.accessibility)}
        aria-label={props.label}
        className="min-w-0"
        data-fold={wide ? 'wide' : 'summary'}
        data-slot="a2ui-choice-table"
        ref={table}
        role="group"
      >
        {addButton && rows.length ? <div className="flex justify-end pb-2">{addButton}</div> : null}
        {props.defaults ? (
          <DefaultsRow
            columns={columns}
            markRoom={inheritable}
            onChoose={(columnId, value) => choose('', undefined, columnId, value)}
            template={template}
            title={props.defaults.title}
            values={shown('', props.defaults.values)}
            wide={wide}
          />
        ) : null}
        {wide ? (
          <div
            className="grid min-h-[34px] items-center gap-x-2.5 border-b border-border text-label text-muted-foreground"
            data-slot="choice-table-header"
            style={{ gridTemplateColumns: template }}
          >
            <span aria-hidden="true" className="grid place-items-center text-faint">
              <LockIcon className="size-3 opacity-0" />
            </span>
            <span className="min-w-0 truncate">{props.label}</span>
            {columns.map((entry) => (
              <ColumnTitle
                column={entry}
                key={entry.id}
                marksDefaults={inheritable.has(entry.id)}
              />
            ))}
            <span />
          </div>
        ) : null}
        {body}
      </div>
    </TooltipProvider>
  );
}

// oxlint-disable-next-line react/only-export-components
export const ClioChoiceTableCatalogComponent = createComponentImplementation(
  { name: 'clio.choice-table.v1', schema: choiceTableSchema },
  ({ props, context }) => (
    <ClioChoiceTable
      context={context as unknown as TableContext}
      props={props as unknown as Props}
    />
  ),
);
