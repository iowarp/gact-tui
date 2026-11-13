import { toast } from 'sonner';
import { vocab } from '@/lib/brand-vocabulary';
import type { createRepository } from '@/lib/connection';
import { completeInstallerWebSearch } from '@/tauri/installer-options';
import { t } from '@lingui/core/macro';

/** Finish a current installer's native search choice without installing the optional gateway. */
export async function finishInstallerNativeSearch(
  repository: ReturnType<typeof createRepository>,
): Promise<void> {
  const { product } = vocab;
  const catalog = await repository.managedServiceCatalog('local');
  const service = catalog.services.find((candidate) => candidate.id === 'searxng');
  const variant = service?.variants.find((candidate) => candidate.compatible);
  if (!service || !variant) {
    toast.warning(t`${product} Search still needs setup`, {
      id: 'installer-web-search-needs-attention',
      description: service?.variants[0]?.reason || t`Open Infrastructure to inspect this computer.`,
    });
    return;
  }
  async function perform(action: 'install' | 'start'): Promise<void> {
    const operation = await repository.runManagedServiceAction('searxng', {
      target_id: 'local',
      action,
      variant_id: variant!.id,
      configuration: {},
    });
    for (let attempt = 0; attempt < 600; attempt += 1) {
      const result = await repository.infrastructureOperation(operation.id);
      if (result.state === 'succeeded') return;
      if (result.state === 'failed' || result.state === 'cancelled') {
        throw new Error(result.error || result.progress || 'Native search setup failed.');
      }
      await new Promise((resolve) => window.setTimeout(resolve, 500));
    }
    throw new Error('Native search setup is still running. Open Infrastructure for its progress.');
  }
  if (service.state !== 'running') {
    if (service.state !== 'stopped') await perform('install');
    await perform('start');
  }
  await completeInstallerWebSearch();
  toast.success(t`${product} Search is ready`, {
    id: 'installer-web-search-ready',
    description: t`Native web search is available to your agents. No Docker service is required.`,
  });
}
