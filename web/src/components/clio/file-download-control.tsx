import { useMutation } from '@tanstack/react-query';
import { ChevronDownIcon, DownloadIcon, LoaderCircleIcon } from 'lucide-react';
import { toast } from 'sonner';
import { ButtonGroup } from '@/components/ui/button-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { fileFormatLabel } from '@/lib/media-types';
import type { FileViewerAction } from './file-viewer-action-context';
import { ToolbarAction } from './viewer-toolbar';

/** Download original bytes directly; alternate formats never replace the primary action. */
export function FileDownloadControl({
  name,
  mediaType,
  onDownload,
  formats = [],
  disabled = false,
}: {
  name: string;
  mediaType: string;
  onDownload: () => void | Promise<void>;
  formats?: readonly FileViewerAction[];
  disabled?: boolean;
}) {
  const original = useMutation({
    mutationFn: async () => onDownload(),
    onError: (error: Error) => toast.error(error.message),
  });
  const alternate = useMutation({
    mutationFn: async (action: FileViewerAction) => action.onSelect(),
    onError: (error: Error) => toast.error(error.message),
  });
  const busy = original.isPending || alternate.isPending;
  const format = fileFormatLabel(name, mediaType);
  return (
    <ButtonGroup aria-label="File download" className="shrink-0">
      <ToolbarAction
        label={format === 'File' ? 'Download file' : `Download ${format}`}
        disabled={disabled || busy}
        aria-busy={original.isPending}
        onClick={() => original.mutate()}
      >
        {original.isPending ? (
          <LoaderCircleIcon
            aria-hidden="true"
            className="animate-spin motion-reduce:animate-none"
          />
        ) : (
          <DownloadIcon aria-hidden="true" />
        )}
      </ToolbarAction>
      {formats.length ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <ToolbarAction
              label="Export to…"
              className="w-5"
              disabled={disabled || busy}
              aria-busy={alternate.isPending}
            >
              {alternate.isPending ? (
                <LoaderCircleIcon
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                />
              ) : (
                <ChevronDownIcon aria-hidden="true" />
              )}
            </ToolbarAction>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72 max-w-[calc(100vw-2rem)]">
            <DropdownMenuLabel>Export to…</DropdownMenuLabel>
            {formats.map((action) => (
              <DropdownMenuItem
                key={action.label}
                disabled={action.disabled}
                onSelect={() => alternate.mutate(action)}
              >
                <action.icon aria-hidden="true" />
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </ButtonGroup>
  );
}
