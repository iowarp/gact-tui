/**
 * Discovery surface: Blueprints Page component. Key export `BlueprintsPage`.
 */
import { createResource, createSignal, For, Show } from 'solid-js';
import { DiscoveryPage } from '../../components/DiscoveryPage.js';
import { Icon } from '../../components/Icon.js';
import { BlueprintCard, BlueprintInstallPanel } from './BlueprintSections.js';
import { BlueprintSourcesPanel } from './BlueprintSourcesPanel.js';
import { catalogScope, type ClientPageProps } from './RoadmapTypes.js';
import './hooks-page.css';

/** Agent blueprints (#386 / #387). Read + install + uninstall. */
export function BlueprintsPage(props: ClientPageProps) {
  const [data, { refetch }] = createResource(() =>
    props.client.agentBlueprints(catalogScope(props.context)).catch(() => ({ blueprints: [] })),
  );
  const items = () => data()?.blueprints ?? [];

  const [installOpen, setInstallOpen] = createSignal(false);
  const [pathText, setPathText] = createSignal('');
  const [refText, setRefText] = createSignal('');
  const [scope, setScope] = createSignal<'workspace' | 'global'>(
    props.context?.workspaceId ? 'workspace' : 'global',
  );
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [verdict, setVerdict] = createSignal<string | null>(null);

  const workspaceScope = () => ({
    ...(props.context?.workspaceId ? { workspace_id: props.context.workspaceId } : {}),
    ...(props.context?.sessionId ? { session_id: props.context.sessionId } : {}),
  });

  function openInstallSource(source: string, ref?: string) {
    setPathText(source);
    setRefText(ref ?? '');
    setInstallOpen(true);
  }

  async function uninstall(id: string, name: string, bpScope?: string) {
    if (!confirm(`Uninstall blueprint "${name}"? This cannot be undone.`)) return;
    setError(null);
    setVerdict(null);
    try {
      // Pass the blueprint's own scope so global installs can actually be
      // matched (clio's DELETE defaults to workspace scope) — W2 wire fix.
      await props.client.uninstallAgentBlueprint(
        id,
        bpScope === 'global' || bpScope === 'workspace'
          ? {
              scope: bpScope,
              ...(bpScope === 'workspace' && props.context?.workspaceId
                ? { workspace_id: props.context.workspaceId }
                : {}),
            }
          : undefined,
      );
      setVerdict(`Uninstalled ${name}.`);
      void refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function submitInstall(ev: SubmitEvent) {
    ev.preventDefault();
    setError(null);
    setVerdict(null);
    const src = pathText().trim();
    const ref = refText().trim();
    if (!src) {
      setError('Enter a blueprint path on the backend host, or a git URL.');
      return;
    }
    // clio validates a blueprint on DISK by path; a git/URL source is
    // cloned only at install time, so only path sources can be pre-validated.
    const looksRemote = /:\/\//.test(src) || src.startsWith('git@');
    setBusy(true);
    try {
      if (!looksRemote) {
        const v = await props.client.validateAgentBlueprint({
          path: src,
          scope: scope(),
          ...workspaceScope(),
        });
        if (!v.ok) {
          setError(`Validation failed: ${v.errors.join('; ') || 'no detail'}`);
          return;
        }
      }
      await props.client.installAgentBlueprint({
        source: src,
        ...(ref ? { ref } : {}),
        scope: scope(),
        ...(scope() === 'workspace' && props.context?.workspaceId
          ? { workspace_id: props.context.workspaceId }
          : {}),
      });
      setVerdict('Installed. Refreshing blueprints.');
      setPathText('');
      setRefText('');
      setInstallOpen(false);
      void refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DiscoveryPage
      icon="agents"
      title="Agent blueprints"
      subtitle="DSPy + MCP descriptor bundles the orchestrator can route into. Install one by path on the backend host or from a git URL."
      actions={
        <button type="button" class="dp-iconbtn" onClick={() => refetch()} title="Refresh">
          <Icon name="regenerate" size={14} />
        </button>
      }
      loading={data.loading}
    >
      <Show when={installOpen()}>
        <BlueprintInstallPanel
          pathText={pathText()}
          refText={refText()}
          scope={scope()}
          workspaceId={props.context?.workspaceId}
          busy={busy()}
          onPathText={setPathText}
          onRefText={setRefText}
          onScope={setScope}
          onClose={() => {
            setInstallOpen(false);
            setRefText('');
          }}
          onSubmit={submitInstall}
        />
      </Show>
      <Show when={error()}>
        <p class="rmp__form-err" data-testid="blueprint-error">
          {error()}
        </p>
      </Show>
      <Show when={verdict()}>
        <p class="rmp__form-err rmp__form-ok" data-testid="blueprint-verdict">
          {verdict()}
        </p>
      </Show>
      <BlueprintSourcesPanel
        client={props.client}
        blueprints={items()}
        onInstallSource={openInstallSource}
      />
      <h2 class="dp__section-title">Installed blueprints</h2>
      <Show when={!data.loading && items().length === 0}>
        <div class="dp__empty" data-testid="blueprints-empty" style="padding-block: 16px">
          <div class="dp__empty-icon">
            <Icon name="agents" size={28} />
          </div>
          <h2 class="dp__empty-title">No blueprints installed</h2>
          <p class="dp__empty-body">
            Install one by path on the backend host or a git URL via the + button, or register a
            source above to scan a registry.
          </p>
        </div>
      </Show>
      <div class="dp__grid rmp__blueprint-grid">
        <For each={items()}>
          {(bp) => (
            <BlueprintCard
              blueprint={bp}
              onUninstall={(id, name, bpScope) => void uninstall(id, name, bpScope)}
            />
          )}
        </For>
      </div>
    </DiscoveryPage>
  );
}
