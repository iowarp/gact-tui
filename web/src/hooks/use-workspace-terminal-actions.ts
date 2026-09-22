import { useCallback } from 'react';
import { toast } from 'sonner';
import type { ClioWorkbenchOpenRequest } from '@/components/clio/workbench';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { openWorkspaceTerminal } from '@/tauri/workspace-terminal';

/**
 * The session-context-bar terminal actions: the primary embedded-tab reveal
 * and the secondary "open in the OS's own terminal app" escape hatch. Both
 * are desktop (Tauri) only and need a known workspace path — extracted out
 * of `workspace-page.tsx` to keep that route under the frontend file-size
 * ratchet (`scripts/check_frontend_file_size.mjs`).
 */
export function useWorkspaceTerminalActions(
  workspacePath: string | undefined,
  revealWorkbench: (request: ClioWorkbenchOpenRequest) => void,
) {
  const available = inTauri() && Boolean(workspacePath);

  const onOpenSystemTerminal = useCallback(async () => {
    if (!workspacePath) return;
    try {
      await openWorkspaceTerminal(workspacePath);
    } catch (error) {
      toast.error('Could not open the workspace terminal', {
        description:
          error instanceof Error ? error.message : 'No supported terminal could be started.',
      });
    }
  }, [workspacePath]);

  const onOpenTerminal = useCallback(async () => {
    if (!workspacePath) return;
    revealWorkbench({ kind: 'terminal', cwd: workspacePath });
  }, [revealWorkbench, workspacePath]);

  return {
    onOpenSystemTerminal: available ? onOpenSystemTerminal : undefined,
    onOpenTerminal: available ? onOpenTerminal : undefined,
  };
}
