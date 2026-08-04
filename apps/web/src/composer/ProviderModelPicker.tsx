import { useEffect, useMemo, useState } from 'react';
import { Eyebrow, Icon, Popover, type SelectOption } from '../kit';
import './provider-model-picker.css';

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
}

/** Prototype two-pane picker: provider navigation left, model catalogue right. */
export function ProviderModelPicker({
  value,
  options,
  providers,
  thinkingLevel,
  onChange,
}: ProviderModelPickerProps) {
  const [open, setOpen] = useState(false);
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
      <Popover open={open} label="Model picker" placement="up" onClose={() => setOpen(false)}>
        <div className="provider-model-picker__head"><Eyebrow strong>providers</Eyebrow><span /><Icon name="tool" size={11} /><span>provider settings</span></div>
        <div className="provider-model-picker__panes">
          <div className="provider-model-picker__providers">
            {groups.map((provider) => (
              <button
                type="button"
                key={provider.id}
                data-active={provider.id === activeProvider?.id ? 'true' : undefined}
                onClick={() => setActiveProviderId(provider.id)}
              >
                <span>{provider.label}</span><small>{provider.statusLabel || provider.status || 'catalog'}</small>
              </button>
            ))}
          </div>
          <div className="provider-model-picker__models">
            <Eyebrow strong>models</Eyebrow>
            <div role="listbox" aria-label="Models">
              {(activeProvider?.models ?? []).map((model) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={model.value === value}
                  aria-label={model.label}
                  key={model.value}
                  onClick={() => {
                    onChange(model.value);
                    setOpen(false);
                  }}
                >
                  <span>{model.label}<small>{model.detail}</small></span>
                  {model.value === value ? <Icon name="check" /> : <Icon name="tool" size={10} />}
                </button>
              ))}
              {(activeProvider?.models.length ?? 0) === 0 ? <p>No models reported by this provider.</p> : null}
            </div>
          </div>
        </div>
        <div className="provider-model-picker__thinking"><Eyebrow strong>thinking</Eyebrow>{['default', 'off', 'low', 'medium', 'high'].map((level) => <span data-active={(thinkingLevel || 'default') === level ? 'true' : undefined} key={level}>{level}</span>)}</div>
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
