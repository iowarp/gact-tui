import { ChevronDownIcon } from 'lucide-react';
import { useContext, useEffect, useId, useMemo, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useShortcutPresentation } from '@/lib/shortcuts/hooks';
import { cn } from '@/lib/utils';
import { NamedTooltip } from './primitives/icon-button';
import { ToolbarAction } from './viewer-toolbar';
import {
  FileViewerModeSlotContext,
  isSourceMode,
  type FileViewerModeSlot,
} from './file-viewer-modes';

export interface FileMode {
  value: string;
  label: string;
  /** A longer hover name than the label. */
  title?: string;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  /** Catalog id of the key that selects it. */
  shortcut?: string;
}

/** The bordered segment that holds a file's modes. */
export const MODE_SEGMENT_CLASS =
  'inline-flex h-7 flex-none shrink-0 justify-start gap-px rounded-[7px] border border-input bg-transparent p-[2px]';
const MODE_TRIGGER_CLASS =
  'h-[22px] w-[26px] flex-none rounded-[5px] border-0 px-0 text-muted-foreground shadow-none hover:bg-hover hover:text-foreground data-[state=active]:bg-menu-highlight data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-menu-highlight';

/** One mode: its icon, its hover name and its key. */
export function FileModeTrigger({
  mode,
  inactive = false,
  onClick,
}: {
  mode: FileMode;
  /** The frame shows another view: the renderer's chosen mode is not the one shown. */
  inactive?: boolean;
  onClick?: () => void;
}) {
  const { value, label, title, icon: Icon, shortcut } = mode;
  return (
    <NamedTooltip label={title || label} shortcut={shortcut}>
      {/* The tooltip trigger sets its own data-state; keep it off the tab. */}
      <span className="inline-flex">
        <TabsTrigger
          className={MODE_TRIGGER_CLASS}
          value={value}
          aria-label={label}
          onClick={onClick}
          {...(inactive ? { 'aria-selected': false, 'data-state': 'inactive' } : {})}
        >
          <Icon aria-hidden="true" className="size-3.5" />
        </TabsTrigger>
      </span>
    </NamedTooltip>
  );
}

/** A mode's key, as its folded menu row shows it. */
function ModeShortcut({ id }: { id?: string }) {
  const presentation = useShortcutPresentation(id);
  return presentation ? <DropdownMenuShortcut>{presentation.text}</DropdownMenuShortcut> : null;
}

/** The modes folded into the active icon with a chevron that lists them all. */
export function FoldedFileModes({
  modes,
  value,
  onChange,
  label,
}: {
  modes: readonly FileMode[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const ActiveIcon = modes.find((mode) => mode.value === value)?.icon ?? modes[0].icon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ToolbarAction
          label={label}
          data-modes-folded=""
          className="hidden w-9 gap-0.5 group-data-[fold-modes]/frame:inline-flex"
        >
          <ActiveIcon aria-hidden="true" />
          <ChevronDownIcon aria-hidden="true" className="!size-2.5" />
        </ToolbarAction>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {modes.map(({ value: mode, label: modeLabel, icon: Icon, shortcut }) => (
            <DropdownMenuRadioItem key={mode} value={mode}>
              <Icon aria-hidden="true" />
              {modeLabel}
              <ModeShortcut id={shortcut} />
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The frame bar's Format: a file's representations as one segmented group of
 * named icons. When the frame bar folds @ away it folds too, to the active
 * icon with a chevron that lists them all. Inside a file viewer the renderer's
 * modes join the frame's segment, beside the frame's own Lineage.
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
  const slot = useContext(FileViewerModeSlotContext);
  if (slot)
    return (
      <LiftedModes slot={slot} modes={modes} value={value} onChange={onChange} label={label} />
    );
  if (modes.length < 2) return null;
  return (
    <>
      <TooltipProvider delayDuration={200}>
        <TabsList
          aria-label={label}
          data-slot="viewer-modes"
          className={cn(
            MODE_SEGMENT_CLASS,
            'group-data-horizontal/tabs:h-7 group-data-[fold-modes]/frame:hidden',
          )}
        >
          {modes.map((mode) => (
            <FileModeTrigger key={mode.value} mode={mode} />
          ))}
        </TabsList>
      </TooltipProvider>
      <FoldedFileModes modes={modes} value={value} onChange={onChange} label={label} />
    </>
  );
}

/** The renderer's tabs, drawn inside the frame's segment and listed in its fold. */
function LiftedModes({
  slot,
  modes,
  value,
  onChange,
  label,
}: {
  slot: FileViewerModeSlot;
  modes: readonly FileMode[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const id = useId();
  const { register, host, frameActive, showRenderer } = slot;
  // Source answers to the frame's Render/Source key.
  const keyed = useMemo(
    () =>
      modes.map((mode) =>
        isSourceMode(mode) && !mode.shortcut ? { ...mode, shortcut: 'render-source' } : mode,
      ),
    [modes],
  );
  const entry = useMemo(() => ({ modes: keyed, value, onChange }), [keyed, value, onChange]);
  useEffect(() => register(id, entry), [register, id, entry]);
  useEffect(() => () => register(id), [register, id]);
  if (!host) return null;
  return createPortal(
    <TabsList
      aria-label={label}
      data-slot="renderer-modes"
      className="inline-flex h-auto gap-px bg-transparent p-0 group-data-horizontal/tabs:h-auto"
    >
      {keyed.map((mode) => (
        <FileModeTrigger
          key={mode.value}
          mode={mode}
          inactive={frameActive}
          onClick={showRenderer}
        />
      ))}
    </TabsList>,
    host,
  );
}
