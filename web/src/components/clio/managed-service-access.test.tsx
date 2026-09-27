import type { ManagedServiceDefinition } from '@clio/core/v3';
import { managedServiceDefinitionSchema } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ManagedServiceCard } from './managed-service-card';

afterEach(cleanup);

// Parsed through the real wire schema, the way the repository hands it to the UI.
const runtime = (
  id: 'llama_cpp' | 'ollama',
  overrides: Record<string, unknown> = {},
): ManagedServiceDefinition =>
  managedServiceDefinitionSchema.parse({
    id,
    category: 'model_runtime',
    label: id === 'ollama' ? 'Ollama' : 'llama.cpp',
    description: 'Model serving.',
    recommended_variant: 'cpu',
    variants: [
      {
        id: 'cpu',
        label: 'CPU',
        version: '1',
        install_type: 'container',
        artifact: 'img',
        compatible: true,
        reason: '',
      },
    ],
    configuration_fields: [
      {
        id: 'port',
        label: 'Port',
        placeholder: id === 'ollama' ? '11434' : '8088',
        required: false,
        options: [],
      },
    ],
    supports_stop: true,
    state: 'not_installed',
    supports_api_key: id !== 'ollama',
    ...overrides,
  });

function renderCard(service: ManagedServiceDefinition, configuration: Record<string, string> = {}) {
  const onConfiguration = vi.fn();
  render(
    <MemoryRouter>
      <ManagedServiceCard
        configuration={configuration}
        onAction={vi.fn()}
        onConfiguration={onConfiguration}
        onVariant={vi.fn()}
        service={service}
        variant="cpu"
      />
    </MemoryRouter>,
  );
  return { onConfiguration };
}

describe('who can use a managed model server', () => {
  it('is protected by a key by default; the shareable choice is off', () => {
    renderCard(runtime('llama_cpp'));

    const shareable = screen.getByRole('switch', { name: 'Shareable (no key)' });
    expect(shareable).not.toBeChecked();
    expect(screen.getByText(/protects it with a key it makes and sends for you/u)).toBeVisible();
  });

  it('turning shareable on writes the choice and says anyone who can reach the port can use it', async () => {
    const user = userEvent.setup();
    const { onConfiguration } = renderCard(runtime('llama_cpp'));

    await user.click(screen.getByRole('switch', { name: 'Shareable (no key)' }));

    expect(onConfiguration).toHaveBeenLastCalledWith('shareable', 'true');
  });

  it('a shareable deployment names the port anyone can reach', () => {
    renderCard(runtime('llama_cpp'), { shareable: 'true', port: '9000' });

    expect(screen.getByRole('switch', { name: 'Shareable (no key)' })).toBeChecked();
    expect(
      screen.getByText('Anyone who can reach port 9000 on this host can use it, with no key.'),
    ).toBeVisible();
  });

  it('Ollama offers no key and never looks protected', () => {
    renderCard(runtime('ollama'));

    expect(screen.queryByRole('switch', { name: 'Shareable (no key)' })).toBeNull();
    expect(
      screen.getByText(
        'Not protected: Ollama has no API key support, so anyone who can reach port 11434 on this host can use it.',
      ),
    ).toBeVisible();
  });

  it('an installed server shows who can use it, as the service checked it', () => {
    renderCard(
      runtime('llama_cpp', {
        state: 'running',
        access: {
          mode: 'api_key',
          detail: 'Protected by a key CLIO made for this deployment.',
          verified: true,
        },
      }),
    );

    const line = screen.getByText('Protected by a key CLIO made for this deployment.');
    expect(line.closest('[data-slot="service-access"]')).toHaveAttribute('data-mode', 'api_key');
    expect(screen.queryByRole('switch', { name: 'Shareable (no key)' })).toBeNull();
  });

  it('a server that did not enforce its key is shown as not protected', () => {
    renderCard(
      runtime('llama_cpp', {
        state: 'running',
        access: { mode: 'unprotected', detail: 'Not protected: the server accepted a request.' },
      }),
    );

    const line = screen.getByText('Not protected: the server accepted a request.');
    expect(line.closest('[data-slot="service-access"]')).toHaveAttribute(
      'data-mode',
      'unprotected',
    );
  });
});
