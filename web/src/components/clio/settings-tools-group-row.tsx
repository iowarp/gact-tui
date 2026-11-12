import type { ToolCallers, ToolPermission } from '@clio/core/v3';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { memo } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { AdjustIcon, MoreIcon, RetryIcon } from '@/lib/icon-vocabulary';
import { moveAcrossCells } from '@/lib/settings-row-keys';
import { cn } from '@/lib/utils';
import {
  CALLERS_TEXT,
  PERMISSION_TEXT,
  callersChoice,
  permissionChoice,
} from './plugin-tool-settings-text';
import { IconButton } from './primitives/icon-button';
import { StatusIndicator } from './primitives/status-indicator';
import { ChoicePicker, SummaryPicker } from './settings-tools-picker';
import {
  CALLERS_ICON,
  COLUMNS,
  MODE_CELL,
  NARROW_ONLY,
  PERMISSION_ICON,
  SCRIPT_CELL,
  WIDE,
} from './settings-tools-columns';
import { callersOptions, permissionOptions, type RowEditor } from './settings-tools-options';
import type { ToolTableSection } from './settings-tools-section';
import { ValueSummary } from './settings-tools-value-summary';

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

export const GroupRow = memo(function GroupRow({
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
        <h3 className="truncate text-ui font-semibold text-foreground" title={section.hint}>
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
            className={cn('text-meta', section.notice.tone === 'idle' && 'text-faint')}
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
