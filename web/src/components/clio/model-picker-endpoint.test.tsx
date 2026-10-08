import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import {
  defaultConfiguration,
  options,
  renderPicker,
  repository,
  setWideViewport,
} from '@/test-fixtures/model-picker/provider-actions';
import { ClioModelPicker } from './model-picker';

vi.mock('@/hooks/use-repository', async () => {
  const fixtures = await import('@/test-fixtures/model-picker/provider-actions');
  return { useRepository: () => fixtures.repository };
});
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  for (const mock of Object.values(repository)) mock.mockReset();
});
beforeEach(() => {
  setWideViewport(true);
  repository.languageModelConfiguration.mockResolvedValue(defaultConfiguration);
  repository.providerCatalog.mockResolvedValue({ authoritative: 'live_handshake', providers: [] });
});
function Location() {
  return <output aria-label="Location">{useLocation().search}</output>;
}
async function open() {
  const user = userEvent.setup();
  renderPicker(
    <>
      <ClioModelPicker
        onChange={vi.fn()}
        options={options.map((row) =>
          row.providerId === 'local-vllm'
            ? { ...row, available: false, health: 'unavailable' }
            : row,
        )}
        provider="local-vllm"
        trigger={<Button>Change model</Button>}
      />
      <Location />
    </>,
  );
  await user.click(screen.getByRole('button', { name: 'Change model' }));
  return user;
}

it('saves and checks a new endpoint directly from a stopped provider without rebinding the model', async () => {
  repository.addSavedServer.mockResolvedValue({
    id: 'local-vllm',
    address: 'http://gpu-7:8100/v1',
    check: { reachable: true, models: ['Qwen'] },
  });
  const user = await open();
  await user.click(await screen.findByRole('button', { name: 'Change URL' }));
  const input = screen.getByRole('textbox', { name: 'Local vLLM URL' });
  await user.clear(input);
  await user.type(input, 'gpu-7:8100');
  await user.click(screen.getByRole('button', { name: 'Save and check' }));
  await waitFor(() =>
    expect(repository.addSavedServer).toHaveBeenCalledWith({
      address: 'http://gpu-7:8100/v1',
      preset_id: 'local-vllm',
      label: undefined,
    }),
  );
  expect(repository.updateLanguageModelConfiguration).not.toHaveBeenCalled();
});

it('keeps a failed endpoint save and its draft visible', async () => {
  repository.addSavedServer.mockRejectedValue(new Error('Could not save the server address.'));
  const user = await open();
  await user.click(await screen.findByRole('button', { name: 'Change URL' }));
  const input = screen.getByRole('textbox', { name: 'Local vLLM URL' });
  await user.clear(input);
  await user.type(input, 'http://gpu-7:8100/v1');
  await user.click(screen.getByRole('button', { name: 'Save and check' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save');
  expect(input).toHaveValue('http://gpu-7:8100/v1');
});

it('opens the selected provider settings and closes the model picker', async () => {
  const user = await open();
  await user.click(await screen.findByRole('button', { name: 'Provider settings' }));
  expect(screen.getByLabelText('Location')).toHaveTextContent('provider=local-vllm');
  expect(screen.queryByRole('dialog')).toBeNull();
});
