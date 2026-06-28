import { render, screen, cleanup, fireEvent, waitFor } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PLUGINS_KEY } from '../../src/plugins.js';
import { PluginsPage } from '../../src/routes/discovery/PluginsPage.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('PluginsPage', () => {
  it('registers, edits, and removes a plugin from the registry', async () => {
    render(() => <PluginsPage />);

    fireEvent.input(screen.getByTestId('plugin-name'), {
      target: { value: 'lint' },
    });
    fireEvent.input(screen.getByTestId('plugin-path'), {
      target: { value: '/usr/local/bin/eslint' },
    });
    fireEvent.input(screen.getByTestId('plugin-args'), {
      target: { value: '--fix\n--format=json' },
    });
    fireEvent.click(screen.getByTestId('plugin-save'));

    await waitFor(() => expect(screen.getByTestId(/plugin-card-/)).toBeTruthy());
    const stored = JSON.parse(localStorage.getItem(PLUGINS_KEY) ?? '[]') as Array<{
      id: string;
      args: string[];
    }>;
    expect(stored).toHaveLength(1);
    expect(stored[0]?.args).toEqual(['--fix', '--format=json']);

    const pluginId = stored[0]?.id ?? '';
    fireEvent.click(screen.getByTestId(`plugin-edit-${pluginId}`));
    fireEvent.input(screen.getByTestId('plugin-name'), {
      target: { value: 'lint repo' },
    });
    fireEvent.click(screen.getByTestId('plugin-save'));

    await waitFor(() =>
      expect(screen.getByTestId(`plugin-card-${pluginId}`).textContent).toContain(
        'lint repo',
      ),
    );

    fireEvent.click(screen.getByTestId(`plugin-remove-${pluginId}`));
    await waitFor(() =>
      expect(localStorage.getItem(PLUGINS_KEY)).toBeNull(),
    );
  });
});
