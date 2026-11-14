import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  connectorLogo: vi.fn(
    async (id: string, _signal?: AbortSignal, theme = 'light') =>
      `<svg data-id="${id}" data-theme="${theme}"/>`,
  ),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1' } }),
}));

import { ConnectorLogo } from './connector-need-rows';

function renderWith(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}

const images = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLImageElement>('[data-slot="connector-logo"]')].map((img) => ({
    variant: img.dataset.themeVariant ?? null,
    hidden: img.className.split(' ').includes('hidden'),
    dark: img.className.includes('dark:'),
    src: decodeURIComponent(img.src),
  }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ConnectorLogo (LG-D1)', () => {
  it('shows one logo on every theme when the row names no dark variant', async () => {
    const { container } = renderWith(
      <ConnectorLogo connector={{ id: 'geo', name: 'Geo', logo_url: '/v1/connectors/geo/logo' }} />,
    );
    await waitFor(() => expect(images(container)).toHaveLength(1));
    expect(images(container)[0]).toMatchObject({ variant: null, hidden: false, dark: false });
    expect(repository.connectorLogo).toHaveBeenCalledTimes(1);
    expect(repository.connectorLogo.mock.calls[0]?.[2]).toBe('light');
  });

  it('shows the light logo on a light theme and the dark one on a dark theme', async () => {
    const { container } = renderWith(
      <ConnectorLogo
        connector={{
          id: 'ndp',
          name: 'National Data Platform',
          logo_url: '/v1/connectors/ndp/logo',
          logo_dark_url: '/v1/connectors/ndp/logo?theme=dark',
        }}
      />,
    );
    await waitFor(() => expect(images(container)).toHaveLength(2));
    const [light, dark] = images(container);
    expect(light).toMatchObject({ variant: 'light', hidden: false });
    expect(light?.src).toContain('data-theme="light"');
    expect(dark).toMatchObject({ variant: 'dark', hidden: true });
    expect(dark?.src).toContain('data-theme="dark"');
    expect(container.querySelector('[data-slot="monogram"]')).toBeNull();
  });

  it('shows the monogram when there is no logo', () => {
    const { container } = renderWith(
      <ConnectorLogo connector={{ id: 'x', name: 'Home Lab', logo_url: null }} />,
    );
    expect(container.querySelector('[data-slot="monogram"]')?.textContent).toBe('HL');
    expect(repository.connectorLogo).not.toHaveBeenCalled();
  });
});
