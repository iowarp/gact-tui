import { render, screen, fireEvent, cleanup, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { backendRow, UpdatePanel } from '../../src/components/UpdatePanel.js';

afterEach(cleanup);

const REPO = {
  label: 'github.com/iowarp/clio-agent',
  url: 'https://github.com/iowarp/clio-agent',
  detail: 'CLIO backend',
};

describe('backendRow', () => {
  it('returns undefined when the brand has no backendRepository', () => {
    expect(
      backendRow({ repository: null, installedVersion: '0.1.0', latestVersion: '0.5.2' }),
    ).toBeUndefined();
  });

  it('builds a row with an info link when no onUpdate (web)', () => {
    const row = backendRow({
      repository: REPO,
      installedVersion: '0.1.0',
      latestVersion: '0.5.2',
    });
    expect(row).toBeDefined();
    expect(row?.link?.label).toBe('Releases');
    expect(row?.link?.url).toBe(REPO.url);
    expect(row?.link?.title).toBe(REPO.label);
    expect(row?.onUpdate).toBeUndefined();
  });

  it('builds a row with an onUpdate action (desktop) and no link', () => {
    const onUpdate = vi.fn();
    const row = backendRow({
      repository: REPO,
      installedVersion: '0.1.0',
      latestVersion: '0.5.2',
      onUpdate,
    });
    expect(row?.onUpdate).toBe(onUpdate);
    expect(row?.link).toBeUndefined();
  });
});

describe('UpdatePanel', () => {
  it('hides the backend row when no backend row is supplied', () => {
    render(() => (
      <UpdatePanel
        open
        onClose={() => {}}
        app={{ label: 'App shell', current: 'v1', latest: 'v1' }}
      />
    ));
    expect(screen.getByTestId('update-row-app')).toBeTruthy();
    expect(screen.queryByTestId('update-row-backend')).toBeNull();
  });

  it('shows the backend row when supplied', () => {
    render(() => (
      <UpdatePanel
        open
        onClose={() => {}}
        app={{ label: 'App shell', current: 'v1', latest: 'v1' }}
        backend={{ label: 'CLIO backend', current: '0.1.0', latest: '0.5.2' }}
      />
    ));
    expect(screen.getByTestId('update-row-backend')).toBeTruthy();
  });

  it('requires the confirm gate before firing an update action', async () => {
    const onUpdate = vi.fn();
    render(() => (
      <UpdatePanel
        open
        onClose={() => {}}
        app={{ label: 'App shell', current: 'v1', latest: 'v2', onUpdate }}
      />
    ));
    // First click only arms the confirm step — the action must NOT fire yet.
    fireEvent.click(screen.getByTestId('update-row-app-update'));
    expect(onUpdate).not.toHaveBeenCalled();
    // The Confirm button is now present.
    const confirm = screen.getByTestId('update-row-app-confirm');
    fireEvent.click(confirm);
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
  });

  it('does not show an Update button when the row is up to date', () => {
    const onUpdate = vi.fn();
    render(() => (
      <UpdatePanel
        open
        onClose={() => {}}
        app={{ label: 'App shell', current: 'v2', latest: 'v2', onUpdate }}
      />
    ));
    expect(screen.queryByTestId('update-row-app-update')).toBeNull();
  });

  it('cancel backs out of the confirm gate without firing', () => {
    const onUpdate = vi.fn();
    render(() => (
      <UpdatePanel
        open
        onClose={() => {}}
        app={{ label: 'App shell', current: 'v1', latest: 'v2', onUpdate }}
      />
    ));
    fireEvent.click(screen.getByTestId('update-row-app-update'));
    fireEvent.click(screen.getByTestId('update-row-app-cancel'));
    expect(onUpdate).not.toHaveBeenCalled();
    // Back to the plain Update button.
    expect(screen.getByTestId('update-row-app-update')).toBeTruthy();
  });

  it('does not render anything when closed', () => {
    render(() => (
      <UpdatePanel
        open={false}
        onClose={() => {}}
        app={{ label: 'App shell', current: 'v1', latest: 'v1' }}
      />
    ));
    expect(screen.queryByTestId('update-panel')).toBeNull();
  });
});
