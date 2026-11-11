import { DownloadIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TOOLTIP_KEY } from '@/components/clio/primitives/tooltip-key';
import { useShortcut, useShortcutPresentation } from '@/lib/shortcuts/hooks';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { openDownloads } from '@/tauri/downloads';

function showDownloads() {
  void openDownloads().catch((error: unknown) => {
    toast.error('Unable to open downloads', {
      description: error instanceof Error ? error.message : String(error),
    });
  });
}

/** Opens the desktop's Downloads panel on both draft and saved conversations. */
export function ClioDownloadsButton() {
  const desktop = inTauri();
  useShortcut('downloads', showDownloads, { enabled: desktop });
  const keys = useShortcutPresentation('downloads');
  if (!desktop) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label="Open downloads"
          aria-keyshortcuts={keys?.aria}
          className="shrink-0"
          onClick={showDownloads}
          size="icon-xs"
          variant="ghost"
        >
          <DownloadIcon aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="flex items-center gap-2">
        Downloads
        {keys ? <kbd className={TOOLTIP_KEY}>{keys.text}</kbd> : null}
      </TooltipContent>
    </Tooltip>
  );
}
