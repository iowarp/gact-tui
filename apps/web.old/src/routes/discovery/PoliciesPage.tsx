/**
 * Discovery surface: Policies Page component. Key export `PoliciesPage`.
 */
import { createResource, createSignal, Show } from 'solid-js';
import { runAsyncAction } from '../../asyncAction.js';
import { DiscoveryPage } from '../../components/DiscoveryPage.js';
import { Icon } from '../../components/Icon.js';
import type { ClientPageProps } from './RoadmapTypes.js';
import {
  parsePolicyDraft,
  policyDocumentFromResponse,
  policyDraft,
  policyEntries,
} from './PoliciesPageModel.js';
import './hooks-page.css';

/** Policies: tool / command / memory autonomy gates. */
export function PoliciesPage(props: ClientPageProps) {
  const [data, { refetch }] = createResource(() => props.client.policies().catch(() => null));
  const policies = () => policyDocumentFromResponse(data());
  const entries = () => policyEntries(policies());

  const [draft, setDraft] = createSignal<string>('');
  const [editing, setEditing] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [saved, setSaved] = createSignal(false);

  function startEdit() {
    setDraft(policyDraft(policies()));
    setEditing(true);
    setError(null);
    setSaved(false);
  }

  function cancelEdit() {
    setEditing(false);
    setError(null);
  }

  async function saveEdit() {
    setError(null);
    setSaved(false);
    const parsed = parsePolicyDraft(draft());
    if (!parsed.ok) {
      setError(parsed.error ?? 'Invalid JSON');
      return;
    }
    await runAsyncAction(
      async () => {
        await props.client.putPolicies({ policies: parsed.value });
        setEditing(false);
        setSaved(true);
      },
      {
        setBusy,
        setError,
        afterSuccess: () => void refetch(),
      },
    );
  }

  return (
    <DiscoveryPage
      icon="agents"
      title="Policies"
      subtitle="Access rules for tools, commands, and memory."
      actions={
        <>
          <Show when={!editing()}>
            <button
              type="button"
              class="dp-iconbtn"
              onClick={startEdit}
              title="Edit policies"
              data-testid="policies-edit"
            >
              <Icon name="edit" size={14} />
            </button>
          </Show>
          <button type="button" class="dp-iconbtn" onClick={() => refetch()} title="Refresh">
            <Icon name="regenerate" size={14} />
          </button>
        </>
      }
      loading={data.loading}
      empty={!data.loading && entries().length === 0 && !editing() && !saved()}
      emptyTitle="No policy entries configured"
      emptyBody="The backend returned an empty policy list. Click Edit to review or add JSON policy entries."
    >
      <Show when={saved()}>
        <p class="rmp__form-err rmp__form-ok" data-testid="policies-save-result">
          ✓ Policies saved.
        </p>
      </Show>
      <Show
        when={editing()}
        fallback={
          <div class="rmp__pretty">
            <pre>{policyDraft(policies())}</pre>
          </div>
        }
      >
        <textarea
          class="rmp__editor"
          value={draft()}
          onInput={(e) => setDraft(e.currentTarget.value)}
          rows={16}
          data-testid="policies-editor"
        />
        <Show when={error()}>
          <p class="rmp__form-err">{error()}</p>
        </Show>
        <div class="rmp__editor-actions">
          <button type="button" class="ws-form__btn" onClick={cancelEdit} disabled={busy()}>
            Cancel
          </button>
          <button
            type="button"
            class="ws-form__btn ws-form__btn--primary"
            onClick={() => void saveEdit()}
            disabled={busy()}
            data-testid="policies-save"
          >
            {busy() ? 'Saving…' : 'Save policies'}
          </button>
        </div>
      </Show>
    </DiscoveryPage>
  );
}
