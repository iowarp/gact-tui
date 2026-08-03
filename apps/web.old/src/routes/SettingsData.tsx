/**
 * Data settings section (local data management/reset). Exports
 * {@link DataSection}.
 */
import { createSignal, Show } from 'solid-js';
import { Icon } from '../components/Icon.js';
import { SectionHeading } from '../components/SettingsPrimitives.js';
import { useToast } from '../components/Toast.js';
import { downloadSettings, importSettings } from '../settings-export.js';

export function DataSection() {
  const toast = useToast();
  const [importMsg, setImportMsg] = createSignal('');
  let fileInput: HTMLInputElement | undefined;

  function onExport() {
    const name = downloadSettings();
    toast.push({
      tone: 'success',
      title: 'Settings exported',
      body: name,
      duration: 3500,
    });
  }

  async function onImportFile(file: File) {
    try {
      const text = await file.text();
      const res = importSettings(text);
      setImportMsg(
        `Imported ${res.applied} preference${res.applied === 1 ? '' : 's'}` +
          (res.skipped ? ` (${res.skipped} skipped)` : '') +
          ' — reloading…',
      );
      toast.push({
        tone: 'success',
        title: 'Settings imported',
        body: `${res.applied} preferences applied`,
        duration: 2500,
      });
      // Reload so every signal re-reads its persisted value.
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      setImportMsg('');
      toast.push({
        tone: 'error',
        title: 'Import failed',
        body: e instanceof Error ? e.message : String(e),
        duration: 6000,
      });
    }
  }

  return (
    <section class="dp" data-testid="settings-data">
      <header class="dp__head">
        <div class="dp__title-block">
          <div class="dp__icon">
            <Icon name="share" size={20} />
          </div>
          <div>
            <h1 class="dp__title">Data &amp; backups</h1>
            <p class="dp__subtitle">Export and restore your local preferences.</p>
          </div>
        </div>
      </header>
      <div class="dp__body">
        <SectionHeading
          title="Export"
          hint={
            <>
              Downloads every local preference — theme, density, notification prefs, command
              history, pins, drafts — as a JSON file. Backend connections and their credentials are{' '}
              <strong>never</strong> included.
            </>
          }
        />
        <button
          type="button"
          class="ws-form__btn ws-form__btn--primary"
          style="margin-top: 8px"
          onClick={onExport}
          data-testid="settings-export-btn"
        >
          Export settings…
        </button>

        <SectionHeading
          title="Import"
          hint="Restores preferences from a previously exported file. Matching keys are overwritten; everything else keeps its current value. The app reloads after a successful import."
        />
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          data-testid="settings-import-file"
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            if (f) void onImportFile(f);
            e.currentTarget.value = '';
          }}
        />
        <button
          type="button"
          class="ws-form__btn"
          style="margin-top: 8px"
          onClick={() => fileInput?.click()}
          data-testid="settings-import-btn"
        >
          Import from file…
        </button>
        <Show when={importMsg()}>
          <p class="settings-shell__hint" data-testid="settings-import-result">
            {importMsg()}
          </p>
        </Show>
      </div>
    </section>
  );
}
