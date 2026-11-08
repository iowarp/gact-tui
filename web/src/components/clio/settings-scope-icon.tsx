import { FolderIcon, LaptopIcon } from 'lucide-react';
import { BrandIcon } from '@/components/clio/brand-icon';
import { cn } from '@/lib/utils';

/** A settings scope's glyph: the device for App, a folder for the workspace, the agent's mark. */
export function SettingsScopeIcon({ group, className }: { group: string; className?: string }) {
  const classes = cn('size-[0.9375rem] shrink-0', className);
  if (group === 'Agent') return <BrandIcon className={classes} />;
  if (group === 'Workspace') return <FolderIcon aria-hidden="true" className={classes} />;
  return <LaptopIcon aria-hidden="true" className={classes} />;
}
