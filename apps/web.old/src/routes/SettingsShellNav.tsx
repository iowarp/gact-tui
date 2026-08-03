/**
 * Settings shell navigation: groups sections and renders the nav rail.
 * Exports {@link groupSettingsSections} and {@link SettingsShellNav}.
 */
import { For } from 'solid-js';
import { Icon } from '../components/Icon.js';
import { SETTINGS_SECTIONS, type SectionDef, type SettingsSection } from './settingsSections.js';

export interface SettingsSectionGroup {
  group: string;
  items: SectionDef[];
}

export function groupSettingsSections(sections: readonly SectionDef[]): SettingsSectionGroup[] {
  const out: SettingsSectionGroup[] = [];
  for (const section of sections) {
    let group = out.find((item) => item.group === section.group);
    if (!group) {
      group = { group: section.group, items: [] };
      out.push(group);
    }
    group.items.push(section);
  }
  return out;
}

export interface SettingsShellNavProps {
  activeSection: SettingsSection;
  onPickSection: (section: SettingsSection) => void;
}

export function SettingsShellNav(props: SettingsShellNavProps) {
  return (
    <nav class="settings-shell__nav" aria-label="Settings sections">
      <For each={groupSettingsSections(SETTINGS_SECTIONS)}>
        {(group) => (
          <>
            <div class="settings-shell__nav-group">{group.group}</div>
            <For each={group.items}>
              {(section) => (
                <button
                  type="button"
                  class={
                    'settings-shell__nav-btn ' +
                    (section.id === props.activeSection ? 'is-active' : '')
                  }
                  onClick={(event) => {
                    props.onPickSection(section.id);
                    // Drop focus so the clicked item does not keep a gray focus
                    // background that reads like a second active item.
                    event.currentTarget.blur();
                  }}
                  data-testid={`settings-nav-${section.id}`}
                >
                  <Icon name={section.icon} size={14} />
                  <span>{section.label}</span>
                </button>
              )}
            </For>
          </>
        )}
      </For>
    </nav>
  );
}
