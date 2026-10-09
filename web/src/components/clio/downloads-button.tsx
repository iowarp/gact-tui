import { DownloadIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { openDownloads } from '@/tauri/downloads';

/** Opens the desktop's Downloads panel on both draft and saved conversations. */
export function ClioDownloadsButton() {
  if (!inTauri()) return null;
  return (
    <Button
      aria-label="Open downloads"
      className="shrink-0"
      onClick={() =>
        void openDownloads().catch((error: unknown) => {
          toast.error('Unable to open downloads', {
            description: error instanceof Error ? error.message : String(error),
          });
        })
      }
      size="icon-xs"
      title="Downloads (Ctrl+J)"
      variant="ghost"
    >
      <DownloadIcon aria-hidden="true" />
    </Button>
  );
}
