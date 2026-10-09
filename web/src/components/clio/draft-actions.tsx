import { BotIcon, ExternalLinkIcon, FolderIcon, PaperclipIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreIcon } from '@/lib/icon-vocabulary';

/** Workspace actions stay usable before the first message creates a session. */
export function ClioDraftActions({
  disabled,
  onOpen,
  onOpenSystemTerminal,
}: {
  disabled?: boolean;
  onOpen: (section: 'files' | 'resources' | 'blueprints') => void;
  onOpenSystemTerminal?: () => Promise<void>;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="New conversation actions"
          disabled={disabled}
          size="icon-xs"
          variant="ghost"
        >
          <MoreIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-64">
        <DropdownMenuItem onSelect={() => onOpen('files')}>
          <FolderIcon aria-hidden="true" /> Workspace files
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onOpen('resources')}>
          <PaperclipIcon aria-hidden="true" /> Attached resources
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onOpen('blueprints')}>
          <BotIcon aria-hidden="true" /> Agent blueprints
        </DropdownMenuItem>
        {onOpenSystemTerminal ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void onOpenSystemTerminal()}>
              <ExternalLinkIcon aria-hidden="true" /> Open in system terminal
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
