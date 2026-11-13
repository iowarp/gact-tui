import type { ToolCallers, ToolOutcome, ToolPermission, ToolSetting } from '@clio/core/v3';
import { ArrowLeftRightIcon, CheckIcon, CircleAlertIcon } from 'lucide-react';
import { memo } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreIcon } from '@/lib/icon-vocabulary';
import { moveAcrossCells } from '@/lib/settings-row-keys';
import { cn } from '@/lib/utils';
import {
  CALLERS_TEXT,
  OUTCOME_TEXT,
  OUTCOME_TITLE,
  OUTCOME_TONE,
  PERMISSION_TEXT,
  SCRIPT_OUTCOME_TEXT,
  defaultCallers,
  defaultPermission,
  effectiveCallers,
  effectivePermission,
  flagText,
  modeLabel,
  ruleText,
  savedRules,
  sourceText,
} from './plugin-tool-settings-text';
import { StatusIndicator } from './primitives/status-indicator';
import { statusWordClass } from './primitives/status-word-tone';
import type { RowStatus } from './settings-tools-editor';
import { ChoicePicker, SummaryPicker, type PickerAction } from './settings-tools-picker';
import {
  CALLERS_ICON,
  COLUMNS,
  MODE_CELL,
  NARROW_ONLY,
  PERMISSION_ICON,
  SCRIPT_CELL,
  WIDE,
  type ToolsFold,
} from './settings-tools-columns';
import {
  callersOptions,
  permissionOptions,
  toolKind,
  valueTitle,
  type RowEditor,
} from './settings-tools-options';
import { ValueSummary } from './settings-tools-value-summary';
import { t, ph } from '@lingui/core/macro';

export function Outcome({ value, className }: { value: ToolOutcome; className?: string }) {
  return (
    <span className={cn('flex min-w-0', className)} title={OUTCOME_TITLE[value]}>
      <StatusIndicator
        className={cn(
          value === 'covered' && 'text-info',
          value === 'unavailable' && 'text-muted-foreground',
          'text-meta',
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
        className={cn('text-xs', !statusWordClass(OUTCOME_TONE[value]) && 'text-muted-foreground')}
        label={text}
        tone={OUTCOME_TONE[value]}
      />
    </span>
  );
}

export const ToolRow = memo(function ToolRow({
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
  onOpen,
  selected = false,
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
  /** Opens the tool's details; its name becomes the button. Keep it stable: rows are memoized. */
  onOpen?: (tool: ToolSetting) => void;
  /** Its details are open. */
  selected?: boolean;
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
  const callersLabel = callers.value ? CALLERS_TEXT[callers.value].label : t`Unknown`;
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
        selected && 'bg-hover hover:bg-hover',
      )}
      data-index={index}
      data-selected={selected || undefined}
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
        {onOpen ? (
          <button
            aria-current={selected || undefined}
            aria-label={t`Details for ${ph({ tool: tool.name })}`}
            // Above the narrow picker's row-wide hit area, so the name still opens details.
            className="relative z-10 min-w-0 cursor-pointer justify-self-start truncate rounded-[3px] text-left font-mono text-menu font-medium text-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            data-tool-open=""
            onClick={() => onOpen(tool)}
            title={tool.description ? `${tool.name}: ${tool.description}` : tool.name}
            type="button"
          >
            {tool.name}
          </button>
        ) : (
          <span
            className="truncate font-mono text-menu font-medium text-foreground"
            title={tool.description ? `${tool.name}: ${tool.description}` : tool.name}
          >
            {tool.name}
          </span>
        )}
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
          <span className="flex h-[21px] min-w-0 flex-wrap gap-x-3 gap-y-2 overflow-hidden text-xs whitespace-nowrap text-muted-foreground @min-[44rem]/tools:h-auto @min-[44rem]/tools:flex-nowrap">
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
                    ? t`Agent can't call it`
                    : byRule
                      ? t`${ph({ outcome: OUTCOME_TEXT[outcome.direct] })} by a rule`
                      : OUTCOME_TEXT[outcome.direct]
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
          name={t`Permission: ${ph({ name: tool.name })}`}
          onChoose={choosePermission}
          options={permissionOptions(permissionDefault)}
          search={t`Permission for ${ph({ name: tool.name })}`}
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
          name={t`I/O: ${ph({ name: tool.name })}`}
          onChoose={chooseCallers}
          options={callersOptions(callersDefault)}
          search={t`I/O for ${ph({ name: tool.name })}`}
          selected={callers.value || undefined}
          title={
            callers.value
              ? valueTitle(callersLabel, callers.isDefault)
              : t`The plugin's default is known once a conversation loads the tool.`
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
              heading: t`Permission`,
              options: permissionOptions(permissionDefault),
              selected: permission.value,
              onChoose: (value) => choosePermission(value as ToolPermission),
            },
            {
              heading: t`I/O`,
              options: callersOptions(callersDefault),
              selected: callers.value || undefined,
              onChoose: (value) => chooseCallers(value as ToolCallers),
            },
          ]}
          name={t`Permission and I/O: ${ph({ name: tool.name })}`}
          search={t`Choices for ${ph({ name: tool.name })}`}
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
      <span>{t`${ph({ flags: flagText(tool) })}. ${ph({ source: sourceText(tool) })}.`}</span>
      {outcome ? (
        <span>
          {t`In ${ph({ mode: modeLabel(mode) })}: ${ph({ direct: OUTCOME_TITLE[outcome.direct] })}. From a script: ${ph({ script: OUTCOME_TITLE[outcome.script] })}.`}
        </span>
      ) : null}
    </>
  );
}

/** Use defaults, then each saved rule's removal. */
function rowActions(tool: ToolSetting, editor: RowEditor): PickerAction[] {
  return [
    {
      label: t`Use defaults`,
      disabled: !tool.permission && !tool.configured_callers,
      onSelect: () => editor.save({ tools: [tool.name], permission: null, callers: null }),
    },
    ...savedRules(tool).map((rule) => ({
      label: t`Remove rule: ${ph({ rule: ruleText(rule.action, rule.where, rule.path_pattern) })}`,
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
          aria-label={t`Saved`}
          className="grid place-items-center text-primary group-hover/row:invisible group-has-[:focus-visible]/row:invisible"
          role="status"
          title={t`Saved`}
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
            aria-label={t`More for ${ph({ name: tool.name })}`}
            className={cn(
              'absolute inset-0 grid place-items-center rounded-md text-muted-foreground outline-none hover:bg-hover hover:text-foreground focus-visible:visible focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:visible',
              'invisible group-hover/row:visible',
            )}
            title={t`Rules and reset`}
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
