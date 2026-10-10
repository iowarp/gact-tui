import type { SessionExportMode } from '@clio/core/v3';
import { toast } from 'sonner';
import type { ResourceActions } from './resource-dialogs';
import { downloadUrl } from './surface-export';

/** Prepare and download the same service export from either session menu. */
export async function downloadSessionExport(
  actions: ResourceActions,
  endpoint: string,
  sessionId: string,
  title: string,
  mode: SessionExportMode,
): Promise<void> {
  const preparing = toast.loading(
    `Preparing ${mode === 'transcript' ? 'HTML' : 'ZIP'} export for ${title}…`,
  );
  try {
    const value = await actions.exportSession(sessionId, mode);
    // Retain a service base path, including the Desktop/dev remote proxy.
    downloadUrl(`${endpoint.replace(/\/$/u, '')}${value.download_path}`, value.filename);
  } finally {
    toast.dismiss(preparing);
  }
}
