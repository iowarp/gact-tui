import { toast } from 'sonner';
import { createRepository, type ConnectionSettings } from '@/lib/connection';
import { WEB_SEARCH_DEFAULT_LOCAL_URL, webSearchMcpArgs } from '@/lib/web-search-service';
import { completeInstallerWebSearch, readInstallerOptions } from '@/tauri/installer-options';

/** Finish the lightweight agent registration for infrastructure deployed by NSIS. */
export async function finishInstallerInfrastructure(settings: ConnectionSettings): Promise<void> {
  const options = await readInstallerOptions();
  if (options.web_search === 'not_requested' || options.web_search === 'configured') return;
  if (options.web_search !== 'deployed') {
    toast.warning('CLIO Search still needs setup', {
      id: 'installer-web-search-needs-attention',
      description: 'Open Infrastructure when Docker is installed and running to finish setup.',
    });
    return;
  }

  const repository = createRepository(settings);
  const result = await repository.configureMcpServer('web', {
    name: 'CLIO Web Search',
    transport: 'stdio',
    command: 'uvx',
    args: webSearchMcpArgs(WEB_SEARCH_DEFAULT_LOCAL_URL),
  });
  if (result.status !== 'ready') {
    toast.warning('CLIO Search was installed but is not ready', {
      id: 'installer-web-search-not-ready',
      description: result.error ?? 'Open Infrastructure to inspect the service.',
    });
    return;
  }
  await completeInstallerWebSearch();
  toast.success('CLIO Search is ready', {
    id: 'installer-web-search-ready',
    description: 'Web search and document reading are available to your agents.',
  });
}

/**
 * Whether the desktop installer's Infrastructure page recorded a request to
 * set up a local model runtime (llama.cpp). No runtime is installed by the
 * NSIS installer itself — this only tells the Services view whether to show
 * its "finish setup" prompt for managing one.
 */
export async function installerRequestedLlamaCpp(): Promise<boolean> {
  const options = await readInstallerOptions();
  return options.llama_cpp === 'requested';
}
