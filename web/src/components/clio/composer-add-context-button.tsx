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
  onReturnFocus,
  pending = false,
  sourcesPending = false,
}: {
  attachments: boolean;
  contextReferences: boolean;
  disabled?: boolean;
  /** Capabilities are still loading: both controls hold their place, disabled. */
  pending?: boolean;
  /**
   * Connected data is still being probed: `+` holds its place, disabled, so it
   * becomes a menu (or not) before anyone can focus it, never while focused.
   */
  sourcesPending?: boolean;
  onOpenReferences: () => void;
  onOpenSources?: () => void;
  /** Files were chosen: typing resumes in the composer rather than on `+`. */
  onReturnFocus?: () => void;
}) {
  const files = usePromptInputAttachments();
  const attach = attachmentEnabled
    ? () => {
        const input = files.fileInputRef.current;
        if (input && onReturnFocus) {
          const done = (event: Event) => {
            input.removeEventListener('change', done);
            input.removeEventListener('cancel', done);
            if (event.type === 'change') onReturnFocus();
          };
          input.addEventListener('change', done);
          input.addEventListener('cancel', done);
        }
        files.openFileDialog();
      }
    : undefined;
  const single = attach && onOpenSources ? undefined : (attach ?? onOpenSources);
  const plusPending = pending || (Boolean(attach) && sourcesPending);
  const button = (
    <IconButton
      className="aria-expanded:bg-hover"
      disabled={disabled || plusPending}
      icon={<AddIcon />}
      label={attach || plusPending ? 'Attach files' : 'Add connected data'}
      onClick={single}
      size="toolbar"
      tooltipSide="top"
      type="button"
    />
  );
  return (
    <>
      {attach && onOpenSources && !plusPending ? (
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
      ) : single || plusPending ? (
        button
      ) : null}
      {contextReferences || pending ? (
        <IconButton
          disabled={disabled || pending}
          icon={<AtSignIcon />}
          label="Add a reference"
          onClick={onOpenReferences}
          shortcut="mention"
          shortcutSide="above-icon"
          size="toolbar"
          tooltipSide="top"
          type="button"
        />
      ) : null}
    </>
  );
}
