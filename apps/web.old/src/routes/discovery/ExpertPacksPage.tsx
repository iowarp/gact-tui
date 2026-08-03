/**
 * Discovery surface: Expert Packs Page component. Key export `ExpertPacksPage`.
 */
import { createResource, createSignal, For, Show } from 'solid-js';
import { runAsyncAction } from '../../asyncAction.js';
import { DiscoveryPage } from '../../components/DiscoveryPage.js';
import { Icon } from '../../components/Icon.js';
import { ExpertPackCard, ExpertPackInstallPanel } from './ExpertPackSections.js';
import { catalogScope, type ClientPageProps } from './RoadmapTypes.js';
import './hooks-page.css';

/** Expert packs. 0.5.3 exposes the install/update/delete lifecycle. */
export function ExpertPacksPage(props: ClientPageProps) {
  const [data, { refetch }] = createResource(() =>
    props.client.expertPacks(catalogScope(props.context)).catch(() => ({ packs: [] })),
  );
  const items = () => data()?.packs ?? [];

  const [panelOpen, setPanelOpen] = createSignal(false);
  const [sourceText, setSourceText] = createSignal('');
  const [scope, setScope] = createSignal<'workspace' | 'global'>(
    props.context?.workspaceId ? 'workspace' : 'global',
  );
  const [busy, setBusy] = createSignal(false);
  const [verdict, setVerdict] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  async function runExpertPackAction(action: () => Promise<void>) {
    await runAsyncAction(action, {
      setBusy,
      setError,
      before: () => setVerdict(null),
    });
  }

  async function submitInstall(ev: SubmitEvent) {
    ev.preventDefault();
    setError(null);
    setVerdict(null);
    const source = sourceText().trim();
    if (!source) {
      setError('Enter a source path, URL, or marketplace identifier.');
      return;
    }
    await runExpertPackAction(async () => {
      await props.client.installExpertPack({
        source,
        scope: scope(),
        ...(props.context?.workspaceId ? { workspace_id: props.context.workspaceId } : {}),
      });
      setVerdict('Installed. Refreshing expert packs.');
      setSourceText('');
      await refetch();
    });
  }

  async function validateSource() {
    const path = sourceText().trim();
    if (!path) {
      setError('Enter a source path, URL, or marketplace identifier.');
      return;
    }
    await runExpertPackAction(async () => {
      const v = await props.client.validateExpertPack({ path, scope: scope() });
      setVerdict(v.ok ? 'Source validates.' : (v.errors ?? []).join('; ') || 'Source is invalid.');
    });
  }

  async function updatePack(packId: string) {
    await runExpertPackAction(async () => {
      await props.client.updateExpertPack(packId, {
        scope: 'workspace',
        ...(props.context?.workspaceId ? { workspace_id: props.context.workspaceId } : {}),
      });
      setVerdict(`Updated ${packId}.`);
      await refetch();
    });
  }

  async function deletePack(packId: string) {
    await runExpertPackAction(async () => {
      await props.client.deleteExpertPack(packId, {
        scope: 'workspace',
        ...(props.context?.workspaceId ? { workspace_id: props.context.workspaceId } : {}),
      });
      setVerdict(`Deleted ${packId}.`);
      await refetch();
    });
  }

  return (
    <DiscoveryPage
      icon="sparkle"
      title="Expert packs"
      subtitle="Reusable agent bundles available to this backend."
      actions={
        <>
          <button
            type="button"
            class="dp-iconbtn"
            onClick={() => setPanelOpen((v) => !v)}
            title="Install expert pack"
            data-testid="expertpack-validate-toggle"
          >
            <Icon name="plus" size={14} />
          </button>
          <button type="button" class="dp-iconbtn" onClick={() => refetch()} title="Refresh">
            <Icon name="regenerate" size={14} />
          </button>
        </>
      }
      loading={data.loading}
      empty={!data.loading && items().length === 0 && !panelOpen()}
      emptyTitle="No expert packs installed"
      emptyBody="Install a pack source to make experts available in sessions."
    >
      <Show when={panelOpen()}>
        <ExpertPackInstallPanel
          sourceText={sourceText()}
          scope={scope()}
          workspaceId={props.context?.workspaceId}
          busy={busy()}
          onSourceText={setSourceText}
          onScope={setScope}
          onClose={() => setPanelOpen(false)}
          onValidate={() => void validateSource()}
          onSubmit={submitInstall}
        />
      </Show>
      <Show when={error()}>
        <p class="rmp__form-err" data-testid="expertpack-error">
          {error()}
        </p>
      </Show>
      <Show when={verdict()}>
        <p class="rmp__form-err rmp__form-ok" data-testid="expertpack-verdict">
          {verdict()}
        </p>
      </Show>
      <div class="dp__grid rmp__pack-grid">
        <For each={items()}>
          {(p) => (
            <ExpertPackCard
              pack={p}
              busy={busy()}
              onUpdate={(packId) => void updatePack(packId)}
              onDelete={(packId) => void deletePack(packId)}
            />
          )}
        </For>
      </div>
    </DiscoveryPage>
  );
}
