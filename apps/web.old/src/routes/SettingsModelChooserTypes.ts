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
  /** The thinking level currently in effect (#895), or undefined when unset. */
  activeThinkingLevel: Accessor<string | undefined>;
  /** The resolved per-provider thinking effect, for a display-only hint (#895). */
  activeThinkingEffective: Accessor<string | undefined>;
  onChanged: () => unknown;
}
