import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { useAppearancePreferences } from '@/providers/appearance-provider';
import { SaveBar } from './primitives/save-bar';
import { AppUpdateSettings } from './settings-app-updates';
import { SettingsNumberField } from './settings-general-number-field';
import { SettingsRow } from './settings-row';
import { SettingsSectionHeading } from './settings-section-heading';

interface TypedDraft {
  paste?: string;
  preview?: string;
}

function wholeNumber(value: string): number | undefined {
  const trimmed = value.trim();
  return /^\d+$/u.test(trimmed) ? Number(trimmed) : undefined;
}

/** App preferences shared by both hosts, with native controls gated by runtime. */
export function GeneralSettings() {
  const {
    collapseThreshold,
    setCollapseThreshold,
    hideDotFiles,
    setHideDotFiles,
    pasteSourceThreshold,
    setPasteSourceThreshold,
  } = useAppearancePreferences();
  const [draft, setDraft] = useState<TypedDraft>({});
  const paste = draft.paste ?? String(pasteSourceThreshold);
  const preview = draft.preview ?? String(collapseThreshold);
  const pasteValue = wholeNumber(paste);
  const previewValue = wholeNumber(preview);
  const pasteError = pasteValue === undefined ? 'Enter 0 or more.' : undefined;
  const previewError =
    previewValue === undefined || previewValue < 1 || previewValue > 50
      ? 'Enter 1 to 50.'
      : undefined;
  const pasteDirty = draft.paste !== undefined && pasteValue !== pasteSourceThreshold;
  const previewDirty = draft.preview !== undefined && previewValue !== collapseThreshold;
  const count = Number(pasteDirty) + Number(previewDirty);

  return (
    <div>
      <SettingsSectionHeading title="General" description="App preferences for this device." />
      <SettingsRow
        info="Text pastes at or above this many characters become clickable .txt attachments under Sources. Use 0 to keep all pastes inline."
        dirty={pasteDirty}
        error={pasteDirty ? pasteError : undefined}
        htmlFor="paste-source-threshold"
        title="Paste as source after"
      >
        <SettingsNumberField
          className="w-[8.5rem]"
          id="paste-source-threshold"
          invalid={pasteDirty && Boolean(pasteError)}
          min={0}
          onChange={(next) => setDraft((current) => ({ ...current, paste: next }))}
          unit="chars"
          value={paste}
        />
      </SettingsRow>
      <SettingsRow
        info="Show more opens the full result. Diff previews use twice this limit."
        dirty={previewDirty}
        error={previewDirty ? previewError : undefined}
        htmlFor="transcript-preview-lines"
        title="Transcript preview lines"
      >
        <SettingsNumberField
          id="transcript-preview-lines"
          invalid={previewDirty && Boolean(previewError)}
          max={50}
          min={1}
          onChange={(next) => setDraft((current) => ({ ...current, preview: next }))}
          unit="lines"
          value={preview}
        />
      </SettingsRow>
      <SettingsRow
        info="Hide dot-prefixed paths from the workspace Files view."
        htmlFor="hide-dot-files"
        inlineControl
        title="Hide dot files and folders"
      >
        <Switch id="hide-dot-files" checked={hideDotFiles} onCheckedChange={setHideDotFiles} />
      </SettingsRow>
      {inTauri() ? <AppUpdateSettings /> : null}
      <SaveBar
        count={count}
        invalid={Boolean((pasteDirty && pasteError) || (previewDirty && previewError))}
        onDiscard={() => setDraft({})}
        onSave={() => {
          if (pasteDirty && pasteValue !== undefined) setPasteSourceThreshold(pasteValue);
          if (previewDirty && previewValue !== undefined) setCollapseThreshold(previewValue);
          setDraft({});
        }}
      />
    </div>
  );
}
