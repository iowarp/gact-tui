import type { ComponentType } from 'react';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ToolbarAction } from './viewer-toolbar';

export interface FileMode {
  value: string;
  label: string;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
}

/** File representations use one responsive control in the owning toolbar. */
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
          className="h-7 shrink-0 gap-0.5 bg-transparent p-0 @max-[480px]/viewer:hidden"
        >
          {modes.map(({ value, label, icon: Icon }) => (
            <Tooltip key={value}>
              <TooltipTrigger asChild>
                <TabsTrigger aria-label={label} className="size-7 flex-none p-0" value={value}>
                  <Icon aria-hidden="true" />
                  <span className="sr-only">{label}</span>
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">{label}</TooltipContent>
            </Tooltip>
          ))}
        </TabsList>
      </TooltipProvider>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <ToolbarAction label={label} className="@min-[480px]/viewer:hidden">
            <ActiveIcon aria-hidden="true" />
          </ToolbarAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
            {modes.map(({ value, label, icon: Icon }) => (
              <DropdownMenuRadioItem key={value} value={value}>
                <Icon aria-hidden="true" />
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
