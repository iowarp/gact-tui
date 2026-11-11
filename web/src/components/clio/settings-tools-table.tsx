import type { ToolCallers, ToolOutcome, ToolPermission, ToolSetting } from '@clio/core/v3';
import {
  ArrowLeftRightIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  EyeIcon,
} from 'lucide-react';
import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type SVGProps,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  AdjustIcon,
  DeleteIcon,
  EditIcon,
  HelpIcon,
  MoreIcon,
  RetryIcon,
} from '@/lib/icon-vocabulary';
import { scrollParent } from '@/hooks/use-seen-in-view';
import { moveAcrossCells } from '@/lib/settings-row-keys';
import { cn } from '@/lib/utils';
import {
  CALLERS_TEXT,
  OUTCOME_TEXT,
  OUTCOME_TITLE,
  OUTCOME_TONE,
  PERMISSION_TEXT,
  SCRIPT_OUTCOME_TEXT,
  callersChoice,
  defaultCallers,
  defaultPermission,
  effectiveCallers,
  effectivePermission,
  flagText,
  modeLabel,
  permissionChoice,
  ruleText,
  savedRules,
  sourceText,
} from './plugin-tool-settings-text';
import { IconButton } from './primitives/icon-button';
import { StatusIndicator, type StatusTone } from './primitives/status-indicator';
import { statusWordClass } from './primitives/status-word-tone';
import type { RowStatus, ToolEditor } from './settings-tools-editor';
import {
  ChoicePicker,
  SummaryPicker,
  ValueMark,
  type PickerAction,
  type PickerOption,
} from './settings-tools-picker';
import {
  CALLERS,
  CALLERS_ICON,
  COLUMNS,
  MODE_CELL,
  NARROW_ONLY,
  PERMISSION_ICON,
  PERMISSIONS,
  SCRIPT_CELL,
  WIDE,
  toolsFold,
  type ToolsFold,
} from './settings-tools-columns';
import { HeaderRow } from './settings-tools-header';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export interface ToolTableSection {
  id: string;
  title: string;
  /** Faint words after the title, each its own part ("github server", "4 tools"). */
  meta?: string[];
  /** A count beside the title. */
  count?: number;
  /** Hover text for the title. */
  hint?: string;
  /** Names the group's bulk choices ("All read-only tools"). */
  bulkLabel: string;
  tools: ToolSetting[];
  /** Instead of tools: why there are none yet ("Not loaded yet"). */
  notice?: {
    text: string;
    status: string;
    tone: StatusTone;
    title?: string;
    /** A failed read offers Retry on its row, as every Settings error does. */
    retry?: () => void;
  };
  /** While its tools load: how many rows to hold space for, so the page doesn't jump. */
  reserveRows?: number;
}

function Outcome({ value, className }: { value: ToolOutcome; className?: string }) {
  return (
    <span className={cn('flex min-w-0', className)} title={OUTCOME_TITLE[value]}>
      <StatusIndicator
        className={cn(
          value === 'covered' && 'text-info',
          value === 'unavailable' && 'text-faint',
          'text-[12px]',
        )}
        label={OUTCOME_TEXT[value]}
        tone={OUTCOME_TONE[value]}
      />
    </span>
  );
}

/** An outcome folded into the row's second line. */
function OutcomeMark({
  value,
  text,
  className,
}: {
  value: ToolOutcome;
  text: string;
  className?: string;
}) {
  return (
    <span className={cn('flex min-w-0', className)} title={OUTCOME_TITLE[value]}>
      <StatusIndicator
        className={cn('text-xs', !statusWordClass(OUTCOME_TONE[value]) && 'text-faint')}
        label={text}
        tone={OUTCOME_TONE[value]}
      />
    </span>
  );
}

/** A value a summary row shows in its sub line: the mark, D for a default, and the word. */
function ValueSummary({
  icon,
  label,
  isDefault,
  chosen,
  className,
  title,
}: {
  icon: Icon;
  label: string;
  isDefault: boolean;
  chosen: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-2',
        chosen ? 'text-primary' : 'text-muted-foreground',
        className,
      )}
      title={title}
    >
      <ValueMark icon={icon} isDefault={isDefault} />
      {label}
      {isDefault ? <span className="sr-only">, default</span> : null}
    </span>
  );
}

function toolKind(tool: ToolSetting): { icon: Icon; label: string } {
  if (!tool.flags_known) return { icon: HelpIcon, label: 'Flags not loaded yet' };
  if (tool.read_only) return { icon: EyeIcon, label: 'Read-only' };
  if (tool.destructive) return { icon: DeleteIcon, label: 'Destructive' };
  return { icon: EditIcon, label: 'Writes or acts' };
}

function permissionOptions(defaultValue?: ToolPermission): PickerOption<ToolPermission>[] {
  return PERMISSIONS.map((value) => ({
    value,
    label: PERMISSION_TEXT[value].label,
    description: PERMISSION_TEXT[value].detail,
    icon: PERMISSION_ICON[value],
    isDefault: value === defaultValue,
  }));
}

function callersOptions(defaultValue?: ToolCallers | ''): PickerOption<ToolCallers>[] {
  return CALLERS.map((value) => ({
    value,
    label: CALLERS_TEXT[value].label,
    description: CALLERS_TEXT[value].detail,
    icon: CALLERS_ICON[value],
    isDefault: value === defaultValue,
  }));
}

function valueTitle(label: string, isDefault: boolean): string {
  return isDefault ? `${label} (default; choose a value to override it)` : `${label} (your choice)`;
}

/** A row's save and rule removal: stable across renders, so rows can skip re-rendering. */
type RowEditor = Pick<ToolEditor, 'save' | 'removeRule'>;

const ToolRow = memo(function ToolRow({
  tool,
  mode,
  status,
  busy,
  editor,
  index,
  position,
  setSize,
  measure,
  fold,
}: {
  tool: ToolSetting;
  mode: string;
  status?: RowStatus;
  busy: boolean;
  editor: RowEditor;
  /** Windowed: the row's index among the table's measured rows. */
  index?: number;
  /** Windowed: the row's place in its group, for assistive tech. */
  position?: number;
  setSize?: number;
  measure?: (element: Element | null) => void;
  /** The table's fold once measured: parts it hides aren't mounted. Unknown mounts every part. */
  fold?: ToolsFold;
}) {
  // What the container queries show at this fold; every part until the width is known.
  const shows = (from: ToolsFold, below: number = 4) =>
    fold === undefined || (fold >= from && fold < below);
  const permission = effectivePermission(tool, mode);
  const callers = effectiveCallers(tool);
  const permissionDefault = defaultPermission(tool, mode);
  const callersDefault = defaultCallers(tool);
  const outcome = tool.outcomes[mode];
  const kind = toolKind(tool);
  const byRule = !tool.permission && savedRules(tool).length > 0;
  const permissionLabel = PERMISSION_TEXT[permission.value].label;
  const callersLabel = callers.value ? CALLERS_TEXT[callers.value].label : 'Unknown';
  const permissionIcon = PERMISSION_ICON[permission.value];
  const callersIcon = callers.value ? CALLERS_ICON[callers.value] : ArrowLeftRightIcon;
  const choosePermission = (value: ToolPermission) =>
    editor.save({ tools: [tool.name], permission: value === permissionDefault ? null : value });
  const chooseCallers = (value: ToolCallers) =>
    editor.save({ tools: [tool.name], callers: value === callersDefault ? null : value });
  return (
    <li
      aria-posinset={position}
      aria-setsize={setSize}
      className={cn(
        COLUMNS,
        'group/row relative min-h-11 border-b border-border/70 py-1 hover:bg-hover/60 has-[[aria-expanded=true]]:bg-hover/60',
      )}
      data-index={index}
      data-tool={tool.name}
      onKeyDown={moveAcrossCells}
      ref={measure}
    >
      <span
        aria-label={kind.label}
        className="grid place-items-center text-muted-foreground"
        role="img"
        title={kind.label}
      >
        <kind.icon className="size-4" />
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span
          className="truncate font-mono text-[12.5px] font-medium text-foreground"
          title={tool.description ? `${tool.name}: ${tool.description}` : tool.name}
        >
          {tool.name}
        </span>
        {status?.kind === 'error' ? (
          <span className="truncate text-xs text-destructive" role="alert" title={status.message}>
            {status.message}
          </span>
        ) : (
          // One line whatever the width: the values (summary rows only), the
          // outcomes the columns fold away, then the reason, truncating last.
          // Below 44rem the line wraps inside a one-line clip, so an outcome
          // without room for a few letters of its label leaves whole rather
          // than as a bare dot.
          <span className="flex h-[21px] min-w-0 flex-wrap gap-x-3 gap-y-2 overflow-hidden text-xs whitespace-nowrap text-faint @min-[44rem]/tools:h-auto @min-[44rem]/tools:flex-nowrap">
            {shows(2) ? (
              <span className="hidden shrink-0 @min-[44rem]/tools:inline">{flagText(tool)}</span>
            ) : null}
            {shows(0, 1) ? (
              <ValueSummary
                chosen={!permission.isDefault}
                className={NARROW_ONLY}
                icon={permissionIcon}
                isDefault={permission.isDefault}
                label={permissionLabel}
              />
            ) : null}
            {shows(0, 1) ? (
              <ValueSummary
                chosen={!callers.isDefault}
                className={NARROW_ONLY}
                icon={callersIcon}
                isDefault={callers.isDefault && Boolean(callers.value)}
                label={callersLabel}
              />
            ) : null}
            {outcome && shows(0, 2) ? (
              <OutcomeMark
                className="shrink-0 @min-[44rem]/tools:hidden"
                text={
                  outcome.direct === 'unavailable'
                    ? "Agent can't call it"
                    : `${OUTCOME_TEXT[outcome.direct]}${byRule ? ' by a rule' : ''}`
                }
                value={outcome.direct}
              />
            ) : null}
            {outcome && shows(0, 3) ? (
              <OutcomeMark
                className="max-w-max min-w-0 grow basis-[calc(1.25rem+5ch)] @min-[44rem]/tools:shrink-0 @min-[44rem]/tools:grow-0 @min-[44rem]/tools:basis-auto @min-[56rem]/tools:hidden"
                text={SCRIPT_OUTCOME_TEXT[outcome.script]}
                value={outcome.script}
              />
            ) : null}
            {shows(2) ? (
              <span
                className="hidden min-w-0 truncate @min-[44rem]/tools:inline"
                title={sourceText(tool)}
              >
                {sourceText(tool)}
              </span>
            ) : null}
          </span>
        )}
      </span>
      <span className={MODE_CELL}>
        {outcome && shows(2) ? <Outcome value={outcome.direct} /> : null}
      </span>
      <span className={SCRIPT_CELL}>
        {outcome && shows(3) ? <Outcome value={outcome.script} /> : null}
      </span>
      {shows(1) ? (
        <ChoicePicker
          chosen={!permission.isDefault}
          className={WIDE}
          disabled={busy}
          icon={permissionIcon}
          iconClassName={
            permission.isDefault && permission.value === 'deny' ? 'text-destructive' : undefined
          }
          isDefault={permission.isDefault}
          label={permissionLabel}
          name={`Permission: ${tool.name}`}
          onChoose={choosePermission}
          options={permissionOptions(permissionDefault)}
          search={`Permission for ${tool.name}`}
          selected={permission.value}
          title={valueTitle(permissionLabel, permission.isDefault)}
        />
      ) : null}
      {shows(1) ? (
        <ChoicePicker
          chosen={!callers.isDefault}
          className={WIDE}
          disabled={busy}
          icon={callersIcon}
          isDefault={callers.isDefault && Boolean(callers.value)}
          label={callersLabel}
          name={`I/O: ${tool.name}`}
          onChoose={chooseCallers}
          options={callersOptions(callersDefault)}
          search={`I/O for ${tool.name}`}
          selected={callers.value || undefined}
          title={
            callers.value
              ? valueTitle(callersLabel, callers.isDefault)
              : "The plugin's default is known once a conversation loads the tool."
          }
        />
      ) : null}
      {shows(1) ? <RowSlot editor={editor} mode={mode} status={status} tool={tool} /> : null}
      {shows(0, 1) ? (
        <SummaryPicker
          actions={rowActions(tool, editor)}
          className={NARROW_ONLY}
          detail={<ToolFacts mode={mode} tool={tool} />}
          disabled={busy}
          groups={[
            {
              heading: 'Permission',
              options: permissionOptions(permissionDefault),
              selected: permission.value,
              onChoose: (value) => choosePermission(value as ToolPermission),
            },
            {
              heading: 'I/O',
              options: callersOptions(callersDefault),
              selected: callers.value || undefined,
              onChoose: (value) => chooseCallers(value as ToolCallers),
            },
          ]}
          name={`Permission and I/O: ${tool.name}`}
          search={`Choices for ${tool.name}`}
        />
      ) : null}
    </li>
  );
});

/** What the columns and the sub line say about a tool, in sentences. */
function ToolFacts({ tool, mode }: { tool: ToolSetting; mode: string }) {
  const outcome = tool.outcomes[mode];
  return (
    <>
      <span className="font-mono text-foreground">{tool.name}</span>
      {tool.description ? (
        <span className="line-clamp-2" title={tool.description}>
          {tool.description}
        </span>
      ) : null}
      <span>
        {flagText(tool)}. {sourceText(tool)}.
      </span>
      {outcome ? (
        <span>
          In {modeLabel(mode)}: {OUTCOME_TITLE[outcome.direct]}. From a script:{' '}
          {OUTCOME_TITLE[outcome.script]}.
        </span>
      ) : null}
    </>
  );
}

/** Use defaults, then each saved rule's removal. */
function rowActions(tool: ToolSetting, editor: RowEditor): PickerAction[] {
  return [
    {
      label: 'Use defaults',
      disabled: !tool.permission && !tool.configured_callers,
      onSelect: () => editor.save({ tools: [tool.name], permission: null, callers: null }),
    },
    ...savedRules(tool).map((rule) => ({
      label: `Remove rule: ${ruleText(rule.action, rule.where, rule.path_pattern)}`,
      onSelect: () => editor.removeRule(tool.name, rule),
    })),
  ];
}

/** The trailing slot: ✓ after a save, the error mark, and the row's menu. */
function RowSlot({
  tool,
  mode,
  status,
  editor,
}: {
  tool: ToolSetting;
  mode: string;
  status?: RowStatus;
  editor: RowEditor;
}) {
  return (
    <span className="relative hidden size-6 place-items-center @min-[32rem]/tools:grid">
      {status?.kind === 'saved' ? (
        <span
          aria-label="Saved"
          className="grid place-items-center text-primary group-hover/row:invisible group-has-[:focus-visible]/row:invisible"
          role="status"
          title="Saved"
        >
          <CheckIcon className="size-[15px]" />
        </span>
      ) : status?.kind === 'error' ? (
        <span
          aria-hidden="true"
          className="grid place-items-center text-destructive group-hover/row:invisible group-has-[:focus-visible]/row:invisible"
          title={status.message}
        >
          <CircleAlertIcon className="size-[15px]" />
        </span>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={`More for ${tool.name}`}
            className={cn(
              'absolute inset-0 grid place-items-center rounded-md text-muted-foreground outline-none hover:bg-hover hover:text-foreground focus-visible:visible focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:visible',
              'invisible group-hover/row:visible',
            )}
            title="Rules and reset"
            type="button"
          >
            <MoreIcon className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel className="grid gap-1 text-xs font-normal whitespace-normal text-muted-foreground">
            <ToolFacts mode={mode} tool={tool} />
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {rowActions(tool, editor).map((action, index) => (
            <DropdownMenuItem
              disabled={action.disabled}
              key={`${action.label}:${index}`}
              onSelect={action.onSelect}
            >
              <span className="truncate" title={action.label}>
                {action.label}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}

function shared<T extends string>(values: T[]): T | 'mixed' {
  return values.length && values.every((value) => value === values[0]) ? values[0]! : 'mixed';
}

function bulkTitle(choice: string, label: string): string {
  if (choice === 'mixed')
    return 'Some tools differ from their default. Choose a value to set them all.';
  if (choice === 'default') return 'Every tool uses its default. Choose a value to set them all.';
  return `Every tool is set to ${label}. Choose Per tool to return each to its default.`;
}

const PER_TOOL = {
  value: 'default' as const,
  label: 'Per tool',
  description: 'Each tool uses its own default.',
  icon: AdjustIcon,
};

const GroupRow = memo(function GroupRow({
  section,
  open,
  onToggle,
  editor,
  busy,
  index,
  measure,
}: {
  section: ToolTableSection;
  open: boolean;
  onToggle: (id: string) => void;
  editor: RowEditor;
  busy: boolean;
  index?: number;
  measure?: (element: Element | null) => void;
}) {
  const names = section.tools.map((tool) => tool.name);
  const permission = shared(section.tools.map(permissionChoice));
  const callers = shared(section.tools.map(callersChoice));
  const permissionLabel =
    permission === 'mixed'
      ? 'Mixed'
      : permission === 'default'
        ? 'Per tool'
        : PERMISSION_TEXT[permission].label;
  const callersLabel =
    callers === 'mixed'
      ? 'Mixed'
      : callers === 'default'
        ? 'Per tool'
        : CALLERS_TEXT[callers].label;
  const hasTools = names.length > 0;
  const meta =
    section.meta ??
    (section.count === undefined
      ? []
      : [`${section.count} ${section.count === 1 ? 'tool' : 'tools'}`]);
  const changed = section.tools.some((tool) => tool.permission || tool.configured_callers);
  const permissionIcon =
    permission === 'mixed' || permission === 'default' ? AdjustIcon : PERMISSION_ICON[permission];
  const callersIcon =
    callers === 'mixed' || callers === 'default' ? AdjustIcon : CALLERS_ICON[callers];
  const choosePermission = (value: ToolPermission | 'default') =>
    editor.save({ tools: names, permission: value === 'default' ? null : value });
  const chooseCallers = (value: ToolCallers | 'default') =>
    editor.save({ tools: names, callers: value === 'default' ? null : value });
  const summary = hasTools && !section.notice;
  return (
    <div
      // Padding, not margin, above the group: a windowed table measures each row's box.
      className={cn(COLUMNS, 'group/group relative min-h-[2.875rem] pt-2.5 pb-1')}
      data-index={index}
      data-tool-group={section.id}
      onKeyDown={moveAcrossCells}
      ref={measure}
    >
      {hasTools ? (
        <button
          aria-expanded={open}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${section.title}`}
          className="relative z-10 grid size-5 place-items-center rounded text-muted-foreground outline-none hover:bg-hover hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
          onClick={() => onToggle(section.id)}
          type="button"
        >
          {open ? (
            <ChevronDownIcon className="size-3.5" />
          ) : (
            <ChevronRightIcon className="size-3.5" />
          )}
        </button>
      ) : (
        <span aria-hidden="true" className="grid place-items-center text-faint">
          {section.reserveRows ? (
            <ChevronDownIcon className="size-3.5" />
          ) : (
            <ChevronRightIcon className="size-3.5" />
          )}
        </span>
      )}
      <span
        className={cn('grid min-w-0 gap-0.5', section.notice && '@max-[32rem]/tools:col-span-2')}
      >
        <h3 className="truncate text-[13px] font-semibold text-foreground" title={section.hint}>
          {section.title}
        </h3>
        {section.notice || meta.length || summary ? (
          <span className="flex min-w-0 gap-3 overflow-hidden text-xs whitespace-nowrap text-faint">
            {section.notice ? (
              <span className="truncate" title={section.notice.title ?? section.notice.text}>
                {section.notice.text}
              </span>
            ) : (
              meta.map((part, index) => (
                <span
                  className={cn(
                    // The count stays whole; a long server name gives way first.
                    index === 0 && meta.length > 1 ? 'min-w-0 truncate' : 'shrink-0',
                  )}
                  key={part}
                  title={part}
                >
                  {part}
                </span>
              ))
            )}
            {summary && permissionLabel === callersLabel ? (
              // Both settings read the same ("Per tool", "Mixed"): one summary, not a repeat.
              <ValueSummary
                chosen={false}
                className={NARROW_ONLY}
                icon={permissionIcon}
                isDefault={false}
                label={permissionLabel}
                title={`Permission and I/O: ${permissionLabel}`}
              />
            ) : summary ? (
              <>
                <ValueSummary
                  chosen={permission !== 'mixed' && permission !== 'default'}
                  className={NARROW_ONLY}
                  icon={permissionIcon}
                  isDefault={false}
                  label={permissionLabel}
                  title={`Permission: ${permissionLabel}`}
                />
                <ValueSummary
                  chosen={callers !== 'mixed' && callers !== 'default'}
                  className={NARROW_ONLY}
                  icon={callersIcon}
                  isDefault={false}
                  label={callersLabel}
                  title={`I/O: ${callersLabel}`}
                />
              </>
            ) : null}
          </span>
        ) : null}
      </span>
      {section.notice ? (
        <span
          className="col-span-2 col-start-2 row-start-2 flex min-w-0 items-center gap-3 @min-[32rem]/tools:col-[3/-1] @min-[32rem]/tools:row-start-1"
          title={section.notice.title}
        >
          <StatusIndicator
            className={cn('text-[12px]', section.notice.tone === 'idle' && 'text-faint')}
            label={section.notice.status}
            tone={section.notice.tone}
          />
          {section.notice.retry ? (
            <Button
              className="ml-auto rounded-[7px] border-input text-foreground"
              onClick={section.notice.retry}
              size="xs"
              variant="outline"
            >
              <RetryIcon aria-hidden="true" className="size-3.5" />
              Retry
            </Button>
          ) : null}
        </span>
      ) : hasTools ? (
        <>
          <span className={MODE_CELL} />
          <span className={SCRIPT_CELL} />
          <ChoicePicker<ToolPermission | 'default'>
            bulk
            chosen={permission !== 'mixed' && permission !== 'default'}
            className={WIDE}
            disabled={busy}
            icon={permissionIcon}
            label={permissionLabel}
            name={`Permission: ${section.bulkLabel}`}
            onChoose={choosePermission}
            options={[PER_TOOL, ...permissionOptions()]}
            search={`Permission for ${section.bulkLabel.toLowerCase()}`}
            selected={permission === 'mixed' ? undefined : permission}
            title={bulkTitle(permission, permissionLabel)}
          />
          <ChoicePicker<ToolCallers | 'default'>
            bulk
            chosen={callers !== 'mixed' && callers !== 'default'}
            className={WIDE}
            disabled={busy}
            icon={callersIcon}
            label={callersLabel}
            name={`I/O: ${section.bulkLabel}`}
            onChoose={chooseCallers}
            options={[PER_TOOL, ...callersOptions()]}
            search={`I/O for ${section.bulkLabel.toLowerCase()}`}
            selected={callers === 'mixed' ? undefined : callers}
            title={bulkTitle(callers, callersLabel)}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                className="invisible group-hover/group:visible focus-visible:visible data-[state=open]:visible @max-[32rem]/tools:hidden"
                icon={<MoreIcon />}
                label={`More for ${section.bulkLabel.toLowerCase()}`}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              <DropdownMenuItem
                disabled={busy || !changed}
                onSelect={() => editor.save({ tools: names, permission: null, callers: null })}
              >
                Reset all to defaults
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <SummaryPicker
            actions={[
              {
                label: 'Reset all to defaults',
                disabled: busy || !changed,
                onSelect: () => editor.save({ tools: names, permission: null, callers: null }),
              },
            ]}
            className={NARROW_ONLY}
            disabled={busy}
            groups={[
              {
                heading: 'Permission',
                options: [PER_TOOL, ...permissionOptions()],
                selected: permission === 'mixed' ? undefined : permission,
                onChoose: (value) => choosePermission(value as ToolPermission | 'default'),
              },
              {
                heading: 'I/O',
                options: [PER_TOOL, ...callersOptions()],
                selected: callers === 'mixed' ? undefined : callers,
                onChoose: (value) => chooseCallers(value as ToolCallers | 'default'),
              },
            ]}
            name={`Permission and I/O: ${section.bulkLabel}`}
            search={`Choices for ${section.bulkLabel.toLowerCase()}`}
          />
        </>
      ) : null}
    </div>
  );
});

/** Above this many rows the table renders only those near the visible part of its scroller. */
const WINDOW_FROM = 80;
const GROUP_HEIGHT = 46;
const ROW_HEIGHT = 44;

type TableItem =
  | { kind: 'group'; section: number; key: string }
  | { kind: 'tool'; section: number; key: string; tool: ToolSetting; position: number }
  | { kind: 'reserve'; section: number; key: string };

/** The table's rows in order: each group, then its tools or the space they will take. */
function tableItems(
  sections: readonly ToolTableSection[],
  collapsed: ReadonlySet<string>,
): TableItem[] {
  return sections.flatMap((section, index): TableItem[] => {
    const group: TableItem = { kind: 'group', section: index, key: `g:${section.id}` };
    if (collapsed.has(section.id)) return [group];
    if (section.tools.length)
      return [
        group,
        ...section.tools.map(
          (tool, place): TableItem => ({
            kind: 'tool',
            section: index,
            key: `t:${section.id}:${tool.name}`,
            tool,
            position: place + 1,
          }),
        ),
      ];
    return [
      group,
      ...Array.from(
        { length: section.reserveRows ?? 0 },
        (_, slot): TableItem => ({
          kind: 'reserve',
          section: index,
          key: `r:${section.id}:${slot}`,
        }),
      ),
    ];
  });
}

/**
 * Permission and I/O per tool, in groups: one row per tool with its flag, what
 * a call does in the chosen approval mode, and its two choices. Folds by its
 * own width, so the same table serves Settings and a plugin's detail pane.
 * A long table keeps only the rows near view in the page, so hundreds of tools
 * cost what a screenful does.
 */
export function ToolSettingsTable({
  sections,
  mode,
  editor,
  label,
}: {
  sections: readonly ToolTableSection[];
  mode: string;
  editor: ToolEditor;
  label: string;
}) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggle = useCallback(
    (id: string) =>
      setCollapsed((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );
  const { save, removeRule } = editor;
  const rowEditor = useMemo<RowEditor>(() => ({ save, removeRule }), [save, removeRule]);
  const items = useMemo(() => tableItems(sections, collapsed), [sections, collapsed]);
  const windowed = items.length > WINDOW_FROM;
  const list = useRef<HTMLDivElement>(null);
  const table = useRef<HTMLDivElement>(null);
  const [fold, setFold] = useState<ToolsFold>();
  useLayoutEffect(() => {
    const element = table.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const measureFold = (width: number) =>
      setFold(
        toolsFold(width, parseFloat(getComputedStyle(document.documentElement).fontSize) || 16),
      );
    measureFold(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => entry && measureFold(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  // Where the rows start in the scroller's content, past the toolbar and column titles. It's
  // read again whenever the list or anything around it resizes, after layout, so scrolling
  // never forces one.
  useLayoutEffect(() => {
    const element = list.current;
    if (!windowed || !element) return;
    const parent = scrollParent(element);
    setScroller(parent);
    if (!parent) return;
    const read = () => {
      const offset = Math.round(
        element.getBoundingClientRect().top -
          parent.getBoundingClientRect().top -
          parent.clientTop +
          parent.scrollTop,
      );
      setScrollMargin((current) => (Math.abs(offset - current) > 1 ? offset : current));
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    for (let node: Element | null = element; node && node !== parent; node = node.parentElement)
      observer.observe(node);
    return () => observer.disconnect();
  }, [windowed]);
  // oxlint-disable-next-line react/incompatible-library -- TanStack owns these functions.
  const virtualizer = useVirtualizer({
    count: windowed ? items.length : 0,
    enabled: windowed,
    getScrollElement: () => scroller,
    estimateSize: (index) => (items[index]?.kind === 'group' ? GROUP_HEIGHT : ROW_HEIGHT),
    getItemKey: (index) => items[index]?.key ?? index,
    // Start from where the scroller already is, so mounting never moves it.
    initialOffset: () => scroller?.scrollTop ?? 0,
    initialRect: { width: 0, height: 1000 },
    // A new row takes the size already known for it; the ResizeObserver reports its real
    // height after layout. Reading offsetHeight here would force a style recalc of every
    // new row inside React's commit.
    measureElement: (element, entry, instance) => {
      const box = entry?.borderBoxSize?.[0];
      if (box) return Math.round(box.blockSize);
      const index = Number(element.getAttribute('data-index'));
      return instance.measurementsCache[index]?.size ?? ROW_HEIGHT;
    },
    // Scroll updates render with React's own batching rather than one synchronous commit each.
    useFlushSync: false,
    overscan: 10,
    scrollMargin,
  });

  const groupBusy = (section: ToolTableSection) =>
    section.tools.some((tool) => editor.busy.has(tool.name));
  const toolRow = (section: ToolTableSection, tool: ToolSetting, at?: [number, number]) => (
    <ToolRow
      busy={editor.busy.has(tool.name)}
      editor={rowEditor}
      fold={fold}
      index={at?.[0]}
      key={tool.name}
      measure={at ? virtualizer.measureElement : undefined}
      mode={mode}
      position={at?.[1]}
      setSize={at ? section.tools.length : undefined}
      status={editor.status[tool.name]}
      tool={tool}
    />
  );

  let rows;
  if (windowed) {
    const shown = virtualizer.getVirtualItems();
    const first = shown[0];
    const last = shown.at(-1);
    const total = virtualizer.getTotalSize();
    const before = first ? first.start - scrollMargin : 0;
    const after = last ? total - (last.end - scrollMargin) : total;
    // The rows in view, still grouped under their sections.
    const runs: { section: number; entries: { item: TableItem; index: number }[] }[] = [];
    for (const { index } of shown) {
      const item = items[index];
      if (!item) continue;
      const run = runs.at(-1);
      if (run?.section === item.section) run.entries.push({ item, index });
      else runs.push({ section: item.section, entries: [{ item, index }] });
    }
    rows = (
      // The virtualizer keeps the view steady as rows measure; the browser's own scroll
      // anchoring would correct it a second time and pull the scroll back.
      <div
        className="[overflow-anchor:none]"
        ref={list}
        style={{ paddingTop: before, paddingBottom: after }}
      >
        {runs.map(({ section: at, entries }) => {
          const section = sections[at]!;
          const group = entries.find((entry) => entry.item.kind === 'group');
          const tools = entries.flatMap((entry) =>
            entry.item.kind === 'tool' ? [{ ...entry, item: entry.item }] : [],
          );
          const reserved = entries.filter((entry) => entry.item.kind === 'reserve');
          return (
            // The section names its group, so its rows load once in view, even with
            // the group's own row scrolled away.
            <section aria-label={section.title} data-tool-group={section.id} key={section.id}>
              {group ? (
                <GroupRow
                  busy={groupBusy(section)}
                  editor={rowEditor}
                  index={group.index}
                  measure={virtualizer.measureElement}
                  onToggle={toggle}
                  open={!collapsed.has(section.id)}
                  section={section}
                />
              ) : null}
              {tools.length ? (
                <ul className="grid" aria-label={`${section.title} tools`}>
                  {tools.map(({ item, index }) =>
                    toolRow(section, item.tool, [index, item.position]),
                  )}
                </ul>
              ) : null}
              {reserved.length ? (
                <div aria-hidden="true" className="grid">
                  {reserved.map(({ item, index }) => (
                    <span
                      className="min-h-11 border-b border-border/70"
                      data-index={index}
                      key={item.key}
                      ref={virtualizer.measureElement}
                    />
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    );
  } else {
    rows = sections.map((section) => {
      const open = !collapsed.has(section.id);
      return (
        <section aria-label={section.title} key={section.id}>
          <GroupRow
            busy={groupBusy(section)}
            editor={rowEditor}
            onToggle={toggle}
            open={open}
            section={section}
          />
          {open && section.tools.length ? (
            <ul className="grid" aria-label={`${section.title} tools`}>
              {section.tools.map((tool) => toolRow(section, tool))}
            </ul>
          ) : open && section.reserveRows ? (
            // Empty rows, each the height of a tool row, until the tools arrive.
            <div aria-hidden="true" className="grid">
              {Array.from({ length: section.reserveRows }, (_, index) => (
                <span className="min-h-11 border-b border-border/70" key={index} />
              ))}
            </div>
          ) : null}
        </section>
      );
    });
  }
  return (
    <TooltipProvider disableHoverableContent>
      <div
        aria-label={label}
        className="@container/tools min-w-0"
        data-slot="tools-table"
        ref={table}
        role="group"
      >
        <HeaderRow mode={mode} />
        {rows}
      </div>
    </TooltipProvider>
  );
}
