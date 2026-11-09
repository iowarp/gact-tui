import { ChevronDownIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NamedTooltip } from './primitives/icon-button';
import { ToolbarAction } from './viewer-toolbar';

export interface FileMode {
  value: string;
  label: string;
  /** A longer hover name than the label. */
  title?: string;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
}

/**
 * The frame bar's Format: a file's representations as one segmented group of
 * named icons. When the frame bar folds @ away it folds too, to the active
 * icon with a chevron that lists them all.
 */
export function FileModeControls({
  modes,
  value,
  onChange,
  label = 'File representations',
}: {
  modes: readonly FileMode[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  if (modes.length < 2) return null;
  const ActiveIcon = modes.find((mode) => mode.value === value)?.icon ?? modes[0].icon;
  return (
    <>
      <TooltipProvider delayDuration={200}>
        <TabsList
          aria-label={label}
          data-slot="viewer-modes"
          className="inline-flex h-7 flex-none shrink-0 justify-start gap-px rounded-[7px] border border-input bg-transparent p-[2px] group-data-horizontal/tabs:h-7 group-data-[fold-talk]/frame:hidden"
        >
          {modes.map(({ value: mode, label: modeLabel, title, icon: Icon }) => (
            <NamedTooltip key={mode} label={title || modeLabel}>
              {/* The tooltip trigger sets its own data-state; keep it off the tab. */}
              <span className="inline-flex">
                <TabsTrigger
                  className="h-[22px] w-[26px] flex-none rounded-[5px] border-0 px-0 text-muted-foreground shadow-none hover:bg-hover hover:text-foreground data-[state=active]:bg-menu-highlight data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-menu-highlight"
                  value={mode}
                  aria-label={modeLabel}
                >
                  <Icon aria-hidden="true" className="size-3.5" />
                </TabsTrigger>
              </span>
            </NamedTooltip>
          ))}
        </TabsList>
      </TooltipProvider>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <ToolbarAction
            label={label}
            data-modes-folded=""
            className="hidden w-9 gap-0.5 group-data-[fold-talk]/frame:inline-flex"
          >
            <ActiveIcon aria-hidden="true" />
            <ChevronDownIcon aria-hidden="true" className="!size-2.5" />
          </ToolbarAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
            {modes.map(({ value: mode, label: modeLabel, icon: Icon }) => (
              <DropdownMenuRadioItem key={mode} value={mode}>
                <Icon aria-hidden="true" />
                {modeLabel}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
