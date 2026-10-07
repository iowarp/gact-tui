import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { useAppearancePreferences } from '@/providers/appearance-provider';
import { AppUpdateSettings } from './settings-app-updates';
import { SettingsRow } from './settings-row';
import { SettingsSectionHeading } from './settings-section-heading';

/** App preferences shared by both hosts, with native controls gated by runtime. */
export function GeneralSettings() {
  const { collapseThreshold, setCollapseThreshold, hideDotFiles, setHideDotFiles } =
    useAppearancePreferences();
  return (
    <div className="grid gap-6">
      <SettingsSectionHeading title="General" description="App preferences for this device." />
      <div>
        <SettingsRow
          title="Transcript preview lines"
          htmlFor="transcript-preview-lines"
          description="Show more opens the full result. Diff previews use twice this limit."
        >
          <Input
            className="w-20"
            id="transcript-preview-lines"
            type="number"
            min={1}
            max={50}
            value={collapseThreshold}
            onChange={(event) => setCollapseThreshold(Number(event.target.value))}
          />
        </SettingsRow>
        <SettingsRow
          title="Hide dot files and folders"
          htmlFor="hide-dot-files"
          description="Hide dot-prefixed paths from the workspace Files view."
        >
          <Switch id="hide-dot-files" checked={hideDotFiles} onCheckedChange={setHideDotFiles} />
        </SettingsRow>
      </div>
      {inTauri() ? <AppUpdateSettings /> : null}
    </div>
  );
}
