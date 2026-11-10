import { AtSignIcon, DatabaseIcon, PaperclipIcon } from 'lucide-react';
import { usePromptInputAttachments } from '@/components/ai-elements/prompt-input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AddIcon } from '@/lib/icon-vocabulary';
import { IconButton } from './primitives/icon-button';
import { MenuRow } from './primitives/menu-row';

const MENU_ITEM = 'min-h-[30px] py-0 text-[12.5px]';

/**
 * The first two controls of the composer row: `+` attaches files and `@`
 * opens the reference picker. With both files and connected data on offer,
 * `+` opens a two-row menu; with one, it goes straight there. Files open the
 * system picker; there is no intermediate dialog.
 */
export function ComposerAddContextButtons({
  attachments: attachmentEnabled,
  contextReferences,
  disabled,
  onOpenReferences,
  onOpenSources,
}: {
  attachments: boolean;
  contextReferences: boolean;
  disabled?: boolean;
  onOpenReferences: () => void;
  onOpenSources?: () => void;
}) {
  const files = usePromptInputAttachments();
  const attach = attachmentEnabled ? () => files.openFileDialog() : undefined;
  const single = attach && onOpenSources ? undefined : (attach ?? onOpenSources);
  const button = (
    <IconButton
      className="aria-expanded:bg-hover"
      disabled={disabled}
      icon={<AddIcon />}
      label={attach ? 'Attach files' : 'Add connected data'}
      onClick={single}
      size="toolbar"
      tooltipSide="top"
      type="button"
    />
  );
  return (
    <>
      {attach && onOpenSources ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64" side="top">
            <DropdownMenuItem className={MENU_ITEM} onSelect={attach}>
              <MenuRow icon={<PaperclipIcon />} label="Upload files…" />
            </DropdownMenuItem>
            <DropdownMenuItem className={MENU_ITEM} onSelect={onOpenSources}>
              <MenuRow icon={<DatabaseIcon />} label="From connected data…" />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : single ? (
        button
      ) : null}
      {contextReferences ? (
        <IconButton
          disabled={disabled}
          icon={<AtSignIcon />}
          label="Add a reference"
          onClick={onOpenReferences}
          shortcut="mention"
          shortcutSide="under-icon"
          size="toolbar"
          tooltipSide="top"
          type="button"
        />
      ) : null}
    </>
  );
}
