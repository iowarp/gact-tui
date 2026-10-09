import type { ClioRepository, ProviderModelRefreshResult } from '@clio/core/v3';
import { vocab } from '@/lib/brand-vocabulary';

const UPDATE_STAGE = {
  checking: 'Checking client updates…',
  downloading: 'Downloading client…',
  installing: 'Updating client…',
  verifying: 'Checking updated client…',
  done: 'Finding models…',
  failed: 'Client update failed.',
} as const;
export type ProviderModelRefreshStage = (typeof UPDATE_STAGE)[keyof typeof UPDATE_STAGE];

/** Refresh the real client before discovering models; never invent account access. */
export async function refreshModelsWithClient({
  repository,
  providerId,
  providerKind,
  onStage,
}: {
  repository: Pick<
    ClioRepository,
    | 'providerComponents'
    | 'updateProviderComponents'
    | 'providerComponentUpdate'
    | 'refreshProviderModels'
  >;
  providerId: string;
  providerKind?: string;
  onStage: (stage: ProviderModelRefreshStage) => void;
}): Promise<{ result?: ProviderModelRefreshResult; notice?: string }> {
  const company = providerKind === 'codex' ? 'OpenAI' : 'Anthropic';
  const managedClient = providerKind === 'codex' || providerKind === 'claude_code';
  let updated = false;
  let restartRequired = false;
  let clientUnavailable = false;
  if (managedClient) {
    onStage(UPDATE_STAGE.checking);
    const status = await repository.providerComponents(providerId, { refresh: true });
    clientUnavailable = status.error?.code === 'component_no_installable_release';
    if (status.error && !clientUnavailable) throw new Error(status.error.message);
    if (!clientUnavailable && (status.update?.running || status.update_available)) {
      let job = status.update?.running
        ? status.update
        : await repository.updateProviderComponents(providerId);
      while (job.running) {
        onStage(UPDATE_STAGE[job.stage]);
        await new Promise<void>((resolve) => window.setTimeout(resolve, 700));
        job = await repository.providerComponentUpdate(providerId);
      }
      if (job.stage === 'failed')
        throw new Error(job.error?.message || 'Could not update the provider client.');
      updated = job.changed;
      restartRequired = job.restart_required;
    }
  }
  onStage('Finding models…');
  const results = await repository.refreshProviderModels([providerId]);
  const result = results[0];
  if (!result) throw new Error('The service returned no catalog result for this provider.');
  if (result.failed_reason) return { result };
  const notice = restartRequired
    ? `Model catalog refreshed. Client updated; restart ${vocab.agent} to use it.`
    : clientUnavailable
      ? `Model catalog refreshed. No compatible client update is available yet; wait for an official ${company} client release.`
      : !result.added.length
        ? managedClient
          ? `${updated ? 'Client updated' : 'Latest available client'}; no new models found. New models may need an official ${company} client update.`
          : 'Checked for new models; no new models found.'
        : `Found ${result.added.length} new ${result.added.length === 1 ? 'model' : 'models'}${updated ? ' after updating the client' : ''}.`;
  const waiting = result.rejected.filter(
    (row) => row.code === 'client_update_required' || row.code === 'client_version_unknown',
  );
  const requiredVersions = [
    ...new Set(waiting.map((row) => row.minimum_client_version).filter(Boolean)),
  ];
  const waitingSummary = restartRequired
    ? notice
    : clientUnavailable
      ? 'Catalog refreshed; no compatible client update is available yet.'
      : updated
        ? 'Client updated and catalog refreshed.'
        : 'Client is up to date; catalog refreshed.';
  return {
    result,
    notice: waiting.length
      ? `${waitingSummary} ${waiting.length} catalogued ${waiting.length === 1 ? 'model needs' : 'models need'} a newer ${company} client${requiredVersions.length ? ` (${requiredVersions.join(', ')} or later)` : ''}. Check again after an official client update.`
      : notice,
  };
}
