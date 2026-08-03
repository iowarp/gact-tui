import { useState } from 'react';
import { Tabs } from '../kit';
import {
  PROSE_STACKS,
  applyAppearance,
  loadAppearance,
  saveAppearance,
  type ProseFont,
  type ThemePreset,
} from '../theme/theme';

/**
 * Appearance — the prototype's three theme presets, prose stack and type
 * scale. Genuinely client-backed: these are preferences, not backend state.
 */
export function AppearancePage() {
  const [appearance, setAppearance] = useState(loadAppearance);

  function update(patch: Partial<typeof appearance>) {
    const next = { ...appearance, ...patch };
    setAppearance(next);
    saveAppearance(next);
    applyAppearance(next, document.documentElement);
  }

  return (
    <div className="settings__section">
      <h2 className="settings__title">Appearance</h2>

      <label className="settings__label">Theme</label>
      <Tabs
        label="Theme"
        activeId={appearance.theme}
        onChange={(id) => update({ theme: id as ThemePreset })}
        tabs={[
          { id: 'dim', label: 'dim' },
          { id: 'dark', label: 'dark' },
          { id: 'light', label: 'light' },
        ]}
      />

      <label className="settings__label">Prose font</label>
      <Tabs
        label="Prose font"
        activeId={appearance.font}
        onChange={(id) => update({ font: id as ProseFont })}
        tabs={Object.keys(PROSE_STACKS).map((id) => ({ id, label: id }))}
      />

      <label className="settings__label" htmlFor="type-scale">
        Type scale — {appearance.scale.toFixed(2)}×
      </label>
      <input
        id="type-scale"
        className="settings__range"
        type="range"
        min={0.85}
        max={1.4}
        step={0.05}
        value={appearance.scale}
        onChange={(e) => update({ scale: Number(e.currentTarget.value) })}
      />
    </div>
  );
}
