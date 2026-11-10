import { useId, useRef, useState } from 'react';
import type { SessionExportMode } from '@clio/core/v3';
import { BoxIcon, CheckIcon, ChevronDownIcon, DownloadIcon, FileTextIcon } from 'lucide-react';
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { KeyMenuItem } from './menu-key-items';
import { selectMenuKey } from './select-menu-key';

const SUBMENU_WIDTH = 260;
/** Below this a 260px submenu cannot sit beside its 290px parent, so Export opens in place. */
const INLINE_BELOW = 600;

/**
 * HTML is the transcript alone. ZIP carries the transcript plus the chosen
 * files; workspace files imply the agent's artifacts.
 */
export function SessionExportMenu({ onExport }: { onExport: (mode: SessionExportMode) => void }) {
  const [effects, setEffects] = useState(true);
  const [full, setFull] = useState(false);
  const trigger = useRef<HTMLDivElement>(null);
  const [sideOffset, setSideOffset] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const options = (
    <>
      <DropdownMenuLabel>Transcript is always included</DropdownMenuLabel>
      <ExportOption
        checked={effects}
        description="files the agent made"
        label="Artifacts"
        onCheckedChange={(value) => {
          setEffects(value);
          if (!value) setFull(false);
        }}
      />
      <ExportOption
        checked={full}
        description="can be large"
        label="Workspace files"
        onCheckedChange={(value) => {
          setFull(value);
          if (value) setEffects(true);
        }}
      />
      <DropdownMenuSeparator />
      <KeyMenuItem
        icon={FileTextIcon}
        label="Download HTML"
        menuKey="H"
        onSelect={() => onExport('transcript')}
      />
      <KeyMenuItem
        disabled={!effects}
        icon={BoxIcon}
        label="Download ZIP"
        menuKey="Z"
        onSelect={() => onExport(full ? 'full' : 'effects')}
      />
    </>
  );
  if (window.innerWidth < INLINE_BELOW) {
    // A phone has no room beside the menu: the options open under Export
    // instead of covering the rows they belong to.
    return (
      <>
        <DropdownMenuItem
          aria-expanded={expanded}
          className="whitespace-nowrap"
          onKeyDown={(event) => {
            // Same keys as a submenu: Right opens the options, Left folds them.
            if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
              event.preventDefault();
              setExpanded(event.key === 'ArrowRight');
            }
          }}
          onSelect={(event) => {
            event.preventDefault();
            setExpanded((open) => !open);
          }}
        >
          <DownloadIcon aria-hidden="true" className="text-muted-foreground" />
          Export
          <ChevronDownIcon
            aria-hidden="true"
            className={cn('ml-auto text-muted-foreground', expanded && 'rotate-180')}
          />
        </DropdownMenuItem>
        {expanded ? (
          <div aria-label="Export" className="ml-2 border-l border-border pl-1" role="group">
            {options}
          </div>
        ) : null}
      </>
    );
  }
  return (
    <DropdownMenuSub
      onOpenChange={(open) => {
        if (!open || !trigger.current) return;
        const bounds = trigger.current.getBoundingClientRect();
        // Radix flips a submenu; if neither side has room, overlap the parent
        // rather than clip the export options.
        const padding = 8;
        const right = window.innerWidth - bounds.right - padding;
        const left = bounds.left - padding;
        setSideOffset(right < SUBMENU_WIDTH && left < SUBMENU_WIDTH ? right - SUBMENU_WIDTH : 0);
      }}
    >
      <DropdownMenuSubTrigger className="whitespace-nowrap" ref={trigger}>
        <DownloadIcon aria-hidden="true" className="text-muted-foreground" />
        Export
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent
        className="w-[260px] max-w-[calc(100vw-1rem)]"
        onKeyDown={selectMenuKey}
        sideOffset={sideOffset}
      >
        {options}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function ExportOption({
  checked,
  label,
  description,
  onCheckedChange,
}: {
  checked: boolean;
  label: string;
  description: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <DropdownMenuCheckboxItem
      aria-describedby={`${id}-description`}
      aria-labelledby={`${id}-label`}
      checked={checked}
      className="pr-2 whitespace-nowrap [&>[data-slot=dropdown-menu-checkbox-item-indicator]]:hidden"
      onCheckedChange={(value) => onCheckedChange(value === true)}
      onSelect={(event) => event.preventDefault()}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-[4px] border',
          checked
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-input dark:bg-input/30',
        )}
      >
        {checked ? <CheckIcon className="size-3.5" /> : null}
      </span>
      <span id={`${id}-label`}>{label}</span>
      <span className="min-w-0 truncate text-muted-foreground" id={`${id}-description`}>
        {description}
      </span>
    </DropdownMenuCheckboxItem>
  );
}
