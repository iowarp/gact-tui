import { useEffect, useMemo, useState } from 'react';
import { Eyebrow, Icon, Popover, Splitter, type SelectOption } from '../kit';
import './provider-model-picker.css';

/** Measured on the prototype's own popRouter panel: default/min/max widths
 *  for the drag-to-resize handle (`pmDragW`, a left-edge col-resize strip —
 *  the SAME primitive as the rail's own pane splitters, just mounted on a
 *  floating popover instead of a fixed-layout divider). */
const DEFAULT_WIDTH = 480;
const MIN_WIDTH = 360;
const MAX_WIDTH = 720;

export interface ProviderModelRow {
  id: string;
  value: string;
  label: string;
  detail?: string;
}

export interface ProviderModelGroup {
  id: string;
  label: string;
  status?: string;
  statusLabel?: string;
  models: ProviderModelRow[];
}

export interface ProviderModelPickerProps {
  value: string;
  options: SelectOption[];
  providers?: ProviderModelGroup[];
  thinkingLevel?: string;
  onChange: (value: string) => void;
  /** Supplying this wires the header gear ("provider settings" in the
   *  prototype's popRouter head) to a real navigation target. Omitted =
   *  the gear is shown disabled, same visible-degraded convention as the
   *  composer's attach button. */
  onOpenProviderSettings?: () => void;
}

/** Readiness tone for a provider's status label — ready/green,
 *  needs-auth/amber, catalog trouble/red, anything else muted. Vocabulary
 *  is the real backend's (LmPreset.status via GET /v1/providers/lm), not
 *  the prototype's placeholder ready/no-key/signed-out/offline strings. */
function statusTone(status: string | undefined): 'ok' | 'warn' | 'error' | 'muted' {
  if (!status) return 'muted';
  const normalized = status.toLowerCase();
  if (normalized === 'ready' || normalized === 'configured') return 'ok';
  if (
    normalized.includes('auth') ||
    normalized.includes('missing_key') ||
    normalized.includes('not configured') ||
    normalized.includes('needs')
  ) {
    return 'warn';
  }
  if (normalized.includes('unavailable') || normalized.includes('error') || normalized.includes('offline')) {
    return 'error';
  }
  return 'muted';
}

/** Prototype two-pane picker: provider navigation left, model catalogue right. */
export function ProviderModelPicker({
  value,
  options,
  providers,
  thinkingLevel,
  onChange,
  onOpenProviderSettings,
}: ProviderModelPickerProps) {
  const [open, setOpen] = useState(false);
  // The panel is right-anchored (`right:0; left:auto`), so its left edge is
  // what the prototype's handle drags — dragging LEFT (negative pointer
  // delta) must WIDEN the panel. Splitter's own value convention grows with
  // a RIGHTWARD drag, so the width is stored negated to invert that mapping
  // rather than reaching into the primitive for a second, mirrored mode.
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const groups = useMemo(() => providers?.length ? providers : groupsFromOptions(options), [options, providers]);
  const selectedGroup = groups.find((group) => group.models.some((model) => model.value === value));
  const selectedGroupId = selectedGroup?.id;
  const [activeProviderId, setActiveProviderId] = useState(selectedGroup?.id ?? groups[0]?.id ?? '');

  useEffect(() => {
    if (selectedGroupId) setActiveProviderId(selectedGroupId);
  }, [selectedGroupId]);

  useEffect(() => {
    if (!activeProviderId && groups[0]) setActiveProviderId(groups[0].id);
  }, [activeProviderId, groups]);

  const activeProvider = groups.find((group) => group.id === activeProviderId) ?? groups[0];
  const selectedModel = groups.flatMap((group) => group.models).find((model) => model.value === value);
  const selectedLabel = selectedModel
    ? `${selectedGroup?.label || activeProvider?.label || ''} / ${selectedModel.label}`
    : value || 'model not set';

  return (
    <span className="provider-model-picker">
      <button
        type="button"
        className="provider-model-picker__trigger"
        role="combobox"
        aria-label="Model"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selectedLabel}</span><span aria-hidden="true">⌄</span>
      </button>
      <Popover
        open={open}
        label="Model picker"
        placement="up"
        style={{ width: `${width}px` }}
        onClose={() => setOpen(false)}
      >
        <span className="provider-model-picker__resize">
          <Splitter
            label="Resize model picker"
            value={-width}
            min={-MAX_WIDTH}
            max={-MIN_WIDTH}
            onResize={(next) => setWidth(-next)}
          />
        </span>
        <div className="provider-model-picker__head">
          {/* Measured on the prototype's own popRouter head: plain
              10.5px/.1em/muted, not the rail's bold section-header weight. */}
          <Eyebrow>providers</Eyebrow>
          <span />
          {/* clio-agent has no session-scoped "which provider config panel" deep
              link yet — this opens Settings generally (same convention as the
              rail's own settings gear) rather than pretending to land on a
              specific tab. Shown disabled + flagged when no opener at all is
              wired, never a silent no-op click. */}
          <button
            type="button"
            className="provider-model-picker__settingsgear"
            title="Provider settings"
            aria-label="Provider settings"
            data-unbacked={onOpenProviderSettings ? undefined : 'true'}
            disabled={!onOpenProviderSettings}
            onClick={() => {
              onOpenProviderSettings?.();
              setOpen(false);
            }}
          >
            <Icon name="tool" size={11} />
          </button>
        </div>
        <div className="provider-model-picker__panes">
          <div className="provider-model-picker__providers">
            {groups.map((provider) => (
              <button
                type="button"
                className="provider-model-picker__provider"
                key={provider.id}
                data-active={provider.id === activeProvider?.id ? 'true' : undefined}
                onClick={() => setActiveProviderId(provider.id)}
              >
                <span>{provider.label}</span>
                <small data-tone={statusTone(provider.status)}>
                  {provider.statusLabel || provider.status || 'catalog'}
                </small>
              </button>
            ))}
          </div>
          <div className="provider-model-picker__models">
            <div role="listbox" aria-label="Models">
              {(activeProvider?.models ?? []).map((model) => {
                const active = model.value === value;
                return (
                  <div className="provider-model-picker__modelrow" key={model.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      aria-label={model.label}
                      onClick={() => {
                        onChange(model.value);
                        setOpen(false);
                      }}
                    >
                      <span>{model.label}<small>{model.detail}</small></span>
                      {active ? <Icon name="check" /> : <span aria-hidden="true" />}
                    </button>
                    {/* Sampling params ("saved per model on this provider" in the
                        prototype) have no wire surface — PATCH /v1/sessions/{id}
                        carries only {provider_id, model_id, variant}, and `variant`
                        is never populated from a real per-model settings store.
                        Shown and flagged rather than omitted. */}
                    <button
                      type="button"
                      className="provider-model-picker__modelgear"
                      title="Model settings — sampling overrides are not wired yet"
                      aria-label={`${model.label} settings`}
                      data-unbacked="true"
                      disabled
                    >
                      <Icon name="tool" size={10} />
                    </button>
                  </div>
                );
              })}
              {(activeProvider?.models.length ?? 0) === 0 ? <p>No models reported by this provider.</p> : null}
            </div>
          </div>
        </div>
        {/* Measured on the prototype's own thinking row: plain eyebrow, same
            as the header above — not bold. */}
        <div className="provider-model-picker__thinking"><Eyebrow>thinking</Eyebrow>{['default', 'off', 'low', 'medium', 'high'].map((level) => <span data-active={(thinkingLevel || 'default') === level ? 'true' : undefined} key={level}>{level}</span>)}</div>
      </Popover>
    </span>
  );
}

function groupsFromOptions(options: SelectOption[]): ProviderModelGroup[] {
  const byProvider = new Map<string, ProviderModelGroup>();
  for (const option of options) {
    const detail = typeof option.detail === 'string' ? option.detail : '';
    const providerLabel = detail || option.label.split(' / ')[0] || 'models';
    const modelLabel = detail ? option.label : option.label.split(' / ').at(-1) || option.label;
    const id = providerLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const group = byProvider.get(id) ?? { id, label: providerLabel, models: [] };
    group.models.push({ id: option.id, value: option.id, label: modelLabel });
    byProvider.set(id, group);
  }
  return [...byProvider.values()];
}
