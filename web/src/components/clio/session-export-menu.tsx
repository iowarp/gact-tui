import { useRef, useState } from 'react';
import type { SessionExportMode } from '@clio/core/v3';
import { CheckIcon, DownloadIcon } from 'lucide-react';
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';

/** Transcript is the default; workspace inclusion implies session effects. */
export function SessionExportMenu({ onExport }: { onExport: (mode: SessionExportMode) => void }) {
  const [effects, setEffects] = useState(false);
  const [full, setFull] = useState(false);
  const trigger = useRef<HTMLDivElement>(null);
  const [sideOffset, setSideOffset] = useState(0);
  const mode: SessionExportMode = full ? 'full' : effects ? 'effects' : 'transcript';
  return (
    <DropdownMenuSub
      onOpenChange={(open) => {
        if (!open || !trigger.current) return;
        const bounds = trigger.current.getBoundingClientRect();
        // Radix flips a submenu but cannot fit it beside its parent on a phone.
        // In that case overlap the parent, retaining the full export options.
        const width = 288;
        const padding = 8;
        const right = window.innerWidth - bounds.right - padding;
        const left = bounds.left - padding;
        setSideOffset(right < width && left < width ? right - width : 0);
      }}
    >
      <DropdownMenuSubTrigger ref={trigger}>
        <DownloadIcon aria-hidden="true" /> Export session
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent
        className="w-72 max-w-[calc(100vw-1rem)]"
        collisionPadding={8}
        sideOffset={sideOffset}
      >
        <DropdownMenuLabel>Transcript included</DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          className="pr-2 [&>[data-slot=dropdown-menu-checkbox-item-indicator]]:hidden"
          checked={effects}
          onSelect={(event) => event.preventDefault()}
          onCheckedChange={(value) => {
            setEffects(value === true);
            if (!value) setFull(false);
          }}
        >
          <span
            aria-hidden="true"
            className="flex size-4 items-center justify-center rounded-sm border border-current"
          >
            {effects ? <CheckIcon className="size-3" /> : null}
          </span>
          Include session artifacts
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          className="pr-2 [&>[data-slot=dropdown-menu-checkbox-item-indicator]]:hidden"
          checked={full}
          onSelect={(event) => event.preventDefault()}
          onCheckedChange={(value) => {
            setFull(value === true);
            if (value) setEffects(true);
          }}
        >
          <span
            aria-hidden="true"
            className="flex size-4 items-center justify-center rounded-sm border border-current"
          >
            {full ? <CheckIcon className="size-3" /> : null}
          </span>
          Include workspace files
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onExport(mode)}>
          <DownloadIcon aria-hidden="true" /> Download {mode === 'transcript' ? 'HTML' : 'ZIP'}
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
