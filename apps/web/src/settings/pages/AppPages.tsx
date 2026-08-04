import { useRef, useState } from 'react';
import { listPlugins } from '../../wire/plugins';
import { downloadSettings, importSettings } from '../../wire/settings-export';
import { EmptyState, PageHeader } from './common';

/** Plugins — loaded from ~/.config/gact/plugins (wire/plugins.ts, a
 * localStorage-backed registry; execution needs the Tauri desktop shell but
 * the list itself is real in every shell). */
export function PluginsPage() {
  const [plugins] = useState(() => listPlugins());
  return (
    <>
      <PageHeader
        title="Plugins"
        subtitle="Loaded from ~/.config/gact/plugins/<name>/plugin.json."
      />
      {plugins.length === 0 ? (
        <EmptyState
          title="No plugins loaded"
          body="Drop a plugin folder into ~/.config/gact/plugins and restart the backend."
        />
      ) : (
        <div className="settings__list" data-gap="tight" style={{ maxWidth: 640 }}>
          {plugins.map((p) => (
            <div className="settings__row" key={p.id}>
              <div className="settings__rowbody">
                <span className="settings__rowname">{p.name}</span>
                <span className="settings__rowsub">{p.path}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** Data & backups — export/import every local preference (wire/settings-
 * export.ts), never the backend registry (credentials stay on the machine). */
export function DataBackupsPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);

  function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void file.text().then((raw) => {
      try {
        const result = importSettings(raw);
        setNote(`Imported ${result.applied} setting${result.applied === 1 ? '' : 's'}${result.skipped ? `, skipped ${result.skipped}` : ''}.`);
      } catch (err) {
        setNote(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <>
      <PageHeader
        title="Data & backups"
        subtitle="Export and restore your local preferences."
      />
      <p className="settings__lede" style={{ maxWidth: 520, lineHeight: 1.55 }}>
        Exports every local preference — theme, density, notification prefs, command history,
        pins, drafts — as a JSON file. Backend connections and their credentials are{' '}
        <strong style={{ color: 'var(--t-hd)' }}>never</strong> included.
      </p>
      <div className="settings__actions">
        <button
          type="button"
          className="settings__btn settings__btn--primary"
          onClick={() => {
            const name = downloadSettings();
            setNote(`Exported ${name}.`);
          }}
        >
          Export settings…
        </button>
        <button type="button" className="settings__btn" onClick={() => fileRef.current?.click()}>
          Import from file…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={onImportFile}
        />
      </div>
      {note ? <p className="settings__note">{note}</p> : null}
    </>
  );
}
