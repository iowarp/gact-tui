import type { ClioRepository, ProviderModelRefreshResult } from '@clio/core/v3';
import { vocab } from '@/lib/brand-vocabulary';
import { providerManagedClientVendor } from '@/lib/provider-presentation';
import { ph, plural, t } from '@lingui/core/macro';
import type { ProviderActionStage } from './provider-actions';

const { agent } = vocab;

const UPDATE_STAGE = {
  checking: 'client-checking',
  downloading: 'client-downloading',
  installing: 'client-updating',
  verifying: 'client-verifying',
  done: 'finding-models',
  failed: 'client-failed',
} as const satisfies Record<string, ProviderActionStage>;
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
  const vendor = providerManagedClientVendor(providerKind);
  const managedClient = vendor !== undefined;
  const company = vendor ?? t`provider`;
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
        throw new Error(job.error?.message || t`Could not update the provider client.`);
      updated = job.changed;
      restartRequired = job.restart_required;
    }
  }
  onStage('finding-models');
  const results = await repository.refreshProviderModels([providerId]);
  const result = results[0];
  if (!result) throw new Error(t`The service returned no catalog result for this provider.`);
  if (result.failed_reason) return { result };
  const notice = restartRequired
    ? t`Model catalog refreshed. Client updated; restart ${agent} to use it.`
    : clientUnavailable
      ? t`Model catalog refreshed. No compatible client update is available yet; wait for an official ${company} client release.`
      : !result.added.length
        ? managedClient
          ? updated
            ? t`Client updated; no new models found. New models may need an official ${company} client update.`
            : t`Latest available client; no new models found. New models may need an official ${company} client update.`
          : t`Checked for new models; no new models found.`
        : updated
          ? plural(result.added.length, {
              one: 'Found # new model after updating the client.',
              other: 'Found # new models after updating the client.',
            })
          : plural(result.added.length, {
              one: 'Found # new model.',
              other: 'Found # new models.',
            });
  const waiting = result.rejected.filter(
    (row) => row.code === 'client_update_required' || row.code === 'client_version_unknown',
  );
  const requiredVersions = [
    ...new Set(waiting.map((row) => row.minimum_client_version).filter(Boolean)),
  ];
  const waitingSummary = restartRequired
    ? notice
    : clientUnavailable
      ? t`Catalog refreshed; no compatible client update is available yet.`
      : updated
        ? t`Client updated and catalog refreshed.`
        : t`Client is up to date; catalog refreshed.`;
  return {
    result,
    notice: waiting.length
      ? t`${waitingSummary} ${ph({ waiting: waitingSentence(waiting.length, company, requiredVersions.join(', ')) })}`
      : notice,
  };
}

/** How many catalogued models wait for a newer client, as one sentence. */
function waitingSentence(count: number, company: string, versions: string): string {
  return versions
    ? plural(count, {
        one: `# catalogued model needs a newer ${company} client (${versions} or later). Check again after an official client update.`,
        other: `# catalogued models need a newer ${company} client (${versions} or later). Check again after an official client update.`,
      })
    : plural(count, {
        one: `# catalogued model needs a newer ${company} client. Check again after an official client update.`,
        other: `# catalogued models need a newer ${company} client. Check again after an official client update.`,
      });
}
