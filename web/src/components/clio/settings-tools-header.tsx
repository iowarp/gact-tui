import { ArrowLeftRightIcon, LockIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { CALLERS_TEXT, modeLabel } from './plugin-tool-settings-text';
import { CALLERS, CALLERS_ICON, COLUMNS, MODE_CELL, SCRIPT_CELL } from './settings-tools-columns';
import { ValueMark } from './settings-tools-picker';

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
      <b className="font-medium">Programmatic tool calling: who calls the tool</b>
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

/** The sticky column titles, each naming its column on hover. */
export function HeaderRow({ mode }: { mode: string }) {
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
