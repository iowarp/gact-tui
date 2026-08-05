import { useState, type CSSProperties, type ReactNode } from 'react';
import { Select } from '../kit';
import {
  PROSE_FONT_LABELS,
  PROSE_STACKS,
  TEXT_SIZE_SCALE,
  applyAppearance,
  loadAppearance,
  saveAppearance,
  type Appearance,
  type DiffPreviewLines,
  type ProseFont,
  type TextSize,
  type ThemePreset,
  type UiWidgetsMode,
} from '../theme/theme';

const SCALE_TO_SIZE: Record<number, TextSize> = Object.fromEntries(
  Object.entries(TEXT_SIZE_SCALE).map(([size, scale]) => [scale, size as TextSize]),
);

function sizeForScale(scale: number): TextSize {
  return SCALE_TO_SIZE[scale] ?? 'M';
}

/**
 * The prototype's Appearance controls are plain pill buttons (7px/14px
 * padding, 8px gap, 8px radius) — NOT the compact inset segmented-track
 * `Tabs` primitive used elsewhere (Ask/Execute, provider tabs). Reusing
 * Tabs here rendered a visibly different, cramped control; this is its own
 * small row so each caller stays a one-liner.
 */
function PillRow<T extends string>({
  label,
  activeId,
  options,
  onChange,
  minWidth,
}: {
  label: string;
  activeId: string;
  options: Array<{ id: T; label: ReactNode; style?: CSSProperties }>;
  onChange: (id: T) => void;
  minWidth?: number;
}) {
  return (
    <div className="settings__pillrow" role="group" aria-label={label}>
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className="settings__pill"
          aria-pressed={opt.id === activeId}
          style={minWidth ? { minWidth, ...opt.style } : opt.style}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Appearance — theme preset, prose stack, and the density/legibility knobs
 * the prototype exposes. Genuinely client-backed: these are preferences, not
 * backend state. Diff preview / UI widgets / locale persist for real
 * (theme.ts) but have no downstream consumer in this pass — see the settings
 * conformance report's wire-gap list.
 */
export function AppearancePage() {
  const [appearance, setAppearance] = useState(loadAppearance);

  function update(patch: Partial<Appearance>) {
    const next = { ...appearance, ...patch };
    setAppearance(next);
    saveAppearance(next);
    applyAppearance(next, document.documentElement);
  }

  return (
    <div className="settings__section">
      <h2 className="settings__title">Appearance</h2>
      <p className="settings__lede">Theme, density, and visual chrome.</p>

      <label className="settings__label">Theme preset</label>
      <PillRow
        label="Theme preset"
        activeId={appearance.theme}
        onChange={(id) => update({ theme: id as ThemePreset })}
        options={[
          { id: 'dark', label: 'Dark' },
          { id: 'dim', label: 'Dim' },
          { id: 'light', label: 'Light' },
        ]}
      />

      <label className="settings__label">Prose font</label>
      <PillRow
        label="Prose font"
        activeId={appearance.font}
        onChange={(id) => update({ font: id as ProseFont })}
        options={(Object.keys(PROSE_STACKS) as ProseFont[]).map((id) => ({
          id,
          label: PROSE_FONT_LABELS[id],
          // Each button previews its own face, matching the prototype's
          // per-row `font-family:{{ fb.ff }}` (apFonts in the ground truth).
          style: { fontFamily: PROSE_STACKS[id] },
        }))}
      />
      <span className="settings__caption">
        Applies to prose and UI text. Code and metadata stay monospace.
      </span>

      <label className="settings__label">Text size</label>
      <PillRow
        label="Text size"
        activeId={sizeForScale(appearance.scale)}
        onChange={(id) => update({ scale: TEXT_SIZE_SCALE[id] })}
        options={(['S', 'M', 'L', 'XL'] as TextSize[]).map((id) => ({ id, label: id }))}
        minWidth={44}
      />
      <span className="settings__caption">
        Scales all text. Browser zoom works independently.
      </span>

      <label className="settings__label">Diff preview</label>
      <PillRow
        label="Diff preview"
        activeId={String(appearance.diffPreviewLines)}
        onChange={(id) => update({ diffPreviewLines: Number(id) as DiffPreviewLines })}
        options={[3, 5, 8].map((n) => ({ id: String(n), label: `${n} lines` }))}
      />
      <span className="settings__caption">
        Change lines shown inline in transcript diffs before the pop-up takes over.
      </span>

      <label className="settings__label">UI widgets</label>
      <PillRow
        label="UI widgets"
        activeId={appearance.uiWidgets}
        onChange={(id) => update({ uiWidgets: id as UiWidgetsMode })}
        options={[
          { id: 'auto', label: 'Auto' },
          { id: 'always', label: 'Always expand' },
        ]}
      />
      <span className="settings__caption">
        Auto keeps tool widgets (mcp-ui) as compact chips and expands model widgets (a2ui). Always
        expand renders both inline.
      </span>

      <label className="settings__label">Transcript density</label>
      <div className="settings__pillrow">
        <button type="button" className="settings__pill">
          Verbose
        </button>
        <button type="button" className="settings__pill" aria-pressed="true">
          Normal ✓
        </button>
        <button type="button" className="settings__pill">
          Summary
        </button>
      </div>

      <label className="settings__label">Locale</label>
      <Select
        label="Locale"
        value={appearance.locale}
        options={[{ id: 'en-US', label: 'English (US) (en-US)' }]}
        onChange={(id) => update({ locale: id })}
      />
    </div>
  );
}
