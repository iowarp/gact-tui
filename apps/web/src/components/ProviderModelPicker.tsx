/**
 * Two-panel provider -> model picker for the composer.
 */
import { createMemo, createSignal, For, Show } from 'solid-js';
import { registerDocumentEvent } from '../domListeners.js';
import { Icon } from './Icon.js';
import type { DropdownItem } from './Dropdown.js';
import type { ModelOption, ModelProviderOption } from './ComposerTypes.js';

export interface ProviderModelPickerProps {
  providers: ModelProviderOption[];
  fallbackItems: DropdownItem<ModelOption>[];
  selectedModelId: string;
  selectedModelLabel: string;
  onPickModel: (model: ModelOption) => void;
}

export function ProviderModelPicker(props: ProviderModelPickerProps) {
  const [open, setOpen] = createSignal(false);
  const [activeProviderId, setActiveProviderId] = createSignal('');
  let rootRef: HTMLDivElement | undefined;

  const providers = createMemo(() => {
    if (props.providers.length > 0) return props.providers;
    return fallbackProviders(props.fallbackItems);
  });

  const selectedProvider = createMemo(() =>
    providers().find((provider) =>
      provider.models.some((model) => isSelectedModel(model, props.selectedModelId)),
    ),
  );

  const activeProvider = createMemo(() => {
    const id = activeProviderId() || selectedProvider()?.id || providers()[0]?.id || '';
    return providers().find((provider) => provider.id === id) ?? providers()[0];
  });

  const selectedLabel = createMemo(() => {
    const provider = selectedProvider();
    if (provider) return `${provider.label} / ${props.selectedModelLabel}`;
    return props.selectedModelLabel;
  });

  const onDocumentClick = (event: MouseEvent) => {
    if (!open()) return;
    if (rootRef && !rootRef.contains(event.target as Node)) setOpen(false);
  };
  registerDocumentEvent('click', onDocumentClick);

  return (
    <div ref={rootRef} class="pm" data-testid="composer-model">
      <button
        type="button"
        class="dd__trigger pm__trigger"
        aria-haspopup="listbox"
        aria-expanded={open()}
        data-testid="composer-model-trigger"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
          if (!activeProviderId()) setActiveProviderId(selectedProvider()?.id || providers()[0]?.id || '');
        }}
      >
        <Icon name="sparkle" size={10} />
        <span class="dd__trigger-label">{selectedLabel()}</span>
        <Icon name="chevron-down" size={10} />
      </button>
      <Show when={open()}>
        <div class="pm__menu" role="listbox" data-testid="composer-model-menu">
          <div class="pm__providers">
            <Show when={providers().length > 0} fallback={<div class="pm__empty">No providers</div>}>
              <For each={providers()}>
                {(provider) => (
                  <button
                    type="button"
                    class="pm__provider"
                    classList={{
                      'is-active': provider.id === activeProvider()?.id,
                      'is-disabled': !!provider.disabled,
                    }}
                    disabled={provider.disabled}
                    title={provider.detail}
                    data-testid={`composer-model-provider-${provider.id}`}
                    onMouseEnter={() => setActiveProviderId(provider.id)}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!provider.disabled) setActiveProviderId(provider.id);
                    }}
                  >
                    <span class="pm__provider-name">{provider.label}</span>
                    <span class={`pm__status pm__status--${provider.status}`}>
                      {provider.statusLabel}
                    </span>
                    <Icon name="chevron-right" size={10} />
                  </button>
                )}
              </For>
            </Show>
          </div>
          <div class="pm__models">
            <Show
              when={activeProvider() && activeProvider()!.models.length > 0}
              fallback={<div class="pm__empty">No models</div>}
            >
              <For each={activeProvider()!.models}>
                {(model) => (
                  <button
                    type="button"
                    class="pm__model"
                    classList={{ 'is-active': isSelectedModel(model, props.selectedModelId) }}
                    disabled={model.disabled || activeProvider()?.disabled}
                    data-testid={`composer-model-item-${model.id}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (model.disabled || activeProvider()?.disabled) return;
                      props.onPickModel(model);
                      setOpen(false);
                    }}
                  >
                    <span>{model.modelId}</span>
                    <Show when={isSelectedModel(model, props.selectedModelId)}>
                      <Icon name="check" size={12} />
                    </Show>
                  </button>
                )}
              </For>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}

function isSelectedModel(model: ModelOption, selectedModelId: string): boolean {
  return (
    model.id === selectedModelId ||
    `${model.providerId}/${model.modelId}` === selectedModelId ||
    model.modelId === selectedModelId
  );
}

function fallbackProviders(items: DropdownItem<ModelOption>[]): ModelProviderOption[] {
  const grouped = new Map<string, ModelProviderOption>();
  for (const item of items) {
    const model = item.value;
    const provider = grouped.get(model.providerId) ?? {
      id: model.providerId,
      label: model.providerLabel,
      status: 'ok' as const,
      statusLabel: 'ok',
      models: [],
    };
    provider.models.push(model);
    grouped.set(provider.id, provider);
  }
  return [...grouped.values()];
}
