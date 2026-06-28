import { render, screen, fireEvent, cleanup, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VersionBadge } from '../../src/components/VersionBadge.js';

afterEach(cleanup);

const REPO = {
  label: 'github.com/iowarp/clio-agent',
  url: 'https://github.com/iowarp/clio-agent',
  detail: 'CLIO backend',
};

describe('VersionBadge', () => {
  it('renders the version string', () => {
    render(() => <VersionBadge version="v0.3.0-2098-g31c252e7" dirty={false} />);
    const badge = screen.getByTestId('app-version-badge');
    expect(badge.textContent).toBe('v0.3.0-2098-g31c252e7');
    expect(badge.classList.contains('app-version-badge--dirty')).toBe(false);
  });

  it('flags a dirty build with the warning modifier + tooltip', () => {
    render(() => <VersionBadge version="v0.3.0-2098-g31c252e7-dirty" dirty={true} />);
    const badge = screen.getByTestId('app-version-badge');
    expect(badge.classList.contains('app-version-badge--dirty')).toBe(true);
    expect(badge.getAttribute('title')).toMatch(/uncommitted/i);
  });

  it('is a real button that opens the update panel on click', async () => {
    render(() => (
      <VersionBadge version="v1" backendRepository={null} resolveAppRow={async () => ({ label: 'App shell', current: 'v1', latest: 'v1' })} />
    ));
    expect(screen.queryByTestId('update-panel')).toBeNull();
    fireEvent.click(screen.getByTestId('app-version-badge'));
    await waitFor(() => expect(screen.getByTestId('update-panel')).toBeTruthy());
  });

  it('hides the backend row when the brand has no backendRepository', async () => {
    render(() => (
      <VersionBadge
        version="v1"
        backendRepository={null}
        resolveAppRow={async () => ({ label: 'App shell', current: 'v1', latest: 'v1' })}
      />
    ));
    fireEvent.click(screen.getByTestId('app-version-badge'));
    await waitFor(() => expect(screen.getByTestId('update-panel')).toBeTruthy());
    expect(screen.queryByTestId('update-row-backend')).toBeNull();
  });

  it('shows the backend row when the brand sets backendRepository', async () => {
    render(() => (
      <VersionBadge
        version="v1"
        backendRepository={REPO}
        backendInstalledVersion="0.1.0"
        fetchLatestBackend={vi.fn(async () => 'v0.5.2')}
        resolveAppRow={async () => ({ label: 'App shell', current: 'v1', latest: 'v1' })}
      />
    ));
    fireEvent.click(screen.getByTestId('app-version-badge'));
    await waitFor(() => expect(screen.getByTestId('update-row-backend')).toBeTruthy());
    expect(screen.getByTestId('update-row-backend-current').textContent).toBe('0.1.0');
  });

  it('web backend row is an info link (cannot install host software)', async () => {
    render(() => (
      <VersionBadge
        version="v1"
        inTauriOverride={false}
        backendRepository={REPO}
        backendInstalledVersion="0.1.0"
        fetchLatestBackend={vi.fn(async () => 'v0.5.2')}
        resolveAppRow={async () => ({ label: 'App shell', current: 'v1', latest: 'v1' })}
      />
    ));
    fireEvent.click(screen.getByTestId('app-version-badge'));
    await waitFor(() => expect(screen.getByTestId('update-row-backend-link')).toBeTruthy());
    expect(screen.getByTestId('update-row-backend-link').getAttribute('href')).toBe(REPO.url);
  });

  it('desktop backend update fires only behind the confirm gate', async () => {
    const trigger = vi.fn(async () => {});
    render(() => (
      <VersionBadge
        version="v1"
        inTauriOverride={true}
        backendRepository={REPO}
        backendInstalledVersion="0.1.0"
        fetchLatestBackend={vi.fn(async () => 'v0.5.2')}
        triggerBackendUpdate={trigger}
        resolveAppRow={async () => ({ label: 'App shell', current: 'v1', latest: 'v1' })}
      />
    ));
    fireEvent.click(screen.getByTestId('app-version-badge'));
    await waitFor(() => expect(screen.getByTestId('update-row-backend-update')).toBeTruthy());
    // First click arms confirm; the install must NOT fire yet.
    fireEvent.click(screen.getByTestId('update-row-backend-update'));
    expect(trigger).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('update-row-backend-confirm'));
    await waitFor(() => expect(trigger).toHaveBeenCalledTimes(1));
  });
});
