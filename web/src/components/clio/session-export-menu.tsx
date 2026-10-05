import { useState } from 'react';
import type { SessionExportMode } from '@clio/core/v3';
import { DownloadIcon } from 'lucide-react';
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
        <DropdownMenuLabel>Transcript: one self-contained HTML</DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={effects}
          onSelect={(event) => event.preventDefault()}
          onCheckedChange={(value) => {
            setEffects(value === true);
            if (!value) setFull(false);
          }}
        >
          Effects: include session artifacts
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={full}
          onSelect={(event) => event.preventDefault()}
          onCheckedChange={(value) => {
            setFull(value === true);
            if (value) setEffects(true);
          }}
        >
          Full: include workspace files
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onExport(mode)}>
          <DownloadIcon aria-hidden="true" /> Download{' '}
          {mode === 'transcript' ? 'transcript HTML' : `${mode} archive`}
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
