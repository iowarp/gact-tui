import { ChevronDownIcon } from 'lucide-react';
import { useMemo, useRef, type ComponentType, type RefObject } from 'react';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useShortcut, useShortcutPresentation } from '@/lib/shortcuts/hooks';
import { NamedTooltip } from './primitives/icon-button';
import { useFrameModes } from './primitives/frame-modes';
import { ShortcutKeys } from './primitives/key-chip';
import { ToolbarAction } from './viewer-toolbar';

export interface FileMode {
  value: string;
  label: string;
  /** A longer hover name than the label. */
  title?: string;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  /**
   * Catalog id of the key that switches to this mode from anywhere in the tab
   * (`render-source`, `lineage`). Its hover name, menu rows and binding all read it.
   */
  shortcut?: string;
}

/**
 * One mode as a checked menu row, with the key that works without the menu
 * in the right column (workbench-keyboard, "Menus show the key that works
 * anywhere"). The key is announced through `aria-keyshortcuts`.
 */
export function FileModeMenuItem({ mode }: { mode: FileMode }) {
  const keys = useShortcutPresentation(mode.shortcut);
  const Icon = mode.icon;
  return (
    <DropdownMenuRadioItem value={mode.value} aria-keyshortcuts={keys?.aria}>
      <Icon aria-hidden="true" />
      {mode.label}
      {mode.shortcut ? (
        <span aria-hidden="true" className="ml-auto pl-4">
          <ShortcutKeys id={mode.shortcut} />
        </span>
      ) : null}
    </DropdownMenuRadioItem>
  );
}

/**
 * A mode's key, focus anywhere in its frame (the bar and its body): it switches
 * to the mode, and from the mode back to the one it came from.
 */
function FileModeShortcut({
  id,
  target,
  modes,
  value,
  onChange,
  region,
}: {
  id: string;
  target: string;
  modes: readonly FileMode[];
  value: string;
  onChange: (value: string) => void;
  region: RefObject<Element | null>;
}) {
  const cameFrom = useRef<string | undefined>(undefined);
  useShortcut(
    id,
    () => {
      if (value !== target) {
        cameFrom.current = value;
        onChange(target);
        return;
      }
      const back =
        modes.find((mode) => mode.value === cameFrom.current && mode.value !== target) ??
        modes.find((mode) => mode.value !== target);
      if (back) onChange(back.value);
    },
    { region },
  );
  return null;
}

/**
 * The frame bar's Format: a file's representations as one segmented group of
 * named icons. When the frame bar folds @ away it folds too, to the active
 * icon with a chevron that lists them all; narrowest, they move into the
 * frame's … menu as a checked list (workbench-lineage step 6), when it has one
 * (`data-frame-modes-menu`).
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
  const anchor = useRef<HTMLSpanElement>(null);
  // The frame is the bar and its body: the bar's parent.
  const region = useMemo<RefObject<Element | null>>(
    () => ({
      get current() {
        return anchor.current?.closest('[data-slot="frame-bar"]')?.parentElement ?? null;
      },
    }),
    [],
  );
  useFrameModes(anchor, modes.length < 2 ? null : { modes, value, onChange, label });
  if (modes.length < 2) return null;
  const ActiveIcon = modes.find((mode) => mode.value === value)?.icon ?? modes[0].icon;
  return (
    <span ref={anchor} className="contents">
      {modes.map((mode) =>
        mode.shortcut ? (
          <FileModeShortcut
            key={mode.value}
            id={mode.shortcut}
            target={mode.value}
            modes={modes}
            value={value}
            onChange={onChange}
            region={region}
          />
        ) : null,
      )}
      <TooltipProvider delayDuration={200}>
        <TabsList
          aria-label={label}
          data-slot="viewer-modes"
          className="inline-flex h-7 flex-none shrink-0 justify-start gap-px rounded-[7px] border border-input bg-transparent p-[2px] group-data-horizontal/tabs:h-7 group-data-[fold-modes]/frame:hidden"
        >
          {modes.map(({ value: mode, label: modeLabel, title, icon: Icon, shortcut }) => (
            <NamedTooltip key={mode} label={title || modeLabel} shortcut={shortcut}>
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
            className="hidden w-9 gap-0.5 group-data-[fold-modes]/frame:inline-flex [[data-fold-modes-menu]:has([data-frame-modes-menu])_&]:hidden"
          >
            <ActiveIcon aria-hidden="true" />
            <ChevronDownIcon aria-hidden="true" className="!size-2.5" />
          </ToolbarAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
            {modes.map((mode) => (
              <FileModeMenuItem key={mode.value} mode={mode} />
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}
