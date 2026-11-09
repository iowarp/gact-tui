import type { ToolCallers, ToolOutcome, ToolPermission, ToolSetting } from '@clio/core/v3';
import {
  ArrowLeftRightIcon,
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CodeIcon,
  EyeIcon,
  LockIcon,
  OctagonXIcon,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ComponentType, type ReactNode, type SVGProps } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AdjustIcon, DeleteIcon, EditIcon, HelpIcon, MoreIcon } from '@/lib/icon-vocabulary';
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
import type { RowStatus, ToolEditor } from './settings-tools-editor';
import { ChoicePicker, ValueMark, type PickerOption } from './settings-tools-picker';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const PERMISSION_ICON: Record<ToolPermission, LucideIcon> = {
  allow: CircleCheckIcon,
  ask: HelpIcon,
  deny: OctagonXIcon,
};

const CALLERS_ICON: Record<ToolCallers, LucideIcon> = {
  direct: BotIcon,
  code: CodeIcon,
  both: ArrowLeftRightIcon,
};

const PERMISSIONS = ['allow', 'ask', 'deny'] as const;
const CALLERS = ['direct', 'code', 'both'] as const;

/*
 * One column template for every row, folding as the table narrows: below
 * 32rem each tool is a summary row; then Tool, Permission and I/O; from 44rem
 * the approval mode's outcome; from 56rem the script's outcome too. The
 * columns keep the spec's widths (128, 176 and 120px); the sub line carries the
 * outcomes a narrower table folds away.
 */
const COLUMNS =
  'grid items-center gap-x-2.5 grid-cols-[20px_minmax(0,1fr)_8.5rem_5.5rem_24px] @min-[32rem]/tools:grid-cols-[20px_minmax(0,1fr)_11rem_7.5rem_24px] @min-[44rem]/tools:grid-cols-[20px_minmax(0,1fr)_8rem_11rem_7.5rem_24px] @min-[56rem]/tools:grid-cols-[20px_minmax(0,1fr)_8rem_8rem_11rem_7.5rem_24px]';
const MODE_CELL = 'hidden min-w-0 @min-[44rem]/tools:flex';
const SCRIPT_CELL = 'hidden min-w-0 @min-[56rem]/tools:flex';

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
  notice?: { text: string; status: string; tone: StatusTone; title?: string };
}

const COLUMN_HELP = {
  tool: 'The tool, its flag, and what a call does in the mode chosen above.',
  mode: 'What a direct call does in the approval mode chosen above.',
  script: 'What a call from a run_code script does.',
  permission: 'Always allow, Needs approval or Blocked. D marks the default.',
};

function IoHelp() {
  const rows: [ReactNode, string, string][] = [
    ...CALLERS.map(
      (value) =>
        [
          <ValueMark icon={CALLERS_ICON[value]} isDefault={false} key={value} />,
          CALLERS_TEXT[value].label,
          CALLERS_TEXT[value].detail,
        ] as [ReactNode, string, string],
    ),
    [
      <ValueMark icon={ArrowLeftRightIcon} isDefault key="d" />,
      'D',
      "The plugin's default. Choose a value to override it.",
    ],
  ];
  return (
    <span className="grid gap-1.5 py-0.5">
      <b className="font-medium">Who calls the tool</b>
      {rows.map(([mark, label, detail]) => (
        <span className="grid grid-cols-[16px_3.25rem_max-content] items-center gap-2" key={label}>
          {mark}
          <span>{label}</span>
          <span className="opacity-80">{detail}</span>
        </span>
      ))}
    </span>
  );
}

function ColumnTitle({ title, help }: { title: string; help: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="min-w-0 cursor-help truncate underline decoration-faint decoration-dotted underline-offset-4 outline-none focus-visible:ring-1 focus-visible:ring-ring"
          tabIndex={0}
        >
          {title}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-none">{help}</TooltipContent>
    </Tooltip>
  );
}

function HeaderRow({ mode }: { mode: string }) {
  return (
    <div
      className={cn(
        COLUMNS,
        'sticky top-0 z-10 hidden min-h-[34px] border-b border-border bg-popover text-[11.5px] text-muted-foreground @min-[32rem]/tools:grid',
      )}
      data-slot="tools-table-header"
    >
      <span
        aria-label="Stays at the top while the list scrolls"
        className="grid place-items-center text-faint"
        role="img"
        title="Stays at the top while the list scrolls"
      >
        <LockIcon className="size-3" />
      </span>
      <ColumnTitle help={COLUMN_HELP.tool} title="Tool" />
      <span className={MODE_CELL}>
        <ColumnTitle help={COLUMN_HELP.mode} title={`In ${modeLabel(mode)}`} />
      </span>
      <span className={SCRIPT_CELL}>
        <ColumnTitle help={COLUMN_HELP.script} title="From a script" />
      </span>
      <ColumnTitle help={COLUMN_HELP.permission} title="Permission" />
      <ColumnTitle help={<IoHelp />} title="I/O" />
      <span />
    </div>
  );
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
function OutcomeMark({ value, text }: { value: ToolOutcome; text: string }) {
  return (
    <span className="flex min-w-0" title={OUTCOME_TITLE[value]}>
      <StatusIndicator className="text-xs text-faint" label={text} tone={OUTCOME_TONE[value]} />
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

function ToolRow({ tool, mode, editor }: { tool: ToolSetting; mode: string; editor: ToolEditor }) {
  const permission = effectivePermission(tool, mode);
  const callers = effectiveCallers(tool);
  const permissionDefault = defaultPermission(tool, mode);
  const callersDefault = defaultCallers(tool);
  const outcome = tool.outcomes[mode];
  const status = editor.status[tool.name];
  const busy = editor.busy.has(tool.name);
  const kind = toolKind(tool);
  const byRule = !tool.permission && savedRules(tool).length > 0;
  const permissionLabel = PERMISSION_TEXT[permission.value].label;
  const callersLabel = callers.value ? CALLERS_TEXT[callers.value].label : 'Not known yet';
  return (
    <li
      className={cn(
        COLUMNS,
        'group/row min-h-11 border-b border-border/70 py-1 hover:bg-hover/60 has-[[aria-expanded=true]]:bg-hover/60',
      )}
      data-tool={tool.name}
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
          <>
            <span className="hidden min-w-0 gap-3 text-xs whitespace-nowrap text-faint @min-[56rem]/tools:flex">
              <span className="shrink-0">{flagText(tool)}</span>
              <span className="truncate" title={sourceText(tool)}>
                {sourceText(tool)}
              </span>
            </span>
            <span className="hidden min-w-0 gap-3 text-xs whitespace-nowrap text-faint @min-[44rem]/tools:flex @min-[56rem]/tools:hidden">
              <span className="shrink-0">{flagText(tool)}</span>
              {outcome ? (
                <OutcomeMark text={SCRIPT_OUTCOME_TEXT[outcome.script]} value={outcome.script} />
              ) : null}
            </span>
            {outcome ? (
              <span className="hidden min-w-0 gap-3 overflow-hidden @min-[32rem]/tools:flex @min-[44rem]/tools:hidden">
                <OutcomeMark
                  text={
                    outcome.direct === 'unavailable'
                      ? "Agent can't call it"
                      : `${OUTCOME_TEXT[outcome.direct]}${byRule ? ' by a rule' : ''}`
                  }
                  value={outcome.direct}
                />
                <OutcomeMark text={SCRIPT_OUTCOME_TEXT[outcome.script]} value={outcome.script} />
              </span>
            ) : null}
          </>
        )}
      </span>
      <span className={MODE_CELL}>{outcome ? <Outcome value={outcome.direct} /> : null}</span>
      <span className={SCRIPT_CELL}>{outcome ? <Outcome value={outcome.script} /> : null}</span>
      <ChoicePicker
        chosen={!permission.isDefault}
        disabled={busy}
        icon={PERMISSION_ICON[permission.value]}
        iconClassName={
          permission.isDefault && permission.value === 'deny' ? 'text-destructive' : undefined
        }
        isDefault={permission.isDefault}
        label={permissionLabel}
        name={`Permission: ${tool.name}`}
        onChoose={(value) =>
          editor.save({
            tools: [tool.name],
            permission: value === permissionDefault ? null : value,
          })
        }
        options={permissionOptions(permissionDefault)}
        search={`Permission for ${tool.name}`}
        selected={permission.value}
        title={valueTitle(permissionLabel, permission.isDefault)}
      />
      <ChoicePicker
        chosen={!callers.isDefault}
        disabled={busy}
        icon={callers.value ? CALLERS_ICON[callers.value] : ArrowLeftRightIcon}
        isDefault={callers.isDefault && Boolean(callers.value)}
        label={callersLabel}
        name={`I/O: ${tool.name}`}
        onChoose={(value) =>
          editor.save({ tools: [tool.name], callers: value === callersDefault ? null : value })
        }
        options={callersOptions(callersDefault)}
        search={`I/O for ${tool.name}`}
        selected={callers.value || undefined}
        title={
          callers.value
            ? valueTitle(callersLabel, callers.isDefault)
            : "The plugin's default is known once a conversation loads the tool."
        }
      />
      <RowSlot editor={editor} mode={mode} status={status} tool={tool} />
    </li>
  );
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
  editor: ToolEditor;
}) {
  const rules = savedRules(tool);
  const outcome = tool.outcomes[mode];
  return (
    <span className="relative grid size-6 place-items-center">
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
              !status && '@max-[32rem]/tools:visible',
            )}
            title="Rules and reset"
            type="button"
          >
            <MoreIcon className="size-4 @max-[32rem]/tools:hidden" />
            <ChevronRightIcon className="hidden size-4 @max-[32rem]/tools:block" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel className="grid gap-1 text-xs font-normal whitespace-normal text-muted-foreground">
            <span className="font-mono text-foreground">{tool.name}</span>
            {tool.description ? <span>{tool.description}</span> : null}
            <span>
              {flagText(tool)}. {sourceText(tool)}.
            </span>
            {outcome ? (
              <span>
                In {modeLabel(mode)}: {OUTCOME_TITLE[outcome.direct]}. From a script:{' '}
                {OUTCOME_TITLE[outcome.script]}.
              </span>
            ) : null}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!tool.permission && !tool.configured_callers}
            onSelect={() => editor.save({ tools: [tool.name], permission: null, callers: null })}
          >
            Use defaults
          </DropdownMenuItem>
          {rules.map((rule, index) => {
            const text = ruleText(rule.action, rule.where, rule.path_pattern);
            return (
              <DropdownMenuItem
                key={`${rule.scope}:${rule.scope_id}:${rule.action}:${index}`}
                onSelect={() => editor.removeRule(tool.name, rule)}
              >
                <span className="truncate" title={`Remove rule: ${text}`}>
                  Remove rule: {text}
                </span>
              </DropdownMenuItem>
            );
          })}
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

function GroupRow({
  section,
  open,
  onToggle,
  editor,
}: {
  section: ToolTableSection;
  open: boolean;
  onToggle: () => void;
  editor: ToolEditor;
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
  const busy = names.some((name) => editor.busy.has(name));
  const hasTools = names.length > 0;
  const meta =
    section.meta ??
    (section.count === undefined
      ? []
      : [`${section.count} ${section.count === 1 ? 'tool' : 'tools'}`]);
  const changed = section.tools.some((tool) => tool.permission || tool.configured_callers);
  return (
    <div className={cn(COLUMNS, 'group/group mt-1.5 min-h-10 py-1')} data-tool-group={section.id}>
      {hasTools ? (
        <button
          aria-expanded={open}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${section.title}`}
          className="grid size-5 place-items-center rounded text-muted-foreground outline-none hover:bg-hover hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
          onClick={onToggle}
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
          <ChevronRightIcon className="size-3.5" />
        </span>
      )}
      <span className="grid min-w-0 gap-0.5">
        <h3 className="truncate text-[13px] font-semibold text-foreground" title={section.hint}>
          {section.title}
        </h3>
        {section.notice || meta.length ? (
          <span className="flex min-w-0 gap-3 text-xs whitespace-nowrap text-faint">
            {section.notice ? (
              <span className="truncate" title={section.notice.title ?? section.notice.text}>
                {section.notice.text}
              </span>
            ) : (
              meta.map((part) => (
                <span className="truncate first:shrink-0" key={part}>
                  {part}
                </span>
              ))
            )}
          </span>
        ) : null}
      </span>
      {section.notice ? (
        <span className="col-[3/-1] flex min-w-0" title={section.notice.title}>
          <StatusIndicator
            className={cn('text-[12px]', section.notice.tone === 'idle' && 'text-faint')}
            label={section.notice.status}
            tone={section.notice.tone}
          />
        </span>
      ) : hasTools ? (
        <>
          <span className={MODE_CELL} />
          <span className={SCRIPT_CELL} />
          <ChoicePicker<ToolPermission | 'default'>
            bulk
            chosen={permission !== 'mixed' && permission !== 'default'}
            disabled={busy}
            icon={
              permission === 'mixed' || permission === 'default'
                ? AdjustIcon
                : PERMISSION_ICON[permission]
            }
            label={permissionLabel}
            name={`Permission: ${section.bulkLabel}`}
            onChoose={(value) =>
              editor.save({ tools: names, permission: value === 'default' ? null : value })
            }
            options={[PER_TOOL, ...permissionOptions()]}
            search={`Permission for ${section.bulkLabel.toLowerCase()}`}
            selected={permission === 'mixed' ? undefined : permission}
            title={bulkTitle(permission, permissionLabel)}
          />
          <ChoicePicker<ToolCallers | 'default'>
            bulk
            chosen={callers !== 'mixed' && callers !== 'default'}
            disabled={busy}
            icon={callers === 'mixed' || callers === 'default' ? AdjustIcon : CALLERS_ICON[callers]}
            label={callersLabel}
            name={`I/O: ${section.bulkLabel}`}
            onChoose={(value) =>
              editor.save({ tools: names, callers: value === 'default' ? null : value })
            }
            options={[PER_TOOL, ...callersOptions()]}
            search={`I/O for ${section.bulkLabel.toLowerCase()}`}
            selected={callers === 'mixed' ? undefined : callers}
            title={bulkTitle(callers, callersLabel)}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                className="invisible group-hover/group:visible focus-visible:visible data-[state=open]:visible"
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
        </>
      ) : null}
    </div>
  );
}

/**
 * Permission and I/O per tool, in groups: one row per tool with its flag, what
 * a call does in the chosen approval mode, and its two choices. Folds by its
 * own width, so the same table serves Settings and a plugin's detail pane.
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
  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <TooltipProvider disableHoverableContent>
      <div
        aria-label={label}
        className="@container/tools min-w-0"
        data-slot="tools-table"
        role="group"
      >
        <HeaderRow mode={mode} />
        {sections.map((section) => {
          const open = !collapsed.has(section.id);
          return (
            <section aria-label={section.title} key={section.id}>
              <GroupRow
                editor={editor}
                onToggle={() => toggle(section.id)}
                open={open}
                section={section}
              />
              {open && section.tools.length ? (
                <ul className="grid" aria-label={`${section.title} tools`}>
                  {section.tools.map((tool) => (
                    <ToolRow editor={editor} key={tool.name} mode={mode} tool={tool} />
                  ))}
                </ul>
              ) : null}
            </section>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
