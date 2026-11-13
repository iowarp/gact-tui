import { toast } from 'sonner';
import { openDownloads } from '@/tauri/downloads';
import { t } from '@lingui/core/macro';

/** Opens the desktop's Downloads panel (Ctrl+J), from the conversation bar or a browser frame. */
export function showDownloads() {
  void openDownloads().catch((error: unknown) => {
    toast.error(t`Unable to open downloads`, {
      description: error instanceof Error ? error.message : String(error),
    });
  });
}
