import { useId, useState } from 'react';
import type { SessionExportMode } from '@clio/core/v3';
import { BoxIcon, CheckIcon, DownloadIcon, FileTextIcon } from 'lucide-react';
import {
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { KeyMenuItem } from './menu-key-items';
import { ResponsiveMenuSub } from './responsive-menu-sub';

/**
 * One download: with nothing ticked it is the transcript as HTML; ticking
 * files makes it a ZIP of the transcript plus those files. Workspace files
 * imply the agent's artifacts.
 */
export function SessionExportMenu({ onExport }: { onExport: (mode: SessionExportMode) => void }) {
  const [effects, setEffects] = useState(false);
  const [full, setFull] = useState(false);
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
        icon={effects ? BoxIcon : FileTextIcon}
        label={effects ? 'Download ZIP' : 'Download HTML'}
        menuKey="S"
        onSelect={() => onExport(full ? 'full' : effects ? 'effects' : 'transcript')}
      />
    </>
  );
  return (
    <ResponsiveMenuSub icon={DownloadIcon} label="Export" width={260}>
      {options}
    </ResponsiveMenuSub>
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
