/**
 * Prop/type contract for the SettingsModelChooser component and its state.
 */
import type { Accessor } from 'solid-js';
import type { Client, LmPreset } from '@clio/core';

export interface SettingsModelChooserProps {
  client: Client;
  presets: Accessor<LmPreset[]>;
  activeProvider: Accessor<string | undefined>;
  activeModel: Accessor<string | undefined>;
  onChanged: () => unknown;
}
