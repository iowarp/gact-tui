/**
 * Discovery surface: Hooks Page component. Key export `HooksPage`.
 */
import { createResource, createSignal } from 'solid-js';
import type { HookEvent } from '@clio/core';
import { runAsyncAction } from '../../asyncAction.js';
import { DiscoveryPage } from '../../components/DiscoveryPage.js';
import { Icon } from '../../components/Icon.js';
import type { ClientPageProps } from './RoadmapTypes.js';
import {
  buildCreateHookBody,
  capabilityFlagBag,
  runtimeHookBackend,
  runtimeHookEvents,
  type HookHandlerKind,
} from './HooksPageModel.js';
import { HooksCreateForm, HooksRuntimePanel, HooksSavedPanel } from './HooksPageSections.js';
import './hooks-page.css';

/**
 * Hooks page. Two distinct surfaces, deliberately separated so the user
 * isn't misled about which hooks actually run on this build:
 *
 *  1. Runtime hooks (GAP 4) — the file-based Python handlers clio loaded
 *     from CLIO_HOOKS_DIR at boot. These are what FIRE during turns, but
 *     are read-only at runtime. Surfaced from `/v1/capabilities`
 *     (x_clio_hook_backend + x_clio_hook_events).
 *
 *  2. Declarative hooks (GAP 2 / GAP 5) — the editable `/v1/hooks` list.
 *     clio STORES these rows but does NOT yet dispatch them during turns
 *     on this build (storage-only). The editor sends the real wire shape
 *     ({event, command|url}); the previous {type, handler_uri} body 400'd.
 */
export function HooksPage(props: ClientPageProps) {
  const [data, { refetch }] = createResource(() =>
    props.client.hooks().catch(() => ({ hooks: [] })),
  );
  const items = () => data()?.hooks ?? [];

  // Runtime-hook status (read-only) from backend capabilities.
  const [caps] = createResource(() => props.client.capabilities().catch(() => null));
  // The hook fields live inside the nested `capabilities` flag bag. Bracket
  // access + cast-through-unknown because the wire CapabilityFlags index
  // signature is `boolean | undefined` (owned by another agent — not ours
  // to widen). Tolerate both the nested and the envelope-top-level shape.
  const flags = () => capabilityFlagBag(caps());
  const runtimeBackend = () => runtimeHookBackend(flags());
  const runtimeEvents = () => runtimeHookEvents(flags());

  const [hEvent, setHEvent] = createSignal<HookEvent>('pre_message');
  const [handlerKind, setHandlerKind] = createSignal<HookHandlerKind>('command');
  const [hValue, setHValue] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  async function submitNew(ev: SubmitEvent) {
    ev.preventDefault();
    const value = hValue().trim();
    if (!value || busy()) return;
    const body = buildCreateHookBody(hEvent(), handlerKind(), value);
    if (!body) return;
    await runAsyncAction(
      async () => {
        // Send whichever of command / url the user filled in. clio requires
        // a non-empty `event` plus exactly one of command|url.
        await props.client.createHook(body);
        setHValue('');
      },
      {
        setBusy,
        setError,
        afterSuccess: () => void refetch(),
      },
    );
  }

  async function removeHook(id: string) {
    await runAsyncAction(
      async () => {
        await props.client.deleteHook(id);
      },
      {
        setError,
        afterSuccess: () => void refetch(),
      },
    );
  }

  return (
    <DiscoveryPage
      icon="tool"
      title="Hooks"
      subtitle="Commands or webhooks connected to session events."
      actions={
        <button type="button" class="dp-iconbtn" onClick={() => refetch()} title="Refresh">
          <Icon name="regenerate" size={14} />
        </button>
      }
      loading={data.loading}
    >
      {/* GAP 4 — read-only runtime hook status from capabilities. */}
      <HooksRuntimePanel runtimeBackend={runtimeBackend()} runtimeEvents={runtimeEvents()} />

      {/* GAP 2 / GAP 5 — editable declarative hook list. */}
      <HooksSavedPanel
        items={items()}
        loading={data.loading}
        error={error()}
        onRemove={(id) => void removeHook(id)}
      />
      <HooksCreateForm
        event={hEvent()}
        handlerKind={handlerKind()}
        value={hValue()}
        busy={busy()}
        error={error()}
        onEventChange={setHEvent}
        onHandlerKindChange={setHandlerKind}
        onValueChange={setHValue}
        onSubmit={submitNew}
      />
    </DiscoveryPage>
  );
}
