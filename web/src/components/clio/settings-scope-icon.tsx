import { BotIcon, FolderIcon, LaptopIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A settings scope's glyph: the device for App, a folder for the workspace, a bot for the
 * agent. All three are line glyphs; a filled brand mark reads as a solid square at this size.
 */
export function SettingsScopeIcon({ group, className }: { group: string; className?: string }) {
  const classes = cn('size-[0.9375rem] shrink-0', className);
  if (group === 'Agent') return <BotIcon aria-hidden="true" className={classes} />;
  if (group === 'Workspace') return <FolderIcon aria-hidden="true" className={classes} />;
  return <LaptopIcon aria-hidden="true" className={classes} />;
}
