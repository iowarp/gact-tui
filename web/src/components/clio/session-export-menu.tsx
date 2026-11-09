import { useId, useRef, useState } from 'react';
import type { SessionExportMode } from '@clio/core/v3';
import { CheckIcon, DownloadIcon, FileTextIcon, PackageIcon } from 'lucide-react';
import {
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { KeyMenuItem } from './menu-key-items';
import { selectMenuKey } from './select-menu-key';

/**
 * HTML is the transcript alone. ZIP carries the transcript plus the chosen
 * files; workspace files imply the agent's artifacts.
 */
export function SessionExportMenu({ onExport }: { onExport: (mode: SessionExportMode) => void }) {
  const [effects, setEffects] = useState(true);
  const [full, setFull] = useState(false);
  const trigger = useRef<HTMLDivElement>(null);
  const [sideOffset, setSideOffset] = useState(0);
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
      <DropdownMenuSubTrigger className="whitespace-nowrap" ref={trigger}>
        <DownloadIcon aria-hidden="true" /> Export
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent
        className="w-72 max-w-[calc(100vw-1rem)]"
        collisionPadding={8}
        onKeyDown={selectMenuKey}
        sideOffset={sideOffset}
      >
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
          icon={<FileTextIcon aria-hidden="true" />}
          label="Download HTML"
          menuKey="H"
          onSelect={() => onExport('transcript')}
        />
        <KeyMenuItem
          disabled={!effects}
          icon={<PackageIcon aria-hidden="true" />}
          label="Download ZIP"
          menuKey="Z"
          onSelect={() => onExport(full ? 'full' : 'effects')}
        />
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
        className="flex size-4 shrink-0 items-center justify-center rounded-sm border border-current"
      >
        {checked ? <CheckIcon className="size-3" /> : null}
      </span>
      <span id={`${id}-label`}>{label}</span>
      <span className="min-w-0 truncate text-muted-foreground" id={`${id}-description`}>
        {description}
      </span>
    </DropdownMenuCheckboxItem>
  );
}
