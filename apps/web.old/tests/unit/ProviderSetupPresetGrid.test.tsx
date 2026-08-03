import { createSignal } from 'solid-js';
import { render, screen, cleanup, fireEvent } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderSetupPresetGrid } from '../../src/components/ProviderSetupPresetGrid.js';
import type { LmPreset } from '../../src/components/ProviderSetup.js';

const PRESETS: LmPreset[] = [
  {
    id: 'ready',
    label: 'Ready Provider',
    provider: 'ready',
    api_base: 'ready://exec',
    suggested_model: 'model-ready',
    requires_api_key: false,
    auth_method: 'none',
    is_authenticated: true,
    status: 'ready',
  },
  {
    id: 'keyed',
    label: 'Keyed Provider',
    provider: 'keyed',
    api_base: 'https://example.test/v1',
    suggested_model: 'model-keyed',
    requires_api_key: true,
    auth_method: 'api_key',
    is_authenticated: false,
    status: 'unknown',
  },
];

afterEach(cleanup);

describe('ProviderSetupPresetGrid', () => {
  it('renders preset cards with status flags and emits picks', () => {
    const onPick = vi.fn();

    render(() => (
      <ProviderSetupPresetGrid
        presets={PRESETS}
        selected={() => null}
        apiKey={() => ''}
        busy={() => false}
        onPick={onPick}
        onCancelKey={() => undefined}
        onInputApiKey={() => undefined}
        onSubmitKey={(event) => event.preventDefault()}
      />
    ));

    expect(screen.getByTestId('provider-setup-card-ready').getAttribute('data-ready')).toBe('1');
    expect(screen.getByTestId('provider-setup-card-keyed').getAttribute('data-needs-key')).toBe(
      '1',
    );

    fireEvent.click(screen.getByTestId('provider-setup-card-keyed'));
    expect(onPick).toHaveBeenCalledWith(PRESETS[1]);
  });

  it('renders a selected key form and disables submit until a key is present', () => {
    const onSubmitKey = vi.fn((event: Event) => event.preventDefault());

    function Harness() {
      const [selected, setSelected] = createSignal<LmPreset | null>(PRESETS[1]!);
      const [apiKey, setApiKey] = createSignal('');
      return (
        <ProviderSetupPresetGrid
          presets={PRESETS}
          selected={selected}
          apiKey={apiKey}
          busy={() => false}
          onPick={() => undefined}
          onCancelKey={() => setSelected(null)}
          onInputApiKey={setApiKey}
          onSubmitKey={onSubmitKey}
        />
      );
    }

    render(() => <Harness />);

    const submit = screen.getByTestId('provider-setup-keysubmit-keyed') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.input(screen.getByTestId('provider-setup-keyinput-keyed'), {
      target: { value: 'sk-test' },
    });
    expect(submit.disabled).toBe(false);

    fireEvent.click(submit);
    expect(onSubmitKey).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByTestId('provider-setup-keyform-keyed')).toBeNull();
  });
});
