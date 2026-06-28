/**
 * Form for creating a scheduled run in the inspector schedules tab. Exports
 * {@link InspectorScheduleCreateForm}.
 */
import { createSignal, Show } from 'solid-js';
import { Icon } from './Icon.js';
import { humanizeCron, looksLikeCron } from './InspectorScheduleModel.js';

export function InspectorScheduleCreateForm(props: {
  onCreate: (body: { cron: string; prompt: string }) => void | Promise<void>;
}) {
  const [cron, setCron] = createSignal('');
  const [prompt, setPrompt] = createSignal('');
  const [busy, setBusy] = createSignal(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const c = cron().trim();
    const p = prompt().trim();
    if (!c || !p || busy()) return;
    setBusy(true);
    try {
      await props.onCreate({ cron: c, prompt: p });
      setCron('');
      setPrompt('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form class="inspector__schedule-form" onSubmit={submit}>
      <input
        class="inspector__schedule-input inspector__schedule-input--cron"
        type="text"
        placeholder="0 9 * * * (cron)"
        value={cron()}
        onInput={(event) => setCron(event.currentTarget.value)}
        data-testid="schedule-cron-input"
      />
      <input
        class="inspector__schedule-input"
        type="text"
        placeholder="Prompt to send on schedule"
        value={prompt()}
        onInput={(event) => setPrompt(event.currentTarget.value)}
        data-testid="schedule-prompt-input"
      />
      <button
        type="submit"
        class="inspector__schedule-add"
        disabled={busy() || !cron().trim() || !prompt().trim()}
        data-testid="schedule-add"
      >
        <Icon name="plus" size={12} />
        <span>Add</span>
      </button>
      <Show when={cron().trim()}>
        <span
          class={
            'inspector__schedule-preview ' +
            (looksLikeCron(cron()) ? '' : 'inspector__schedule-preview--bad')
          }
          data-testid="schedule-cron-preview"
          title={looksLikeCron(cron()) ? '' : 'Cron must be 5 (or 6) space-separated fields'}
        >
          {humanizeCron(cron())}
        </span>
      </Show>
    </form>
  );
}
