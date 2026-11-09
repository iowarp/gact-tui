import { brand } from '@brand';
import { BotIcon, FolderIcon, LaptopIcon } from 'lucide-react';
import { BrandIcon } from '@/components/clio/brand-icon';
import { cn } from '@/lib/utils';

/**
 * A settings scope's glyph: the device for App, a folder for the workspace, the
 * agent's mark. Scope glyphs are line icons in the text color, so the agent
 * uses the brand's monochrome icon and otherwise a line agent icon, never a
 * filled logo.
 */
export function SettingsScopeIcon({ group, className }: { group: string; className?: string }) {
  const classes = cn('size-[0.9375rem] shrink-0', className);
  if (group === 'Agent') {
    return brand.iconSvg ? (
      <BrandIcon className={classes} />
    ) : (
      <BotIcon aria-hidden="true" className={classes} />
    );
  }
  if (group === 'Workspace') return <FolderIcon aria-hidden="true" className={classes} />;
  return <LaptopIcon aria-hidden="true" className={classes} />;
}
