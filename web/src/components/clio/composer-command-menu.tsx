import type { CommandDefinition } from '@clio/core/v3';
import { SquareSlashIcon } from 'lucide-react';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { commandGroups, commandMatches, commandSource } from '@/lib/command-table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { MenuKeyHints } from './primitives/menu-key-hints';
import { ShortcutKeys } from './primitives/key-chip';
import { publishActiveOption } from './composer-reference-controller-active-option';
import {
  COMPOSER_GROUP_HEADING,
  ComposerSuggestionPopup,
  Highlighted,
  MatchCount,
  ROW_CUT_SLOT,
  SuggestionDetail,
  useHoveredRow,
} from './composer-suggestion-popup';

function StatusNote({ label, detail }: { label: string; detail: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="shrink-0 rounded-[4px] bg-muted px-[5px] py-px text-[10.5px] font-medium text-muted-foreground">
            {label}
          </span>
        </TooltipTrigger>
        <TooltipContent>{detail}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** The row's state in words, with its reason on hover: never an unexplained icon. */
export function CommandStatus({ command }: { command: CommandDefinition }): ReactNode {
  const detail = command.disabled_detail || command.disabled_reason || '';
  if (command.disabled_reason === 'command_shadowed')
    return (
      <StatusNote
        detail={detail || 'Another command file of the same name wins.'}
        label="Shadowed"
      />
    );
  if (command.disabled_reason === 'command_name_reserved')
    return (
      <StatusNote
        detail={detail || 'A built-in command already has this name.'}
        label="Reserved name"
      />
    );
  if (!command.enabled)
    // A specific reason reads inline in the row; only a bare one gets the tag.
    return detail ? null : <StatusNote detail="This command cannot run." label="Unavailable" />;
  if (command.ambiguous)
    return (
      <StatusNote
        detail={`Another source also has ${command.name}; this one runs as ${command.qualified_id}.`}
        label="Same name elsewhere"
      />
    );
  if (command.unsupported_fields.length)
    return (
      <StatusNote
        detail={`This file’s ${command.unsupported_fields.join(', ')} settings are not used.`}
        label="Some fields ignored"
      />
    );
  return null;
}

const keepFocus = (event: MouseEvent) => event.preventDefault();

const KEY_HINTS = [
  { id: 'menu-fill', label: 'Fill' },
  { id: 'menu-pick', label: 'Run' },
  { id: 'menu-close', label: 'Close' },
] as const;

const commandKey = (command: CommandDefinition) =>
  `${command.kind}:${command.qualified_id}:${command.source}`;

const NAMED_STATES = new Set(['command_shadowed', 'command_name_reserved']);

/** The faint words after a command's id: its title, or what it does. */
function commandDetail(command: CommandDefinition): string {
  // Shadowed and reserved rows say so in their tag, with the reason on hover;
  // any other unavailable command gives its reason here.
  if (!command.enabled)
    return NAMED_STATES.has(command.disabled_reason ?? '')
      ? ''
      : command.disabled_detail || command.disabled_reason || '';
  if (command.title && command.title !== command.id) return command.title;
  return command.description || command.argument_hint || '';
}

/** Everything about the command beyond its id, one part per line of its tooltip. */
function commandSummaryParts(command: CommandDefinition): string[] {
  return [command.title, command.argument_hint, command.description]
    .map((part) => part?.trim() ?? '')
    .filter((part, index, parts) => part && part !== command.id && parts.indexOf(part) === index);
}

/** The parts as one line of prose: each ends as a sentence, with no decorative joins. */
function asSentences(parts: readonly string[]): string {
  return parts
    .map((part, index) =>
      index < parts.length - 1 && !/[.!?…:;]$/u.test(part) ? `${part}.` : part,
    )
    .join(' ');
}

const CommandOption = memo(function CommandOption({
  active,
  command,
  id,
  onHover,
  onPick,
  query,
}: {
  active: boolean;
  command: CommandDefinition;
  id: string;
  /** The pointer reached this row, so the detail strip shows it. */
  onHover: (key: string) => void;
  onPick: (command: CommandDefinition) => void;
  /** What follows the typed `/`, marked in the name. */
  query: string;
}) {
  const source = commandSource(command);
  const detail = commandDetail(command);
  const status = CommandStatus({ command });
  const summary = commandSummaryParts(command).join('\n');
  return (
    // The editor keeps focus and the keys; a press only picks.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events
    <div
      aria-disabled={!command.enabled || undefined}
      aria-label={`${command.title} ${command.id}`}
      aria-selected={active}
      className={cn(
        'flex h-[30px] min-w-0 cursor-default items-center gap-[9px] rounded-[7px] px-2 whitespace-nowrap',
        command.enabled && 'hover:bg-hover',
        active && 'bg-menu-highlight hover:bg-menu-highlight',
      )}
      id={id}
      onClick={command.enabled ? () => onPick(command) : undefined}
      onMouseDown={keepFocus}
      onMouseEnter={() => onHover(commandKey(command))}
      role="option"
      title={summary ? `${command.id}\n${summary}` : command.id}
    >
      <span
        className={cn(
          'shrink-0 font-mono text-[12px]',
          command.enabled ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        <Highlighted query={query} text={command.id.replace(/^\//u, '')} />
      </span>
      {detail ? (
        <span
          className="min-w-0 flex-1 basis-0 truncate text-[11.5px] text-faint"
          data-slot={ROW_CUT_SLOT}
        >
          {detail}
        </span>
      ) : null}
      {status || source || active ? (
        <span className="ml-auto flex shrink-0 items-center gap-[11px] pl-2 text-[11px] text-faint">
          {status}
          {source ? <span>{source}</span> : null}
          {active ? <ShortcutKeys id="menu-pick" variant="row" /> : null}
        </span>
      ) : null}
    </div>
  );
});

/** Whether the command list is the agent's yet: an empty menu says why it is empty. */
export type CommandListState = 'loading' | 'failed' | 'ready';

function EmptyCommands({
  available,
  query,
  state,
}: {
  available: number;
  query: string;
  state: CommandListState;
}) {
  const typed = query.replace(/^\//u, '');
  const reason =
    state === 'loading' ? (
      'Loading this agent’s commands…'
    ) : state === 'failed' ? (
      'This agent’s commands couldn’t be loaded. Delete the / to send a message.'
    ) : available === 0 ? (
      'This agent has no commands. Delete the / to send a message.'
    ) : typed ? (
      <>
        No command matches <b className="font-medium text-foreground">{typed}</b>.
      </>
    ) : (
      'No command matches.'
    );
  return (
    <div className="flex min-w-0 items-center gap-[9px] px-2.5 pt-4 pb-2 text-[12.5px] text-muted-foreground">
      <SquareSlashIcon aria-hidden="true" className="size-4 shrink-0 text-faint" />
      <span className="min-w-0">{reason}</span>
    </div>
  );
}

/**
 * The `/` menu above the composer: one line per command, grouped by where it
 * comes from. The editor keeps focus; the arrows move a highlight, Tab fills
 * the highlighted (or first) command so arguments can follow, Enter runs the
 * highlighted command (with none highlighted it still sends the message) and
 * Escape closes the menu until the command is edited.
 */
export function ClioComposerCommandMenu({
  commands,
  commandsState = 'ready',
  query,
  onPick,
  onRun,
  onOpenChange,
  popoverId,
}: {
  commands: readonly CommandDefinition[];
  commandsState?: CommandListState;
  query: string;
  /** Fills the command into the composer so arguments can follow (Tab, or a press). */
  onPick: (command: CommandDefinition) => void;
  /** Runs the highlighted command as it stands (Enter). */
  onRun: (command: CommandDefinition) => void;
  onOpenChange?: (open: boolean) => void;
  popoverId: string;
}) {
  const groups = useMemo(
    () => commandGroups(commands.filter((command) => commandMatches(command, query))),
    [commands, query],
  );
  const choices = useMemo(
    () => groups.flatMap((group) => group.rows).filter((command) => command.enabled),
    [groups],
  );
  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);
  // Both reset when the typed command changes.
  const [highlight, setHighlight] = useState({ key: '', query });
  const [dismissedQuery, setDismissedQuery] = useState<string | undefined>();
  const activeKey = highlight.query === query ? highlight.key : '';
  const open = dismissedQuery !== query;
  const optionId = (command: CommandDefinition) =>
    `${popoverId}-option-${encodeURIComponent(commandKey(command))}`;
  // The first runnable row is highlighted until the arrows move, so Enter runs it.
  const active = choices.find((command) => commandKey(command) === activeKey) ?? choices[0];
  const activeOptionId = open && active ? optionId(active) : undefined;

  useEffect(() => {
    publishActiveOption(popoverId, activeOptionId);
    if (activeOptionId)
      document.getElementById(activeOptionId)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeOptionId, popoverId]);
  useEffect(() => () => publishActiveOption(popoverId, undefined), [popoverId]);
  useEffect(() => onOpenChange?.(open), [onOpenChange, open]);

  const latest = useRef({ active, choices, onPick, onRun, open, query });
  useLayoutEffect(() => {
    latest.current = { active, choices, onPick, onRun, open, query };
  });

  // The editor's own key handler sends the message on Enter, so the menu's keys
  // are taken before it sees them, and only while the menu shows.
  useEffect(() => {
    const editor = document.querySelector<HTMLElement>(`[aria-controls="${popoverId}"]`);
    if (!editor) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const current = latest.current;
      if (!current.open || event.isComposing) return;
      const take = () => {
        event.preventDefault();
        event.stopPropagation();
      };
      if (event.key === 'Escape') {
        take();
        setDismissedQuery(current.query);
      } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && current.choices.length) {
        take();
        const at = current.active ? current.choices.indexOf(current.active) : -1;
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const next =
          at < 0 && step < 0
            ? current.choices.length - 1
            : (at + step + current.choices.length) % current.choices.length;
        const command = current.choices[next];
        if (command) setHighlight({ key: commandKey(command), query: current.query });
      } else if (event.key === 'Tab' && !event.shiftKey && current.choices.length) {
        take();
        current.onPick(current.active ?? current.choices[0]!);
      } else if (event.key === 'Enter' && !event.shiftKey && current.active) {
        take();
        current.onRun(current.active);
      }
    };
    editor.addEventListener('keydown', onKeyDown);
    return () => editor.removeEventListener('keydown', onKeyDown);
  }, [popoverId]);

  const dismiss = useCallback(() => setDismissedQuery(query), [query]);
  const hover = useHoveredRow();
  const described =
    groups
      .flatMap((group) => group.rows)
      .find((command) => commandKey(command) === hover.hovered) ?? active;
  const describedParts = described ? commandSummaryParts(described) : [];
  const describedDetail = described ? commandDetail(described) : '';

  if (!open) return null;
  return (
    <ComposerSuggestionPopup onDismiss={dismiss} popupId={popoverId}>
      <div className="flex h-10 min-w-0 shrink-0 items-center gap-1.5 pr-2 pl-3">
        <SquareSlashIcon
          aria-hidden="true"
          className="size-[15px] shrink-0 text-muted-foreground"
        />
        <span aria-hidden="true" className="min-w-0 flex-1 truncate text-[13px]">
          <span className="text-foreground">{query}</span>
          {query === '/' ? <span className="text-faint"> type to search</span> : null}
        </span>
        <MatchCount total={total} />
      </div>
      <div
        aria-label="Suggestions"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t px-1.5 pt-0.5 pb-1.5"
        onMouseLeave={hover.onLeave}
        role="listbox"
      >
        {total === 0 ? (
          <EmptyCommands available={commands.length} query={query} state={commandsState} />
        ) : null}
        {groups.map((group) => (
          <div aria-label={group.heading} key={group.heading} role="group">
            <div className={COMPOSER_GROUP_HEADING}>
              <span className="min-w-0 truncate">{group.heading}</span>
              <span className="ml-auto shrink-0 font-mono text-[10.5px] font-normal text-faint tabular-nums">
                {group.rows.length}
              </span>
            </div>
            {group.rows.map((command) => (
              <CommandOption
                active={command === active}
                command={command}
                id={optionId(command)}
                key={commandKey(command)}
                onHover={hover.onHover}
                onPick={onPick}
                query={query.replace(/^\//u, '')}
              />
            ))}
          </div>
        ))}
      </div>
      {described ? (
        <SuggestionDetail
          description={asSentences(describedParts)}
          mono
          more={describedParts.some((part) => part !== describedDetail)}
          name={described.id}
          rowId={optionId(described)}
        />
      ) : null}
      {total ? (
        <MenuKeyHints className="h-[34px] shrink-0 px-2.5 text-faint" hints={KEY_HINTS} />
      ) : null}
    </ComposerSuggestionPopup>
  );
}
