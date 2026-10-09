import { useState } from 'react';
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
  const mode: SessionExportMode = full ? 'full' : effects ? 'effects' : 'transcript';
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <DownloadIcon aria-hidden="true" /> Export session
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-72">
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
